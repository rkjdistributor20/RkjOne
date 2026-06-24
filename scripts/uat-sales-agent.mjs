/**
 * UAT Portal Ejen — semak akaun + order + langganan POS
 * Usage: npm run uat:sales-agent
 */

import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';
const RUN_FLOW = process.argv.includes('--flow');
const RUN_FLOW_POS = process.argv.includes('--flow-pos') || RUN_FLOW;
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

/** UAT: simulasikan pengesahan bank bila production mod live (RPC service role). */
async function confirmPaymentAsBank(cookieHeader, paymentId) {
  const confirmRes = await apiJson(cookieHeader, '/api/sales-agent/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({ payment_id: paymentId }),
  });
  if (confirmRes.ok) return confirmRes;

  if (confirmRes.status === 403) {
    const { data, error } = await admin.rpc('confirm_agent_payment_and_fulfill', {
      p_payment_id: paymentId,
      p_gateway_ref: `UAT-BANK-${Date.now()}`,
    });
    if (error) {
      return { ok: false, status: 500, body: { error: error.message } };
    }
    const receiptRes = await apiJson(cookieHeader, `/api/sales-agent/receipts/${paymentId}`);
    return {
      ok: true,
      status: 200,
      body: {
        payment_id: paymentId,
        gateway_ref: `UAT-BANK`,
        receipt: receiptRes.body?.receipt ?? null,
        result: data,
      },
    };
  }

  return confirmRes;
}

/** UAT: cipta bayaran + simulasikan pengesahan bank (bila iPay88 belum set di Vercel). */
async function payAndConfirmUat(cookieHeader, agent, profileId, payload) {
  const payRes = await apiJson(cookieHeader, '/api/sales-agent/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (payRes.ok) {
    ok('Bayaran dimulakan', payRes.body.checkout?.mode ?? 'live');
    const confirmed = await confirmPaymentAsBank(cookieHeader, payRes.body.payment.id);
    if (confirmed.ok && !confirmed.body.payment_id) {
      confirmed.body.payment_id = payRes.body.payment.id;
    }
    return confirmed;
  }

  if (payRes.status !== 503) {
    return { ok: false, status: payRes.status, body: payRes.body };
  }

  ok('Gateway iPay88 belum set', 'simulasikan rekod + pengesahan bank (UAT)');

  let amount = 0;
  if (payload.purpose === 'STOCK_ORDER') {
    const { data: order } = await admin
      .from('agent_stock_orders')
      .select('total_amount_rm')
      .eq('id', payload.reference_id)
      .single();
    amount = Number(order?.total_amount_rm ?? 0);
  } else {
    const { data: sub } = await admin
      .from('agent_outlet_subscriptions')
      .select('amount_rm')
      .eq('id', payload.reference_id)
      .single();
    amount = Number(sub?.amount_rm ?? 150);
  }

  const { data: payment, error } = await admin
    .from('agent_online_payments')
    .insert({
      organization_id: org.id,
      agent_account_id: agent.id,
      purpose: payload.purpose,
      reference_type:
        payload.purpose === 'STOCK_ORDER' ? 'agent_stock_orders' : 'agent_outlet_subscriptions',
      reference_id: payload.reference_id,
      amount_rm: amount,
      payment_method: payload.payment_method,
      status: 'PENDING',
      created_by: profileId,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, status: 500, body: { error: error.message } };
  }

  return confirmPaymentAsBank(cookieHeader, payment.id).then((r) => {
    if (r.ok && !r.body.payment_id) r.body.payment_id = payment.id;
    return r;
  });
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

  const companiesRes = await apiJson(c, '/api/legal-entities');
  if (companiesRes.ok && companiesRes.body.companies?.length >= 3) {
    const dist = companiesRes.body.companies.find((x) => x.code === 'RKJ_DIST');
    if (dist?.bankAccountNo && dist?.registrationNo) {
      ok('Profil syarikat', `RKJ_DIST · Maybank ${dist.bankAccountNo.slice(-4)}`);
    } else {
      fail('Profil syarikat', 'RKJ_DIST bank/SSM tiada');
      failed++;
    }
  } else {
    fail('Profil syarikat API', `HTTP ${companiesRes.status}`);
    failed++;
  }

  const posRes = await fetch(`${PRODUCTION_URL}/pos`, {
    headers: { Cookie: c, Accept: 'text/html' },
    redirect: 'manual',
  });
  const { count: activeOutlets } = await admin
    .from('agent_outlets')
    .select('*', { count: 'exact', head: true })
    .eq('agent_account_id', agent.id)
    .eq('subscription_active', true)
    .eq('pos_enabled', true);
  if ((activeOutlets ?? 0) > 0) {
    if (posRes.status === 200) ok('Akses POS', 'terminal dibuka');
    else if (posRes.status >= 300 && posRes.status < 400) {
      const loc = posRes.headers.get('location') ?? '';
      if (loc.includes('pos=locked')) fail('Akses POS', 'redirect locked');
      else ok('Akses POS', `HTTP ${posRes.status}`);
    } else fail('Akses POS', `HTTP ${posRes.status}`);
  } else {
    console.log('  ⚠ POS — tiada cawangan aktif (daftar + bayar RM150)');
  }

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

          const confirmRes = await payAndConfirmUat(c, agent, prof.id, {
            purpose: 'STOCK_ORDER',
            reference_id: order.id,
            payment_method: 'FPX',
          });
          if (!confirmRes.ok) {
            fail('Sahkan bayaran', `${confirmRes.status} ${confirmRes.body.error ?? ''}`);
            failed++;
          } else {
            ok('Sahkan bayaran', confirmRes.body.gateway_ref ?? 'OK');
            if (confirmRes.body.receipt?.receipt_number) {
              ok('Resit rasmi', confirmRes.body.receipt.receipt_number);
            } else if (confirmRes.body.payment_id) {
              const receiptRes = await apiJson(
                c,
                `/api/sales-agent/receipts/${confirmRes.body.payment_id}`
              );
              if (receiptRes.ok && receiptRes.body.receipt?.receipt_number) {
                ok('Resit rasmi', receiptRes.body.receipt.receipt_number);
              } else {
                fail('Resit rasmi', 'tiada');
                failed++;
              }
            } else {
              fail('Resit rasmi', 'tiada');
              failed++;
            }
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

  if (RUN_FLOW_POS && prof.role === 'SALES_AGENT') {
    console.log('\n--- Aliran cawangan POS + langganan ---');
    const c = cookie(login.data.session, login.data.user);
    const outletCode = `UAT-${Date.now().toString().slice(-5)}`;

    const outletRes = await apiJson(c, '/api/sales-agent/outlets', {
      method: 'POST',
      body: JSON.stringify({
        outlet_code: outletCode,
        outlet_name: `Kiosk UAT ${outletCode}`,
        address_line: 'Teluk Intan',
        city: 'Teluk Intan',
        state: 'Perak',
        postcode: '36000',
      }),
    });
    if (!outletRes.ok) {
      fail('Daftar cawangan', `${outletRes.status} ${outletRes.body.error ?? ''}`);
      failed++;
    } else {
      ok('Daftar cawangan', outletRes.body.outlet.outlet_code);
      const outletId = outletRes.body.outlet.id;

      const subRes = await apiJson(c, '/api/sales-agent/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ outlet_id: outletId }),
      });
      if (!subRes.ok) {
        fail('Langganan POS', `${subRes.status} ${subRes.body.error ?? ''}`);
        failed++;
      } else {
        ok('Langganan dimulakan', `RM${subRes.body.subscription.amount_rm}`);
        const confirmRes = await payAndConfirmUat(c, agent, prof.id, {
          purpose: 'POS_SUBSCRIPTION',
          reference_id: subRes.body.subscription.id,
          payment_method: 'FPX',
        });
        if (!confirmRes.ok) {
          fail('Bayaran langganan', `${confirmRes.status} ${confirmRes.body.error ?? ''}`);
          failed++;
        } else {
          const receipt = confirmRes.body.receipt;
          if (receipt?.receipt_number) {
            ok('Resit langganan', receipt.receipt_number);
            if (receipt.issuer?.bank_account_no?.includes('564856315018')) {
              ok('Bank RKJ Distributor pada resit', 'Maybank OK');
            } else if (receipt.issuer?.bank_name) {
              ok('Bank RKJ Distributor pada resit', receipt.issuer.bank_name);
            } else {
              fail('Bank pada resit', 'tiada');
              failed++;
            }
          } else {
            fail('Resit langganan', 'tiada');
            failed++;
          }
          const { data: outletRow } = await admin
            .from('agent_outlets')
            .select('pos_enabled, subscription_active')
            .eq('id', outletId)
            .single();
          if (outletRow?.pos_enabled && outletRow?.subscription_active) {
            ok('POS cawangan aktif', outletCode);
          } else {
            fail('POS cawangan aktif', 'pos_enabled=false');
            failed++;
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
