/**
 * Create Supabase Auth users + link profiles for HQ, drivers, and active staff.
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npm run seed:users
 *
 * Scope: 8 HQ users, drivers D001–D005, active staff with branch (excludes S015/S020/S045, no U009 finance)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_PASSWORD = 'RkjOne@2025';

const EXCLUDED_STAFF_CODES = new Set(['S015', 'S020', 'S045']);

const HQ_USERS = [
  { code: 'U001', email: 'matisa@rkj.com', full_name: 'Mat Isa', role: 'SUPER_ADMIN' },
  { code: 'U002', email: 'norashikin@rkj.com', full_name: 'Norashikin', role: 'ADMIN' },
  { code: 'U003', email: 'mohdali@rkj.com', full_name: 'Mohd Ali', role: 'HR' },
  { code: 'U004', email: 'ibrahim@rkj.com', full_name: 'Ibrahim', role: 'OPERATION_MANAGER' },
  { code: 'U005', email: 'muhammad@rkj.com', full_name: 'Muhammad', role: 'CEO_FACTORY' },
  { code: 'U006', email: 'safuan@rkj.com', full_name: 'Safuan', role: 'AREA_MANAGER', region: 'UTARA' },
  { code: 'U007', email: 'hakim@rkj.com', full_name: 'Hakim', role: 'AREA_MANAGER', region: 'TENGAH' },
  { code: 'U008', email: 'yati@rkj.com', full_name: 'Yati', role: 'AREA_MANAGER', region: 'SELATAN' },
];

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

async function findUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureUser(supabase, { email, password, metadata, profilePatch }) {
  const existing = await findUserByEmail(supabase, email);
  let userId;

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`${email}: ${error.message}`);
    userId = existing.id;
    process.stdout.write(`  ~ ${email} (kemas kini)\n`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`${email}: ${error.message}`);
    userId = data.user.id;
    process.stdout.write(`  + ${email}\n`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      ...profilePatch,
      email,
      status: 'ACTIVE',
      must_change_password: true,
    })
    .eq('id', userId);

  if (profileError) throw new Error(`${email} profile: ${profileError.message}`);
  return userId;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(ROOT, '.env.example')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
  };

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || serviceKey.includes('YOUR_')) {
    console.error('❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', 'RKJ')
    .single();

  if (orgError || !org) {
    console.error('❌ Organization RKJ not found. Run migrations + seed first.');
    process.exit(1);
  }

  const { data: regions } = await supabase
    .from('regions')
    .select('id, code')
    .eq('organization_id', org.id);

  const regionMap = Object.fromEntries((regions ?? []).map((r) => [r.code, r.id]));

  console.log('\n🏢 HQ & Pengurus (8 pengguna)');
  for (const u of HQ_USERS) {
    await ensureUser(supabase, {
      email: u.email,
      password: DEFAULT_PASSWORD,
      metadata: {
        full_name: u.full_name,
        role: u.role,
        employee_code: u.code,
      },
      profilePatch: {
        employee_code: u.code,
        full_name: u.full_name,
        role: u.role,
        region_id: u.region ? regionMap[u.region] ?? null : null,
        branch_id: null,
      },
    });
  }

  console.log('\n🚚 Pemandu (D001–D005)');
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, driver_code, full_name')
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .like('driver_code', 'D___');

  const credentials = [];

  for (const u of HQ_USERS) {
    credentials.push({
      code: u.code,
      email: u.email,
      name: u.full_name,
      role: u.role,
      password: DEFAULT_PASSWORD,
    });
  }

  for (const d of drivers ?? []) {
    const email = `${d.driver_code.toLowerCase()}@rkj.com`;
    const userId = await ensureUser(supabase, {
      email,
      password: DEFAULT_PASSWORD,
      metadata: {
        full_name: d.full_name,
        role: 'DRIVER',
        employee_code: d.driver_code,
      },
      profilePatch: {
        employee_code: d.driver_code,
        full_name: d.full_name,
        role: 'DRIVER',
        branch_id: null,
        region_id: null,
      },
    });
    await supabase.from('drivers').update({ profile_id: userId }).eq('id', d.id);
    credentials.push({
      code: d.driver_code,
      email,
      name: d.full_name,
      role: 'DRIVER',
      password: DEFAULT_PASSWORD,
    });
  }

  console.log('\n👥 Staf kiosk (aktif + ada cawangan, tanpa S015/S020/S045)');
  const { data: staffList } = await supabase
    .from('staff')
    .select('id, staff_code, full_name, branch_id, region_id')
    .eq('organization_id', org.id)
    .eq('status', 'ACTIVE')
    .not('branch_id', 'is', null);

  for (const s of staffList ?? []) {
    if (EXCLUDED_STAFF_CODES.has(s.staff_code)) {
      process.stdout.write(`  - ${s.staff_code} (dilangkau)\n`);
      continue;
    }

    const email = `${s.staff_code.toLowerCase()}@rkj.com`;
    const userId = await ensureUser(supabase, {
      email,
      password: DEFAULT_PASSWORD,
      metadata: {
        full_name: s.full_name,
        role: 'STAFF',
        employee_code: s.staff_code,
      },
      profilePatch: {
        employee_code: s.staff_code,
        full_name: s.full_name,
        role: 'STAFF',
        branch_id: s.branch_id,
        region_id: s.region_id,
      },
    });
    await supabase.from('staff').update({ profile_id: userId }).eq('id', s.id);
    credentials.push({
      code: s.staff_code,
      email,
      name: s.full_name,
      role: 'STAFF',
      password: DEFAULT_PASSWORD,
    });
  }

  const csvLines = [
    'Code,Email,Nama,Role,Kata Laluan Default',
    ...credentials.map(
      (c) =>
        `${c.code},${c.email},${c.name},${c.role},${c.password}`
    ),
  ];

  fs.writeFileSync(
    path.join(ROOT, 'csv_import', 'login_users_generated.csv'),
    csvLines.join('\n') + '\n',
    'utf8'
  );

  const loginRefLines = [
    'Code,Email,Nama,Role,Cawangan/Kawasan,Kata Laluan Default,Nota',
    ...HQ_USERS.map(
      (u) =>
        `${u.code},${u.email},${u.full_name},${u.role},Semua,${DEFAULT_PASSWORD},HQ`
    ),
    ...(drivers ?? []).map(
      (d) =>
        `${d.driver_code},${d.driver_code.toLowerCase()}@rkj.com,${d.full_name},DRIVER,HQ→Kiosk,${DEFAULT_PASSWORD},Pemandu`
    ),
  ];
  fs.writeFileSync(
    path.join(ROOT, 'csv_import', 'login_users.csv'),
    loginRefLines.join('\n') + '\n',
    'utf8'
  );

  console.log(`\n✅ Selesai — ${credentials.length} akaun login`);
  console.log('📄 Senarai penuh: csv_import/login_users_generated.csv');
  console.log('📄 Rujukan HQ+Pemandu: csv_import/login_users.csv');
  console.log(`🔑 Kata laluan default: ${DEFAULT_PASSWORD}`);
  console.log('\nContoh log masuk:');
  console.log('  Super Admin → matisa@rkj.com');
  console.log('  Staf POS    → s001@rkj.com (ELSA, BR007)');
  console.log('  Pemandu     → d001@rkj.com (Samad)');
}

main().catch((err) => {
  console.error('\n❌ Gagal:', err.message);
  process.exit(1);
});
