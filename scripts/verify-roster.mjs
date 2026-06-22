/**
 * Semak migration jadual staf mingguan (00062) + aliran asas roster
 * Usage: npm run verify:roster
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
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

const env = { ...loadEnvFile(path.join(ROOT, '.env.local')), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error('Missing Supabase env in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function getNextMondayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const toMon = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + toMon);
  return d.toISOString().slice(0, 10);
}

console.log('\n=== Semakan Jadual Staf Mingguan (00062) ===\n');

let failed = 0;

const tables = ['weekly_roster_plans', 'weekly_roster_entries', 'weekly_roster_reminder_log'];
for (const t of tables) {
  const { error } = await admin.from(t).select('id').limit(1);
  if (error) {
    fail(`Table ${t}`, error.message);
    failed++;
  } else {
    ok(`Table ${t}`, 'wujud');
  }
}

const { error: rpcErr } = await admin.rpc('publish_weekly_roster', {
  p_plan_id: '00000000-0000-0000-0000-000000000000',
});
if (rpcErr?.message?.includes('Roster plan not found') || rpcErr?.message?.includes('Not authenticated')) {
  ok('RPC publish_weekly_roster', 'wujud');
} else if (rpcErr) {
  fail('RPC publish_weekly_roster', rpcErr.message);
  failed++;
} else {
  ok('RPC publish_weekly_roster', 'wujud');
}

const { data: safuanAuth, error: authErr } = await admin.auth.signInWithPassword({
  email: 'safuan@rkj.com',
  password: 'RkjOne@2025',
});

if (authErr || !safuanAuth.session) {
  fail('Login safuan@rkj.com', authErr?.message ?? 'no session — semak kata laluan UAT');
  console.log('  → Langkau ujian terbitkan AM (perlu login sah)\n');
} else {
  ok('Login safuan@rkj.com', 'OK');

  const amClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${safuanAuth.session.access_token}` } },
  });

  const { data: profile } = await amClient
    .from('profiles')
    .select('id, organization_id, region_id')
    .eq('id', safuanAuth.user.id)
    .single();

  const { data: regionBranches } = await admin
    .from('branches')
    .select('id, branch_code')
    .eq('region_id', profile.region_id)
    .eq('status', 'ACTIVE')
    .order('branch_code');

  const branch = regionBranches?.[0];
  if (!branch) {
    fail('Cawangan Utara', 'tiada');
    failed++;
  } else {
    ok('Cawangan ujian', branch.branch_code);

    const weekStart = getNextMondayIso();
    const { data: staffRows } = await admin
      .from('staff')
      .select('id')
      .eq('branch_id', branch.id)
      .eq('status', 'ACTIVE')
      .limit(3);

    const { data: templates } = await admin
      .from('shift_templates')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .limit(1);

    const templateId = templates?.[0]?.id ?? null;

    let planId;
    const { data: existingPlan } = await admin
      .from('weekly_roster_plans')
      .select('id, status')
      .eq('branch_id', branch.id)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    if (existingPlan?.status === 'PUBLISHED') {
      planId = existingPlan.id;
      ok('Plan mingguan', `sedia ada (PUBLISHED) ${weekStart}`);
    } else {
      if (existingPlan) {
        await admin.from('weekly_roster_entries').delete().eq('plan_id', existingPlan.id);
        await admin.from('weekly_roster_plans').delete().eq('id', existingPlan.id);
      }

      const { data: newPlan, error: planErr } = await admin
        .from('weekly_roster_plans')
        .insert({
          organization_id: profile.organization_id,
          branch_id: branch.id,
          week_start_date: weekStart,
          created_by: profile.id,
        })
        .select('id')
        .single();

      if (planErr || !newPlan) {
        fail('Cipta plan', planErr?.message ?? 'unknown');
        failed++;
      } else {
        planId = newPlan.id;
        const entries = [];
        for (const s of staffRows ?? []) {
          for (let d = 0; d < 7; d++) {
            entries.push({
              plan_id: planId,
              staff_id: s.id,
              day_index: d,
              is_off: d === 6,
              template_id: d === 6 ? null : templateId,
            });
          }
        }
        const { error: entErr } = await admin.from('weekly_roster_entries').insert(entries);
        if (entErr) {
          fail('Simpan entries', entErr.message);
          failed++;
        } else {
          ok('Simpan entries', `${entries.length} slot`);
        }
      }
    }

    if (planId && existingPlan?.status !== 'PUBLISHED') {
      const { data: pubData, error: pubErr } = await amClient.rpc(
        'publish_weekly_roster',
        { p_plan_id: planId }
      );
      if (pubErr) {
        fail('Terbitkan (sebagai AM)', pubErr.message);
        failed++;
      } else {
        ok('Terbitkan (sebagai AM)', `${pubData?.shifts_created ?? 0} syif`);
      }
    }

    const { data: statusPlans } = await admin
      .from('weekly_roster_plans')
      .select('branch_id, status')
      .eq('week_start_date', weekStart)
      .in(
        'branch_id',
        (regionBranches ?? []).map((b) => b.id)
      );
    ok('Status roster Utara', `${statusPlans?.filter((p) => p.status === 'PUBLISHED').length ?? 0} diterbitkan`);
  }
}

console.log(`\n=== Ringkasan ===\n  ${failed === 0 ? 'Semua lulus ✓' : `Gagal: ${failed}`}\n`);
process.exit(failed > 0 ? 1 : 0);
