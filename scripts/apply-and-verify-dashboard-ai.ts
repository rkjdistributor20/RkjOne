/**
 * Apply Cadangan AI Semua (production DB) + uji dashboard staf.
 * Usage: npx tsx scripts/apply-and-verify-dashboard-ai.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  adviseUserDashboard,
  dashboardMetadataPatch,
  mergeMetadata,
  type DashboardProfileId,
} from '../lib/settings/dashboard-advisor';
import { staffQuickActionsFromMetadata } from '../lib/settings/dashboard-quick-actions';
import { isGroupOwnerMetadata } from '../lib/hr/group-owner';
import type { UserRole } from '../types/enums';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';
const verifyOnly = process.argv.includes('--verify-only');
const DEFAULT_PASSWORD = 'RkjOne@2025';
const GO_LIVE_PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');

function readPassword() {
  if (process.env.GO_LIVE_PASSWORD?.trim()) return process.env.GO_LIVE_PASSWORD.trim();
  if (fs.existsSync(GO_LIVE_PASSWORD_FILE)) {
    const line = fs
      .readFileSync(GO_LIVE_PASSWORD_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (line) return line;
  }
  return DEFAULT_PASSWORD;
}

const LOGIN_PASSWORD = readPassword();

async function findUserByEmail(email: string) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function resetUserPassword(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return { ok: false as const, reason: 'Auth user tiada' };
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: LOGIN_PASSWORD,
    email_confirm: true,
  });
  if (error) return { ok: false as const, reason: error.message };
  await admin.from('profiles').update({ must_change_password: false }).eq('id', user.id);
  return { ok: true as const, userId: user.id };
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = {
  ...loadEnvFile(path.join(ROOT, '.env.local')),
  ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error('Missing Supabase env (.env.local)');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey);

const STAFF_TESTS: Array<{
  email: string;
  label: string;
  expectedProfile: DashboardProfileId;
  expectedHrefs: string[];
}> = [
  {
    email: 's001@rkj.com',
    label: 'Staf kiosk RKJ (ELSA)',
    expectedProfile: 'STAFF_KIOSK',
    expectedHrefs: ['/shifts', '/pos'],
  },
  {
    email: 'faridlc08@gmail.com',
    label: 'Pemandu (Farid · LOGISTICS)',
    expectedProfile: 'LOGISTICS',
    expectedHrefs: ['/fleet'],
  },
];

function ok(label: string, detail?: string) {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, detail?: string) {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

let passed = 0;
let failed = 0;

function check(okay: boolean, label: string, detail?: string) {
  if (okay) {
    ok(label, detail);
    passed++;
  } else {
    fail(label, detail);
    failed++;
  }
}

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  metadata: unknown;
  organization_id: string;
  legal_entity: { code: string } | { code: string }[] | null;
};

type StaffLinkRow = {
  profile_id: string | null;
  worker_type: string | null;
  legal_entity: { code: string } | { code: string }[] | null;
};

async function applyBulkDashboardAi(orgId: string) {
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, full_name, email, role, metadata, organization_id, legal_entity:legal_entities(code)')
    .eq('organization_id', orgId)
    .eq('status', 'ACTIVE');

  if (error) throw new Error(error.message);

  const profileIds = (rows ?? []).map((r) => (r as { id: string }).id);
  const { data: staffRows } = profileIds.length
    ? await admin
        .from('staff')
        .select('profile_id, worker_type, status, legal_entity:legal_entities(code)')
        .eq('organization_id', orgId)
        .eq('status', 'ACTIVE')
        .in('profile_id', profileIds)
    : { data: [] };

  const staffByProfile = new Map<
    string,
    Array<{ legal_entity_code: string; worker_type: string | null }>
  >();

  for (const s of (staffRows ?? []) as StaffLinkRow[]) {
    if (!s.profile_id) continue;
    const le = Array.isArray(s.legal_entity) ? s.legal_entity[0] : s.legal_entity;
    const list = staffByProfile.get(s.profile_id) ?? [];
    list.push({
      legal_entity_code: le?.code ?? 'RKJ',
      worker_type: s.worker_type,
    });
    staffByProfile.set(s.profile_id, list);
  }

  let applied = 0;
  const summary = new Map<DashboardProfileId, number>();

  for (const row of (rows ?? []) as ProfileRow[]) {
    const entity = Array.isArray(row.legal_entity) ? row.legal_entity[0] : row.legal_entity;
    const employments = staffByProfile.get(row.id) ?? [];
    const advice = adviseUserDashboard({
      role: row.role as UserRole,
      legal_entity_code: entity?.code ?? null,
      staff_employments: employments,
      is_group_owner: isGroupOwnerMetadata(row.metadata),
    });

    const patch = dashboardMetadataPatch(advice);
    const { error: updErr } = await admin
      .from('profiles')
      .update({
        metadata: mergeMetadata(row.metadata, patch),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (!updErr) {
      applied++;
      summary.set(advice.profile_id, (summary.get(advice.profile_id) ?? 0) + 1);
    }
  }

  return { total: rows?.length ?? 0, applied, summary };
}

async function verifyStaffAccount(test: (typeof STAFF_TESTS)[number]) {
  let { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
    email: test.email,
    password: LOGIN_PASSWORD,
  });

  if (signErr?.message?.includes('Invalid login') || signErr?.message?.includes('Invalid credentials')) {
    const fixed = await resetUserPassword(test.email);
    if (fixed.ok) {
      ({ data: signIn, error: signErr } = await anon.auth.signInWithPassword({
        email: test.email,
        password: LOGIN_PASSWORD,
      }));
      ok(`Reset password ${test.email}`, 'lalai UAT');
    }
  }

  check(!signErr && !!signIn?.session, `Login ${test.email}`, signErr?.message);

  const userId = signIn.user?.id;
  if (!userId) {
    check(false, `Profil ${test.email}`, 'tiada user id');
    return;
  }

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('full_name, role, metadata')
    .eq('id', userId)
    .single();

  check(!profErr && !!profile, `Muat profil ${test.email}`, profErr?.message);

  const meta = profile?.metadata;
  const dashProfile =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).dashboard_profile
      : null;
  const dashLabel =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).dashboard_label
      : null;

  check(
    dashProfile === test.expectedProfile,
    `${test.label} — profil dashboard`,
    `${String(dashProfile)} (label: ${String(dashLabel)})`
  );

  const actions = staffQuickActionsFromMetadata(meta);
  const hrefs = actions.map((a) => a.href).sort();
  const expected = [...test.expectedHrefs].sort();
  check(
    JSON.stringify(hrefs) === JSON.stringify(expected),
    `${test.label} — quick actions`,
    hrefs.join(', ') || '(kosong)'
  );

  await anon.auth.signOut();
}

async function main() {
console.log('\n=== RKJ One — Cadangan AI Dashboard (Apply + UAT) ===\n');
console.log(`Production: ${PRODUCTION_URL}`);
console.log(`Supabase: ${url}\n`);

console.log('1. Cadangan AI Semua (DB production)');

const { data: owner } = await admin
  .from('profiles')
  .select('organization_id')
  .ilike('email', 'matisa@rkj.com')
  .maybeSingle();

if (!owner?.organization_id) {
  console.error('  ✗ Tiada profil owner matisa@rkj.com');
  process.exit(1);
}

if (verifyOnly) {
  ok('Apply', 'dilangkau (--verify-only)');
} else {
  try {
    const { total, applied, summary } = await applyBulkDashboardAi(owner.organization_id);
    check(applied === total, 'Apply semua pengguna aktif', `${applied}/${total}`);
    const breakdown = [...summary.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}:${n}`)
      .join(' · ');
    ok('Pecahan profil', breakdown);
  } catch (e) {
    fail('Apply bulk', e instanceof Error ? e.message : String(e));
    failed++;
  }
}

console.log('\n2. UAT login staf + quick actions');

for (const test of STAFF_TESTS) {
  console.log(`\n  — ${test.label}`);
  await verifyStaffAccount(test);
}

console.log('\n---');
console.log(`Hasil: ${passed} lulus, ${failed} gagal\n`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
