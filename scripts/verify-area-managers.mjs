/**
 * Semakan skop Area Manager — profil, kebenaran, lokasi kiosk
 * Usage: npm run verify:am
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PILOT_UTARA_CODES = [
  'BR001', 'BR002', 'BR003', 'BR004', 'BR005', 'BR006',
  'BR007', 'BR008', 'BR009', 'BR010', 'BR011', 'BR012',
];

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
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key);

const AM_ACCOUNTS = [
  { email: 'safuan@rkj.com', region: 'UTARA', expectedBranches: 12 },
  { email: 'hakim@rkj.com', region: 'TENGAH', expectedBranches: 10 },
  { email: 'yati@rkj.com', region: 'SELATAN', expectedBranches: 14 },
];

const REQUIRED_AM_PERMISSIONS = [
  ['stock_kiosk', 'VIEW_AREA'],
  ['shift', 'VIEW_AREA'],
  ['approval', 'FULL'],
  ['reports', 'VIEW'],
];

const FORBIDDEN_AM_PERMISSIONS = [
  ['stock_hq', 'NONE'],
  ['payroll', 'NONE'],
];

console.log('\n=== UAT Area Manager — Semakan Automatik ===\n');

let failed = 0;

const { data: regions } = await sb.from('regions').select('id, code, name');
const regionById = new Map((regions ?? []).map((r) => [r.id, r]));

const { data: branches } = await sb.from('branches').select('id, branch_code, branch_name, region_id');
const branchesByRegion = new Map();
for (const b of branches ?? []) {
  const code = regionById.get(b.region_id)?.code ?? '?';
  if (!branchesByRegion.has(code)) branchesByRegion.set(code, []);
  branchesByRegion.get(code).push(b);
}

const { data: permRows } = await sb
  .from('role_permissions')
  .select('module, permission')
  .eq('role', 'AREA_MANAGER');

const permMap = new Map((permRows ?? []).map((r) => [r.module, r.permission]));

console.log('1. Kebenaran peranan AREA_MANAGER');
for (const [mod, perm] of REQUIRED_AM_PERMISSIONS) {
  const got = permMap.get(mod);
  const ok = got === perm;
  console.log(`  ${ok ? '✓' : '✗'} ${mod} = ${got ?? 'TIADA'} (jangka: ${perm})`);
  if (!ok) failed++;
}
for (const [mod, perm] of FORBIDDEN_AM_PERMISSIONS) {
  const got = permMap.get(mod) ?? 'TIADA';
  const ok = got === perm;
  console.log(`  ${ok ? '✓' : '✗'} ${mod} = ${got} (jangka: ${perm} — tiada HQ)`);
  if (!ok) failed++;
}

console.log('\n2. Profil & skop cawangan');

const emails = AM_ACCOUNTS.map((a) => a.email);
const { data: profiles } = await sb
  .from('profiles')
  .select('id, email, full_name, role, region_id, legal_entity_id, legal_entity:legal_entities(code, legal_name)')
  .in('email', emails);

const { data: legalEntities } = await sb
  .from('legal_entities')
  .select('id, code, legal_name')
  .order('sort_order');

const entityById = new Map((legalEntities ?? []).map((e) => [e.id, e]));

const { data: kioskLocs } = await sb
  .from('inventory_locations')
  .select('id, branch_id, name')
  .eq('location_type', 'BRANCH_KIOSK')
  .eq('is_active', true);

for (const acc of AM_ACCOUNTS) {
  const p = profiles?.find((x) => x.email === acc.email);
  if (!p) {
    console.log(`  ✗ ${acc.email} — profil tiada`);
    failed++;
    continue;
  }
  const region = regionById.get(p.region_id);
  const regionCode = region?.code ?? '?';
  const branchCount = (branches ?? []).filter((b) => b.region_id === p.region_id).length;
  const kioskCount = (kioskLocs ?? []).filter((loc) => {
    const br = branches?.find((b) => b.id === loc.branch_id);
    return br?.region_id === p.region_id;
  }).length;

  const ok =
    p.role === 'AREA_MANAGER' &&
    regionCode === acc.region &&
    branchCount === acc.expectedBranches &&
    kioskCount >= acc.expectedBranches - 1; // toleransi 1 kiosk belum di-sync

  const employerCode =
    p.legal_entity?.code ??
    entityById.get(p.legal_entity_id)?.code ??
    '?';
  const employerOk = employerCode === 'RKJ_DIST';

  console.log(`  ${ok && employerOk ? '✓' : '✗'} ${acc.email} (${p.full_name})`);
  console.log(`     Kawasan: ${regionCode} · ${branchCount} cawangan · ${kioskCount} kiosk`);
  console.log(
    `     Majikan: ${p.legal_entity?.legal_name ?? entityById.get(p.legal_entity_id)?.legal_name ?? '?'} (${employerCode})`
  );
  if (!ok || !employerOk) failed++;
}

console.log('\n3. Pilot 14 hari — 12 cawangan Utara (Safuan)');
const utaraRegionId = regions?.find((r) => r.code === 'UTARA')?.id;
for (const code of PILOT_UTARA_CODES) {
  const br = (branches ?? []).find((b) => b.branch_code === code);
  const reg = br ? regionById.get(br.region_id)?.code : '?';
  const ok = reg === 'UTARA';
  const label = br ? `${code} — ${br.branch_name}` : code;
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed++;
}
if ((branches ?? []).filter((b) => b.region_id === utaraRegionId).length !== 12) {
  console.log('  ✗ Bilangan cawangan Utara bukan 12');
  failed++;
} else {
  console.log('  ✓ Jumlah cawangan Utara = 12');
}

console.log('\n4. Semak RPC pindahan (migration 00058+)');
const { error: rpcErr } = await sb.rpc('create_stock_transfer', {
  p_from_location_id: '00000000-0000-0000-0000-000000000001',
  p_to_location_id: '00000000-0000-0000-0000-000000000002',
  p_items: '[]',
});
const rpcExists =
  !rpcErr?.message?.includes('Could not find the function') &&
  !rpcErr?.message?.includes('schema cache');
console.log(`  ${rpcExists ? '✓' : '✗'} RPC create_stock_transfer wujud`);
if (!rpcExists) failed++;

console.log('\n5. Lokasi kiosk hilang (ikut kawasan)');
for (const code of ['UTARA', 'TENGAH', 'SELATAN']) {
  const regionId = regions?.find((r) => r.code === code)?.id;
  const regionBranches = (branches ?? []).filter((b) => b.region_id === regionId);
  const missing = regionBranches.filter((b) => {
    return !(kioskLocs ?? []).some((loc) => loc.branch_id === b.id);
  });
  if (missing.length) {
    console.log(`  ⚠ ${code}: ${missing.length} cawangan tiada lokasi kiosk:`);
    for (const m of missing) {
      console.log(`     - ${m.branch_code}`);
    }
  } else {
    console.log(`  ✓ ${code}: semua cawangan ada kiosk`);
  }
}

console.log('\n6. Syarikat undang-undang (legal_entities)');
const expectedEntities = ['RKJ', 'RKJ_DIST', 'RKJ_MFG'];
for (const code of expectedEntities) {
  const row = (legalEntities ?? []).find((e) => e.code === code);
  const ok = Boolean(row?.legal_name);
  console.log(`  ${ok ? '✓' : '✗'} ${code} — ${row?.legal_name ?? 'TIADA'}`);
  if (!ok) failed++;
}

const { count: rkjStaffCount } = await sb
  .from('staff')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'ACTIVE')
  .not('legal_entity_id', 'is', null);
const rkjEntity = (legalEntities ?? []).find((e) => e.code === 'RKJ');
const { count: salesStaffRkj } = await sb
  .from('staff')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'ACTIVE')
  .eq('legal_entity_id', rkjEntity?.id ?? '00000000-0000-0000-0000-000000000000');
console.log(
  `  ${(rkjStaffCount ?? 0) > 0 ? '✓' : '✗'} Staf aktif ada syarikat majikan (${rkjStaffCount ?? 0} rekod)`
);
console.log(
  `  ${(salesStaffRkj ?? 0) > 0 ? '✓' : '✗'} Staf jualan bawah Roti Kaya Junus (${salesStaffRkj ?? 0} rekod)`
);
if ((rkjStaffCount ?? 0) === 0 || (salesStaffRkj ?? 0) === 0) failed++;

console.log('\n=== Ringkasan ===');
if (failed) {
  console.log(`  Gagal: ${failed} — betulkan sebelum UAT manual\n`);
  process.exit(1);
}

console.log('  Semua semakan AM lulus ✓');
console.log('\n  Seterusnya (manual di browser):');
console.log('  → https://rkj-one.vercel.app');
console.log('  → Login safuan@rkj.com / RkjOne@2025');
console.log('  → /profile (RKJ Distributor · operasi Roti Kaya Junus)');
console.log('  → Inventori → Pindah Cawangan → Tetapan Staf\n');
