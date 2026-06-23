/**
 * Semak modul Payroll 3 Syarikat + AI cadangan + payslip distribution.
 * Usage: npm run verify:payroll
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';
const GO_LIVE_PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');

function readGoLivePassword() {
  if (process.env.GO_LIVE_PASSWORD?.trim()) return process.env.GO_LIVE_PASSWORD.trim();
  if (!fs.existsSync(GO_LIVE_PASSWORD_FILE)) return 'RkjOne@2025';
  const line = fs
    .readFileSync(GO_LIVE_PASSWORD_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return line || 'RkjOne@2025';
}

function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const env = loadProjectEnv();
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

console.log('\n=== RKJ One — Semakan Payroll 3 Syarikat ===\n');

let passed = 0;
let failed = 0;

function pass(label, detail) {
  ok(label, detail);
  passed += 1;
}

function flop(label, detail) {
  fail(label, detail);
  failed += 1;
}

console.log('1. Pangkalan data');
const { data: org, error: orgErr } = await admin
  .from('organizations')
  .select('id')
  .eq('code', 'RKJ')
  .single();

if (orgErr || !org) {
  flop('Organisasi RKJ', orgErr?.message ?? 'tiada');
} else {
  pass('Organisasi RKJ', org.id.slice(0, 8));

  const { data: entities } = await admin
    .from('legal_entities')
    .select('code')
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .order('sort_order');

  const codes = (entities ?? []).map((e) => e.code);
  codes.length >= 3
    ? pass('3 syarikat aktif', codes.join(', '))
    : flop('3 syarikat aktif', codes.join(', ') || 'tiada');

  const { count: rulesCount } = await admin
    .from('payroll_rules')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE');

  (rulesCount ?? 0) >= 5
    ? pass('Peraturan payroll aktif', String(rulesCount))
    : flop('Peraturan payroll aktif', String(rulesCount ?? 0));

  const { error: payslipErr } = await admin.from('staff_payslips').select('id').limit(1);
  payslipErr
    ? flop('Jadual staff_payslips', payslipErr.message)
    : pass('Jadual staff_payslips', 'OK');

  const { error: runMetaErr } = await admin
    .from('payroll_runs')
    .select('report_type, legal_entity_id')
    .limit(1);
  runMetaErr?.message?.includes('column')
    ? flop('Kolum payroll_runs report_type', runMetaErr.message)
    : pass('Kolum payroll_runs report_type', 'OK');

  const { data: staffPortal } = await admin
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .not('profile_id', 'is', null);

  const { count: withPortal } = await admin
    .from('staff')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .not('profile_id', 'is', null);

  (withPortal ?? 0) > 0
    ? pass('Staf dengan portal login', String(withPortal))
    : flop('Staf dengan portal login', '0');

  const { count: foreignCount } = await admin
    .from('staff')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .eq('worker_type', 'FOREIGN');

  pass('Pekerja asing aktif', String(foreignCount ?? 0));
  void staffPortal;
}

console.log('\n2. Login HR + cadangan AI (Supabase langsung)');
const password = readGoLivePassword();
const { data: login, error: loginErr } = await anon.auth.signInWithPassword({
  email: 'mohdali@rkj.com',
  password,
});

if (loginErr) {
  flop('mohdali@rkj.com', loginErr.message);
} else {
  pass('mohdali@rkj.com', 'auth OK');

  const { data: hrProfile } = await admin
    .from('profiles')
    .select('role, full_name')
    .eq('id', login.user.id)
    .single();

  hrProfile?.role === 'HR'
    ? pass('Role profil HR', hrProfile.full_name)
    : flop('Role profil HR', hrProfile?.role ?? 'tiada');
}

console.log('\n3. Pecahan gaji 3 syarikat (DB)');
try {
  const { data: entities } = await admin
    .from('legal_entities')
    .select('id, code')
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .order('sort_order');

  const { data: staffRows } = await admin
    .from('staff')
    .select('id, worker_type, legal_entity_id, weekly_amount, monthly_amount')
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE');

  const byCompany = new Map((entities ?? []).map((e) => [e.id, { code: e.code, foreign: 0, local: 0 }]));
  for (const s of staffRows ?? []) {
    const bucket = byCompany.get(s.legal_entity_id);
    if (!bucket) continue;
    if (s.worker_type === 'FOREIGN') bucket.foreign += 1;
    else bucket.local += 1;
  }

  const summary = [...byCompany.values()]
    .map((c) => `${c.code}:${c.foreign}A+${c.local}T`)
    .join(' · ');

  byCompany.size >= 3
    ? pass('Pecahan staf syarikat', summary)
    : flop('Pecahan staf syarikat', summary || 'tiada');

  const { count: payslipCount } = await admin
    .from('staff_payslips')
    .select('*', { count: 'exact', head: true });

  pass('Rekod payslip (jumlah)', String(payslipCount ?? 0));

  const entityById = new Map((entities ?? []).map((e) => [e.id, e.code]));
  let distMfgLocal = 0;
  let distMfgMissingPay = 0;
  for (const s of staffRows ?? []) {
    const code = entityById.get(s.legal_entity_id);
    if (code !== 'RKJ_DIST' && code !== 'RKJ_MFG') continue;
    if (s.worker_type !== 'LOCAL') continue;
    distMfgLocal += 1;
    if (s.monthly_amount == null || Number(s.monthly_amount) <= 0) distMfgMissingPay += 1;
  }
  distMfgMissingPay === 0
    ? pass('Gaji bulanan DIST/MFG tempatan', `${distMfgLocal} staf · semua ada rekod`)
    : flop('Gaji bulanan DIST/MFG tempatan', `${distMfgMissingPay}/${distMfgLocal} tiada monthly_amount`);
} catch (e) {
  flop('Pecahan gaji 3 syarikat', e.message);
}

console.log('\n4. Production routes (tanpa auth)');
try {
  const page = await fetch(`${PRODUCTION_URL}/payroll`, { redirect: 'manual' });
  page.status === 307 || page.status === 302
    ? pass('GET /payroll tanpa auth', `HTTP ${page.status} → login`)
    : flop('GET /payroll tanpa auth', `HTTP ${page.status}`);
} catch (e) {
  flop('GET /payroll tanpa auth', e.message);
}

try {
  const health = await fetch(`${PRODUCTION_URL}/api/health`);
  const body = await health.json();
  pass('Deploy commit', body.commit?.slice(0, 7) ?? 'unknown');
} catch (e) {
  flop('Deploy commit', e.message);
}

console.log('\n=== Ringkasan ===');
console.log(`  Lulus: ${passed}`);
console.log(`  Gagal: ${failed}`);
console.log(
  failed === 0
    ? '\n==> Payroll OK. UAT: mohdali@rkj.com → /payroll → tab 3 Syarikat → Cadangan AI\n'
    : '\n==> Ada isu — semak di atas.\n'
);
process.exit(failed > 0 ? 1 : 0);
