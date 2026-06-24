/**
 * UAT Portal Ejen — semak akaun + order + langganan POS
 * Usage: npm run uat:sales-agent
 */

import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';
const RUN_FLOW = process.argv.includes('--flow');
const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey);

function ok(l, d) {
  console.log(`  ✓ ${l}${d ? ` — ${d}` : ''}`);
}
function fail(l, d) {
  console.log(`  ✗ ${l}${d ? ` — ${d}` : ''}`);
}

function cookie(session, user) {
  const ref = new URL(url).hostname.split('.')[0];
  return `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: 'bearer',
      user,
    })
  )}`;
}

async function apiJson(cookieHeader, path, init = {}) {
  const res = await fetch(`${PRODUCTION_URL}${path}`, {
    ...init,
    headers: {
      Cookie: cookieHeader,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    redirect: 'manual',
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

console.log('\n=== UAT Portal Ejen Jualan ===\n');

const { data: org } = await admin.from('organizations').select('id').eq('code', 'RKJ').single();
const { data: agents, error: agentErr } = await admin
  .from('sales_agent_accounts')
  .select('id, company_name, status, profile_id, contact_email')
  .eq('organization_id', org.id);

if (agentErr) {
  fail('Query sales_agent_accounts', agentErr.message);
  process.exit(1);
}

if (!agents?.length) {
  fail('Akaun ejen', 'tiada — daftar di /sales-agent');
  process.exit(1);
}

ok('Akaun ejen didaftarkan', `${agents.length} rekod`);

const { data: weeks } = await admin
  .from('factory_production_weeks')
  .select('id')
  .eq('organization_id', org.id)
  .eq('status', 'PUBLISHED');
const weekIds = (weeks ?? []).map((w) => w.id);
let openDays = [];
if (weekIds.length) {
  const { data: days } = await admin
    .from('factory_production_days')
    .select('production_date, orders_locked')
    .in('week_id', weekIds)
    .eq('orders_locked', false)
    .gte('production_date', new Date().toISOString().slice(0, 10))
    .order('production_date')
    .limit(5);
  openDays = days ?? [];
}

let failed = 0;
let testEmail = null;
let testPassword = env.GO_LIVE_PASSWORD?.trim() || DEFAULT_PASSWORD;

for (const agent of agents) {
  const { data: prof } = await admin
    .from('profiles')
    .select('email, role, status, full_name')
    .eq('id', agent.profile_id)
    .maybeSingle();

  console.log(`\n--- ${agent.company_name} ---`);
  if (!prof) {
    fail('Profil', 'tiada');
    failed++;
    continue;
  }

  ok('Email', prof.email);
  ok('Peranan', prof.role);
  ok('Status', prof.status);

  if (prof.role !== 'SALES_AGENT') {
    fail('Peranan patut SALES_AGENT', prof.role);
    failed++;
  }
  if (prof.status !== 'ACTIVE') {
    fail('Status patut ACTIVE', prof.status);
    failed++;
  }

  testEmail = prof.email;

  const login = await anon.auth.signInWithPassword({ email: prof.email, password: testPassword });
  if (login.error) {
    fail('Login', login.error.message);
    failed++;
    continue;
  }
  ok('Login', 'auth OK');

  const c = cookie(login.data.session, login.data.user);
  const dash = await fetch(`${PRODUCTION_URL}/api/sales-agent/dashboard`, {
    headers: { Cookie: c, Accept: 'application/json' },
    redirect: 'manual',
  });
  const dashBody = await dash.json().catch(() => ({}));
  if (dash.ok && dashBody.dashboard?.account) {
    ok('API dashboard', dashBody.dashboard.account.company_name);
  } else {
    fail('API dashboard', `HTTP ${dash.status} ${dashBody.error ?? ''}`);
    failed++;
  }

  const { count: outlets } = await admin
    .from('agent_outlets')
    .select('*', { count: 'exact', head: true })
    .eq('agent_account_id', agent.id);
  ok('Cawangan POS', String(outlets ?? 0));

  const { count: orders } = await admin
    .from('agent_stock_orders')
    .select('*', { count: 'exact', head: true })
    .eq('agent_account_id', agent.id);
  ok('Order stok', String(orders ?? 0));

  const { count: factory } = await admin
    .from('factory_agent_orders')
    .select('*', { count: 'exact', head: true })
    .eq('agent_account_id', agent.id);
  ok('Antrian kilang', String(factory ?? 0));

  if (RUN_FLOW && prof.role === 'SALES_AGENT') {
    console.log('\n--- Aliran order + bayaran ---');
    const c = cookie(login.data.session, login.data.user);

    const cat = await apiJson(c, '/api/sales-agent/catalog');
    const items = cat.body?.items ?? [];
    if (!cat.ok || !items.length) {
      fail('Katalog stok', `HTTP ${cat.status}`);
      failed++;
    } else {
      ok('Katalog stok', `${items.length} item`);
      const pick = items.find((i) => Number(i.unit_price_rm) > 0) ?? items[0];
      if (!pick || Number(pick.unit_price_rm) <= 0) {
        fail('Harga katalog', 'semua item RM0 — deploy semula kod terkini');
        failed++;
      } else {
        const prodDate = openDays?.[0]?.production_date;
        if (!prodDate) {
          fail('Tarikh production', 'tiada');
          failed++;
        } else {
        const orderRes = await apiJson(c, '/api/sales-agent/orders', {
          method: 'POST',
          body: JSON.stringify({
            production_date: prodDate,
            items: [{ stock_item_id: pick.id, quantity: 2 }],
          }),
        });
        if (!orderRes.ok) {
          fail('Cipta order', `${orderRes.status} ${orderRes.body.error ?? ''}`);
          failed++;
        } else {
          const order = orderRes.body.order;
          ok('Cipta order', `${order.order_number} — RM${order.total_amount_rm}`);

          const payRes = await apiJson(c, '/api/sales-agent/payments', {
            method: 'POST',
            body: JSON.stringify({
              purpose: 'STOCK_ORDER',
              reference_id: order.id,
              payment_method: 'FPX',
            }),
          });
          if (!payRes.ok) {
            fail('Bayaran', `${payRes.status} ${payRes.body.error ?? ''}`);
            failed++;
          } else {
            ok('Bayaran dimulakan', payRes.body.checkout?.mode ?? 'simulate');
            const confirmRes = await apiJson(c, '/api/sales-agent/payments/confirm', {
              method: 'POST',
              body: JSON.stringify({ payment_id: payRes.body.payment.id }),
            });
            if (!confirmRes.ok) {
              fail('Sahkan bayaran', `${confirmRes.status} ${confirmRes.body.error ?? ''}`);
              failed++;
            } else {
              ok('Sahkan bayaran', confirmRes.body.gateway_ref ?? 'OK');
              const { count: fq } = await admin
                .from('factory_agent_orders')
                .select('*', { count: 'exact', head: true })
                .eq('agent_account_id', agent.id);
              if ((fq ?? 0) > 0) {
                ok('Antrian kilang (selepas bayar)', String(fq));
              } else {
                fail('Antrian kilang', 'masih 0 selepas bayar');
                failed++;
              }
            }
          }
        }
        }
      }
    }
  }
}

console.log('\n--- Tarikh production terbuka ---');
if (openDays?.length) {
  for (const d of openDays) ok('Boleh order', d.production_date);
} else {
  console.log('  ⚠ Tiada tarikh terbuka — kilang perlu terbitkan jadual minggu');
}

console.log('\n=== Ringkasan ===');
if (failed) {
  console.log(`  Gagal: ${failed}`);
  process.exit(1);
}

console.log('  Semua semakan asas OK');
if (testEmail) {
  console.log(`\n  Seterusnya (browser):`);
  console.log(`  → ${PRODUCTION_URL}/sales-agent`);
  console.log(`  → Login: ${testEmail}`);
  console.log(`  → Tab Order Stok → pilih tarikh → isi kuantiti → Bayar & Hantar Kilang`);
  console.log(`  → Tab Cawangan POS → daftar cawangan → Bayar RM150\n`);
}
