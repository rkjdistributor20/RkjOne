/**
 * Semak kesediaan go-live RKJ One.
 * Usage: npm run verify:go-live
 *
 * Perlu .env.local dengan NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
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

const env = {
  ...loadEnvFile(path.join(ROOT, '.env')),
  ...loadEnvFile(path.join(ROOT, '.env.local')),
  ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = env.NEXT_PUBLIC_APP_URL;

const checks = [];

function pass(label, detail) {
  checks.push({ ok: true, label, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  checks.push({ ok: false, label, detail });
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function warn(label, detail) {
  checks.push({ ok: null, label, detail });
  console.log(`  ! ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\n=== RKJ One — Semakan Go-Live ===\n');

console.log('1. Environment');
if (url) pass('NEXT_PUBLIC_SUPABASE_URL', url.replace(/https:\/\/([^.]+).*/, '$1…'));
else fail('NEXT_PUBLIC_SUPABASE_URL', 'Tiada — salin .env.example → .env.local');

if (serviceKey) pass('SUPABASE_SERVICE_ROLE_KEY', 'Diset');
else fail('SUPABASE_SERVICE_ROLE_KEY', 'Tiada — diperlukan untuk seed:users & verify');

if (appUrl) pass('NEXT_PUBLIC_APP_URL', appUrl);
else warn('NEXT_PUBLIC_APP_URL', 'Tiada — auth redirect mungkin rosak di production');

if (!url || !serviceKey) {
  console.log('\n==> Selesai dengan ralat env. Isi .env.local dan jalankan semula.\n');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('\n2. Pangkalan data');

async function rpcExists(name) {
  const { data, error } = await supabase.rpc(name, {
    p_branch_id: '00000000-0000-0000-0000-000000000001',
  });
  if (error) {
    const msg = error.message ?? '';
    if (
      msg.includes('Could not find') ||
      msg.includes('does not exist') ||
      msg.includes('schema cache')
    ) {
      return false;
    }
    return true;
  }
  return data !== undefined || !error;
}

try {
  const { count: branchCount, error: branchErr } = await supabase
    .from('branches')
    .select('*', { count: 'exact', head: true });
  if (branchErr) fail('Jadual branches', branchErr.message);
  else if ((branchCount ?? 0) >= 36) pass('Cawangan', `${branchCount} rekod`);
  else warn('Cawangan', `${branchCount ?? 0} rekod (jangka 36)`);

  const { count: productCount, error: prodErr } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE');
  if (prodErr) fail('Produk ACTIVE', prodErr.message);
  else pass('Produk POS aktif', `${productCount ?? 0} SKU`);

  const { count: stockCount } = await supabase
    .from('stock_items')
    .select('*', { count: 'exact', head: true });
  pass('Stock items', `${stockCount ?? 0} item`);

  const { count: profileCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  pass('Profiles', `${profileCount ?? 0} pengguna`);

  const { count: kioskLocCount } = await supabase
    .from('inventory_locations')
    .select('*', { count: 'exact', head: true })
    .eq('location_type', 'BRANCH_KIOSK');
  if ((kioskLocCount ?? 0) >= 1) pass('Lokasi kiosk', `${kioskLocCount} lokasi`);
  else fail('Lokasi kiosk', 'Tiada — POS stok tidak akan berfungsi');

  const hasAvailability = await rpcExists('get_pos_product_availability');
  if (hasAvailability) pass('RPC get_pos_product_availability', 'Wujud');
  else fail('RPC get_pos_product_availability', 'Tiada — jalankan migration 00023');

  const { data: sampleBranch } = await supabase
    .from('branches')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (sampleBranch?.id) {
    const { count: balCount } = await supabase
      .from('inventory_balances')
      .select('*', { count: 'exact', head: true })
      .eq(
        'location_id',
        (
          await supabase
            .from('inventory_locations')
            .select('id')
            .eq('branch_id', sampleBranch.id)
            .eq('location_type', 'BRANCH_KIOSK')
            .limit(1)
            .maybeSingle()
        ).data?.id ?? 'none'
      );
    if ((balCount ?? 0) > 0) pass('Baki stok kiosk (sample)', `${balCount} baris`);
    else warn('Baki stok kiosk (sample)', 'Kosong — jalankan 00021 atau Receive stock');
  }

  const { data: priceSample } = await supabase
    .from('products')
    .select('sku, price')
    .eq('status', 'ACTIVE')
    .gt('price', 0)
    .limit(3);
  if (priceSample?.length) {
    pass('Harga produk', priceSample.map((p) => `${p.sku} RM${p.price}`).join(', '));
  } else {
    fail('Harga produk', 'Semua RM 0 — jalankan migration 00026');
  }

  const { data: categories } = await supabase
    .from('products')
    .select('category')
    .eq('status', 'ACTIVE');
  const cats = new Set((categories ?? []).map((c) => c.category));
  const expected = ['Roti Kaya', 'Roti Kacang', 'Roti Kelapa', 'Roti Benggali'];
  const hasAll = expected.every((c) => cats.has(c));
  if (hasAll && cats.size <= 4) pass('Menu POS (4 kategori)', [...cats].join(', '));
  else warn('Menu POS', `Aktif: ${[...cats].join(', ') || 'tiada'} — semak 00030`);

  console.log('\n3. Auth users (sample)');
  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 5,
  });
  if (authErr) fail('Supabase Auth', authErr.message);
  else if ((authList?.users?.length ?? 0) > 0) {
    pass('Auth users', `${authList.users.length}+ wujud (sample)`);
    warn('Seed users', 'Jika < 50 user, jalankan: npm run seed:users');
  } else {
    fail('Auth users', 'Tiada — jalankan: npm run seed:users');
  }
} catch (err) {
  fail('Sambungan Supabase', err instanceof Error ? err.message : String(err));
}

const failed = checks.filter((c) => c.ok === false).length;
const warned = checks.filter((c) => c.ok === null).length;

console.log('\n=== Ringkasan ===');
console.log(`  Lulus: ${checks.filter((c) => c.ok === true).length}`);
console.log(`  Amaran: ${warned}`);
console.log(`  Gagal: ${failed}`);

if (failed > 0) {
  console.log('\n==> Belum sedia go-live. Rujuk docs/GO_LIVE_CHECKLIST.md\n');
  process.exit(1);
}

console.log('\n==> Asas sistem OK. Teruskan pilot 3 cawangan (docs/GO_LIVE_CHECKLIST.md)\n');
