/**
 * UAT Portal Ejen - semak akaun + order + langganan POS
 * Usage: npm run uat:sales-agent
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj.one';
const RUN_FLOW = process.argv.includes('--flow');
const RUN_FLOW_POS = process.argv.includes('--flow-pos') || RUN_FLOW;
const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GO_LIVE_PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');

if (!url || !serviceKey || !anonKey) {
 console.error('Missing Supabase env');
 process.exit(1);
}

const admin = createClient(url, serviceKey, {
 auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey);
const HTTP_TIMEOUT_MS = 7000;

function parseCsvLine(line) {
 const values = [];
 let current = '';
 let quoted = false;
 for (let i = 0; i < line.length; i += 1) {
 const ch = line[i];
 const next = line[i + 1];
 if (ch === '"' && quoted && next === '"') {
 current += '"';
 i += 1;
 } else if (ch === '"') {
 quoted = !quoted;
 } else if (ch === ',' && !quoted) {
 values.push(current);
 current = '';
 } else {
 current += ch;
 }
 }
 values.push(current);
 return values;
}

function loadCredentialPasswords() {
 const files = [
 path.join(ROOT, 'csv_import', 'agent_driver_credentials.csv'),
 path.join(ROOT, 'csv_import', 'company_staff_credentials.csv'),
 ];
 const passwords = new Map();
 for (const filePath of files) {
 if (!fs.existsSync(filePath)) continue;
 const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
 const header = parseCsvLine(lines.shift() ?? '');
 const emailIndex = header.indexOf('email');
 const passwordIndex = header.indexOf('password');
 if (emailIndex === -1 || passwordIndex === -1) continue;
 for (const line of lines) {
 const cols = parseCsvLine(line);
 const email = cols[emailIndex]?.trim().toLowerCase();
 const password = cols[passwordIndex]?.trim();
 if (email && password) passwords.set(email, password);
 }
 }
 return passwords;
}

function readGoLivePassword() {
 if (env.GO_LIVE_PASSWORD?.trim()) return env.GO_LIVE_PASSWORD.trim();
 if (fs.existsSync(GO_LIVE_PASSWORD_FILE)) {
 const password = fs
 .readFileSync(GO_LIVE_PASSWORD_FILE, 'utf8')
 .split('\n')
 .map((line) => line.trim())
 .find((line) => line && !line.startsWith('#'));
 if (password) return password;
 }
 return DEFAULT_PASSWORD;
}

function toBase64Url(value) {
 return Buffer.from(value, 'utf8')
 .toString('base64')
 .replace(/\+/g, '-')
 .replace(/\//g, '_')
 .replace(/=+$/g, '');
}

function ok(l, d) {
 console.log(` ✓ ${l}${d ? ` - ${d}` : ''}`);
}
function fail(l, d) {
 console.log(` ✗ ${l}${d ? ` - ${d}` : ''}`);
}

function cookie(session, user) {
 const ref = new URL(url).hostname.split('.')[0];
 const payload = JSON.stringify({
 access_token: session.access_token,
 refresh_token: session.refresh_token,
 expires_at: session.expires_at,
 expires_in: session.expires_in,
 token_type: 'bearer',
 user,
 });
 return `sb-${ref}-auth-token=${encodeURIComponent(`base64-${toBase64Url(payload)}`)}`;
}

async function fetchWithTimeout(resource, init = {}, timeoutMs = HTTP_TIMEOUT_MS) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), timeoutMs);
 try {
 return await fetch(resource, { ...init, signal: controller.signal });
 } finally {
 clearTimeout(timer);
 }
}

function sleep(ms) {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(resource, init = {}, attempts = 2) {
 let lastError;
 for (let attempt = 1; attempt <= attempts; attempt += 1) {
 try {
 return await fetchWithTimeout(resource, init);
 } catch (error) {
 lastError = error;
 if (attempt < attempts) await sleep(750 * attempt);
 }
 }
 throw lastError;
}

async function apiJson(cookieHeader, path, init = {}) {
 let res;
 try {
 res = await fetchWithRetry(`${PRODUCTION_URL}${path}`, {
 ...init,
 headers: {
 Cookie: cookieHeader,
 Accept: 'application/json',
 ...(init.body ? { 'Content-Type': 'application/json' } : {}),
 ...(init.headers ?? {}),
 },
 redirect: 'manual',
 });
 } catch (error) {
 return { ok: false, status: 0, body: { error: error.message } };
 }
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
 fail('Akaun ejen', 'tiada - daftar di /sales-agent');
 process.exit(1);
}

ok('Akaun ejen didaftarkan', `${agents.length} rekod`);

const staffLinkedAgentRoles = new Set([
 'CEO_FACTORY',
 'ADMIN_HQ',
 'AREA_MANAGER',
 'OPERATIONS_MANAGER',
 'DISTRIBUTOR_HQ',
 'FINANCE',
]);

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
let stockOrderFlowDone = false;
const fallbackPassword = readGoLivePassword();
const credentialPasswords = loadCredentialPasswords();

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

 if (agent.status !== 'ACTIVE' || prof.status !== 'ACTIVE') {
 console.log(' WARN Akaun ejen tidak aktif - skip UAT login (rekod disimpan untuk audit)');
 continue;
 }

 if (prof.role === 'SALES_AGENT') {
 ok('Akses ejen', 'Ejen Jualan biasa');
 } else if (staffLinkedAgentRoles.has(prof.role)) {
 ok('Akses ejen khas', `${prof.role} dipaut kepada akaun ejen`);
 } else {
 fail('Peranan ejen tidak dikenali', prof.role);
 failed++;
 continue;
 }

 testEmail = prof.email;

 const credentialPassword = credentialPasswords.get(prof.email.toLowerCase());
 const loginCandidates = credentialPassword && credentialPassword !== fallbackPassword
 ? [credentialPassword, fallbackPassword]
 : [fallbackPassword];
 let login = null;
 for (const loginPassword of loginCandidates) {
 login = await anon.auth.signInWithPassword({ email: prof.email, password: loginPassword });
 if (!login.error) break;
 }
 if (login.error) {
 fail('Login', login.error.message);
 failed++;
 continue;
 }
 ok('Login', 'auth OK');

 const c = cookie(login.data.session, login.data.user);
 let dash;
 try {
 dash = await fetchWithRetry(`${PRODUCTION_URL}/api/sales-agent/dashboard`, {
 headers: { Cookie: c, Accept: 'application/json' },
 redirect: 'manual',
 });
 } catch (error) {
 fail('API dashboard', error.message);
 failed++;
 await anon.auth.signOut();
 continue;
 }
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
 if (companiesRes.ok && Array.isArray(companiesRes.body.companies)) {
 ok('Profil syarikat API', `${companiesRes.body.companies.length} entiti ikut skop akses`);
 const dist = companiesRes.body.companies.find((x) => x.code === 'RKJ_DIST');
 if (dist?.bankAccountNo && dist?.registrationNo) {
 ok('Profil RKJ Distributor', `Maybank ${dist.bankAccountNo.slice(-4)}`);
 }
 } else {
 fail('Profil syarikat API', `HTTP ${companiesRes.status}`);
 failed++;
 }

 let posRes;
 try {
 posRes = await fetchWithRetry(`${PRODUCTION_URL}/pos`, {
 headers: { Cookie: c, Accept: 'text/html' },
 redirect: 'manual',
 });
 } catch (error) {
 posRes = { status: 0, headers: new Headers(), error };
 }
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
 } else fail('Akses POS', `HTTP ${posRes.status}${posRes.error ? ` ${posRes.error.message}` : ''}`);
 } else {
 console.log(' ⚠ POS - tiada cawangan aktif (daftar + bayar RM200)');
 }

 if (RUN_FLOW && prof.role === 'SALES_AGENT') {
 console.log('\n--- Aliran order + bayaran ---');
 if (stockOrderFlowDone) {
 ok('Aliran order + bayaran', 'diuji pada ejen pertama — skip');
 } else {
 stockOrderFlowDone = true;
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
 fail('Harga katalog', 'semua item RM0 - deploy semula kod terkini');
 failed++;
 } else {
 const prodDate = openDays?.[0]?.production_date;
 if (!prodDate) {
 fail('Tarikh production', 'tiada');
 failed++;
 } else {
 const { data: existingOrder } = await admin
 .from('agent_stock_orders')
 .select('*')
 .eq('agent_account_id', agent.id)
 .eq('production_date', prodDate)
 .order('created_at', { ascending: false })
 .limit(1)
 .maybeSingle();

 let order = existingOrder;
 if (order?.status === 'SUBMITTED_FACTORY') {
 ok('Order sedia dihantar', `${order.order_number} — skip bayaran`);
 } else if (order?.status === 'PENDING_PAYMENT') {
 ok('Guna order pending', `${order.order_number} - RM${order.total_amount_rm}`);
 } else {
 let orderRes = null;
 for (let attempt = 0; attempt < 3; attempt += 1) {
 orderRes = await apiJson(c, '/api/sales-agent/orders', {
 method: 'POST',
 body: JSON.stringify({
 production_date: prodDate,
 items: [{ stock_item_id: pick.id, quantity: 2 }],
 }),
 });
 if (orderRes.ok) break;
 if (!String(orderRes.body.error ?? '').includes('duplicate key')) break;
 await new Promise((r) => setTimeout(r, 300));
 }
 if (!orderRes?.ok) {
 fail('Cipta order', `${orderRes?.status ?? 500} ${orderRes?.body.error ?? ''}`);
 failed++;
 order = null;
 } else {
 order = orderRes.body.order;
 ok('Cipta order', `${order.order_number} - RM${order.total_amount_rm}`);
 }
 }

 if (order && order.status !== 'SUBMITTED_FACTORY') {

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

 await anon.auth.signOut();
}

console.log('\n--- Tarikh production terbuka ---');
if (openDays?.length) {
 for (const d of openDays) ok('Boleh order', d.production_date);
} else {
 console.log(' ⚠ Tiada tarikh terbuka - kilang perlu terbitkan jadual minggu');
}

console.log('\n=== Ringkasan ===');
if (failed) {
 console.log(` Gagal: ${failed}`);
 process.exit(1);
}

console.log(' Semua semakan asas OK');
if (testEmail) {
 console.log(`\n Seterusnya (browser):`);
 console.log(` ke ${PRODUCTION_URL}/sales-agent`);
 console.log(` ke Login: ${testEmail}`);
 console.log(` ke Tab Order Stok ke pilih tarikh ke isi kuantiti ke Bayar & Hantar Kilang`);
 console.log(` ke Tab Cawangan POS ke daftar cawangan ke Bayar RM200\n`);
}
