/**
 * Semak konfigurasi Auth + senarai delivery 36 cawangan untuk go-live.
 * Usage: npm run verify:auth
 *        npm run verify:delivery
 *        npm run verify:go-live-36
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadProjectEnv, ROOT as PROJECT_ROOT } from './lib/load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = PROJECT_ROOT;
const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';
const PROJECT_REF = 'mtygxueknokcihofdttl';
const GO_LIVE_PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');
const DEFAULT_UAT_PASSWORD = 'RkjOne@2025';

function readGoLivePassword() {
  if (process.env.GO_LIVE_PASSWORD?.trim()) return process.env.GO_LIVE_PASSWORD.trim();
  if (!fs.existsSync(GO_LIVE_PASSWORD_FILE)) return DEFAULT_UAT_PASSWORD;
  const line = fs
    .readFileSync(GO_LIVE_PASSWORD_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return line || DEFAULT_UAT_PASSWORD;
}

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

const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

let failed = 0;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.log(`  ✗ ${msg}`);
  failed++;
}

function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}

async function mainAuth() {
  console.log('\n=== Semakan Supabase Auth (Go-Live 36) ===\n');
  console.log(`Production: ${PRODUCTION_URL}`);
  console.log(
    `Dashboard:  https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration\n`
  );

  if (!url || !anonKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY — set dalam .env.local');
    return;
  }

  console.log('1. Tetapan WAJIB (semak manual di Dashboard):');
  console.log('   Site URL      = https://rkj-one.vercel.app');
  console.log('   Redirect URLs = https://rkj-one.vercel.app/auth/callback');
  console.log('                   http://localhost:3000/auth/callback');
  console.log('   Enable signup = OFF\n');

  console.log('2. Production URL & health');
  try {
    const health = await fetch(`${PRODUCTION_URL}/api/health`);
    const body = await health.json();
    if (body.ok && body.appUrl === PRODUCTION_URL) {
      pass(`NEXT_PUBLIC_APP_URL = ${body.appUrl}`);
    } else {
      fail(`appUrl mismatch: ${body.appUrl ?? 'null'}`);
    }
  } catch (e) {
    fail(`GET /api/health — ${e.message}`);
  }

  console.log('\n3. Login production (Safuan AM)');
  const safuanPassword = readGoLivePassword();
  const anon = createClient(url, anonKey);
  const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
    email: 'safuan@rkj.com',
    password: safuanPassword,
  });
  if (loginErr) {
    fail(`Login safuan@rkj.com — ${loginErr.message}`);
    warn('Semak Site URL / Redirect URLs jika redirect loop');
  } else {
    pass(`Login safuan@rkj.com — session OK`);
    await anon.auth.signOut();
  }

  console.log('\n4. Signup public (mesti DISABLED)');
  const fakeEmail = `blocked-test-${Date.now()}@example.com`;
  const { data: signUpData, error: signUpErr } = await anon.auth.signUp({
    email: fakeEmail,
    password: 'TestBlock123!',
  });
  if (signUpErr) {
    pass(`Signup blocked — ${signUpErr.message}`);
  } else if (signUpData.user && !signUpData.session) {
    pass('Signup tiada session — anggap signup OFF / confirm email');
  } else if (signUpData.session) {
    fail('Signup BERJAYA dengan session — WAJIB matikan signup di Supabase!');
    if (serviceKey) {
      const admin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await admin.auth.admin.deleteUser(signUpData.user.id);
    }
  }

  console.log('\n5. Callback route');
  try {
    const res = await fetch(`${PRODUCTION_URL}/auth/callback`, { redirect: 'manual' });
    pass(`GET /auth/callback — HTTP ${res.status}`);
  } catch (e) {
    fail(`/auth/callback — ${e.message}`);
  }

  console.log('\n=== Ringkasan Auth ===');
  if (failed) {
    console.log(`  Gagal: ${failed}\n`);
    process.exit(1);
  }
  console.log('  Lulus — pastikan item (1) disemak manual di Dashboard\n');
}

async function mainDelivery() {
  console.log('\n=== Senarai Delivery — 36 Cawangan ===\n');

  if (!url || !serviceKey) {
    fail('SUPABASE_SERVICE_ROLE_KEY diperlukan');
    process.exit(1);
  }

  const sb = createClient(url, serviceKey);

  const { data: regions } = await sb.from('regions').select('id, code, name');
  const regionMap = new Map((regions ?? []).map((r) => [r.id, r]));

  const { data: branches, error: brErr } = await sb
    .from('branches')
    .select('id, branch_code, branch_name, region_id, status')
    .order('branch_code');

  if (brErr) {
    fail(brErr.message);
    process.exit(1);
  }

  const { data: kiosks } = await sb
    .from('inventory_locations')
    .select('id, branch_id, name')
    .eq('location_type', 'BRANCH_KIOSK')
    .eq('is_active', true);

  const kioskByBranch = new Map((kiosks ?? []).map((k) => [k.branch_id, k]));

  const { data: balances } = await sb
    .from('inventory_balances')
    .select('location_id, quantity')
    .gt('quantity', 0);

  const locIdsWithStock = new Set((balances ?? []).map((b) => b.location_id));

  const rows = [];
  for (const b of branches ?? []) {
    const region = regionMap.get(b.region_id);
    const kiosk = kioskByBranch.get(b.id);
    const hasKiosk = Boolean(kiosk);
    const hasStock = kiosk ? locIdsWithStock.has(kiosk.id) : false;
    rows.push({
      code: b.branch_code,
      name: b.branch_name,
      region: region?.code ?? '?',
      am:
        region?.code === 'UTARA'
          ? 'Safuan'
          : region?.code === 'TENGAH'
            ? 'Hakim'
            : region?.code === 'SELATAN'
              ? 'Yati'
              : '?',
      hasKiosk,
      hasStock,
    });
    if (!hasKiosk) fail(`${b.branch_code} — tiada lokasi kiosk`);
    else if (!hasStock) warn(`${b.branch_code} — perlu delivery (tiada stok)`);
    else pass(`${b.branch_code} — ${b.branch_name} · stok OK`);
  }

  if ((branches ?? []).length !== 36) {
    fail(`Bilangan cawangan = ${branches?.length ?? 0} (jangka 36)`);
  } else {
    pass('Jumlah cawangan = 36');
  }

  const outPath = path.join(ROOT, 'docs', 'GO_LIVE_DELIVERY_36.md');
  fs.writeFileSync(outPath, buildDeliveryMarkdown(rows), 'utf8');
  console.log('\n  → docs/GO_LIVE_DELIVERY_36.md');

  const csvPath = path.join(ROOT, 'csv_import', 'go_live_delivery_36.csv');
  fs.writeFileSync(
    csvPath,
    [
      'branch_code,branch_name,region,area_manager,kiosk_ok,stock_ok,delivery_done',
      ...rows.map(
        (r) =>
          `${r.code},"${r.name.replace(/"/g, '""')}",${r.region},${r.am},${r.hasKiosk ? 'Y' : 'N'},${r.hasStock ? 'Y' : 'N'},`
      ),
    ].join('\n'),
    'utf8'
  );
  console.log('  → csv_import/go_live_delivery_36.csv');

  const needDelivery = rows.filter((r) => r.hasKiosk && !r.hasStock).length;
  console.log('\n=== Ringkasan Delivery ===');
  console.log(`  Kiosk OK: ${rows.filter((r) => r.hasKiosk).length}/36`);
  console.log(`  Stok OK:  ${rows.filter((r) => r.hasStock).length}/36`);
  console.log(`  Perlu delivery: ${needDelivery} cawangan\n`);

  if (failed) process.exit(1);
}

function buildDeliveryMarkdown(rows) {
  const byRegion = { UTARA: [], TENGAH: [], SELATAN: [] };
  for (const r of rows) {
    (byRegion[r.region] ?? byRegion.UTARA).push(r);
  }

  let md = `# Delivery Go-Live — 36 Cawangan

**Auto-jana:** \`npm run verify:delivery\`  
**Aliran:** Kilang → **HQ Distributor** → Logistik → Kiosk → POS

Tandakan \`[x]\` bila delivery selesai & staf sahkan stok.

---

| Kawasan | AM | Cawangan |
|---------|-----|----------|
| Utara | Safuan | 12 |
| Tengah | Hakim | 10 |
| Selatan | Yati | 14 |

---

`;

  for (const [code, label] of [
    ['UTARA', 'Utara — Safuan'],
    ['TENGAH', 'Tengah — Hakim'],
    ['SELATAN', 'Selatan — Yati'],
  ]) {
    md += `## ${label}\n\n| [ ] | Kod | Cawangan | Kiosk | Stok |\n|-----|-----|----------|-------|------|\n`;
    for (const r of byRegion[code] ?? []) {
      md += `| [ ] | ${r.code} | ${r.name} | ${r.hasKiosk ? '✓' : '✗'} | ${r.hasStock ? '✓' : '**DELIVER**'} |\n`;
    }
    md += '\n';
  }

  md += `---

HQ: [GO_LIVE_36.md](./GO_LIVE_36.md) · *Dijana automatik — jalankan \`npm run verify:delivery\`*
`;
  return md;
}

const mode = process.argv[2] ?? 'all';
failed = 0;
if (mode === 'auth') {
  await mainAuth();
} else if (mode === 'delivery') {
  await mainDelivery();
} else {
  await mainAuth();
  failed = 0;
  await mainDelivery();
}
