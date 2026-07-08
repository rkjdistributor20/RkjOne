/**
 * UAT Payroll - cadangan AI + hantar slip (production API).
 *
 * Usage:
 * npm run uat:payroll # mingguan sahaja
 * npm run uat:payroll -- --monthly # bulanan sahaja
 * npm run uat:payroll -- --both # mingguan + bulanan
 * npm run uat:payroll -- --proposal-only # jana cadangan tanpa hantar
 * npm run uat:payroll -- --hr dist006@rkj.com
 */

import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj.one';
const args = process.argv.slice(2);
const proposalOnly = args.includes('--proposal-only');
const runWeekly = args.includes('--both') || (!args.includes('--monthly') && !args.includes('--both') ? true : args.includes('--both'));
const runMonthly = args.includes('--both') || args.includes('--monthly');
const hrEmailArg = args.find((a) => a.startsWith('--hr='))?.slice(5)
 ?? (args.includes('--hr') ? args[args.indexOf('--hr') + 1] : null)
 ?? 'dist006@rkj.com';

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

function ok(label, detail) {
 console.log(` ✓ ${label}${detail ? ` - ${detail}` : ''}`);
}
function fail(label, detail) {
 console.log(` ✗ ${label}${detail ? ` - ${detail}` : ''}`);
}

function authCookie(session, user) {
 const projectRef = new URL(url).hostname.split('.')[0];
 const cookieName = `sb-${projectRef}-auth-token`;
 const cookieVal = encodeURIComponent(
 JSON.stringify({
 access_token: session.access_token,
 refresh_token: session.refresh_token,
 expires_at: session.expires_at,
 token_type: 'bearer',
 user,
 })
 );
 return `${cookieName}=${cookieVal}`;
}

async function resolveHrEmail() {
 const candidates = [hrEmailArg, 'dist006@rkj.com', 'mfg018@rkj.com', 'matisa@rkj.com'];
 const seen = new Set();
 for (const email of candidates) {
 const key = email.toLowerCase();
 if (seen.has(key)) continue;
 seen.add(key);
 const { data: prof } = await admin
 .from('profiles')
 .select('email, role, status, full_name')
 .ilike('email', key)
 .maybeSingle();
 if (!prof) continue;
 if (!['HR', 'SUPER_ADMIN', 'ADMIN'].includes(prof.role)) continue;
 if (prof.status !== 'ACTIVE') {
 console.log(` - ${prof.email} (${prof.role}) - INACTIVE, cuba seterusnya`);
 continue;
 }
 return prof;
 }
 return null;
}

async function loginAs(email, password) {
 const { data, error } = await anon.auth.signInWithPassword({ email, password });
 if (error) return { error };
 return { session: data.session, user: data.user };
}

async function apiGet(cookie, path) {
 const res = await fetch(`${PRODUCTION_URL}${path}`, {
 headers: { Cookie: cookie, Accept: 'application/json' },
 redirect: 'manual',
 });
 if (res.status >= 300 && res.status < 400) {
 return {
 ok: false,
 status: res.status,
 body: { error: `Redirect ke ${res.headers.get('location') ?? 'login'}` },
 };
 }
 const text = await res.text();
 let body = {};
 try {
 body = text ? JSON.parse(text) : {};
 } catch {
 body = { error: text.slice(0, 300) };
 }
 return { ok: res.ok, status: res.status, body };
}

async function apiPost(cookie, path, payload) {
 const res = await fetch(`${PRODUCTION_URL}${path}`, {
 method: 'POST',
 headers: { Cookie: cookie, Accept: 'application/json', 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 redirect: 'manual',
 });
 if (res.status >= 300 && res.status < 400) {
 return {
 ok: false,
 status: res.status,
 body: { error: `Redirect ke ${res.headers.get('location') ?? 'login'}` },
 };
 }
 const text = await res.text();
 let body = {};
 try {
 body = text ? JSON.parse(text) : {};
 } catch {
 body = { error: text.slice(0, 300) };
 }
 return { ok: res.ok, status: res.status, body };
}

async function runPeriod(cookie, periodType, label) {
 console.log(`\n--- ${label} (${periodType}) ---`);

 const propRes = await apiGet(cookie, `/api/payroll/ai-proposal?period_type=${periodType}`);
 if (!propRes.ok) {
 fail(`Cadangan AI ${periodType}`, `HTTP ${propRes.status} ${propRes.body.error ?? JSON.stringify(propRes.body).slice(0, 200)}`);
 return false;
 }

 const proposal = propRes.body.proposal;
 if (!proposal) {
 fail(`Cadangan AI ${periodType}`, `tiada proposal - keys: ${Object.keys(propRes.body).join(', ') || '(empty)'}`);
 if (propRes.body.error) console.log(` error: ${propRes.body.error}`);
 return false;
 }

 const t = proposal.totals;
 ok(
 `Cadangan AI ${periodType}`,
 `${proposal.period_label} - ${t.staff_count} staf - kasar ${t.gross.toFixed(2)} - bersih ${t.net.toFixed(2)}`
 );
 ok('Pecahan syarikat', proposal.companies.map((c) => `${c.company_code}:${c.foreign_lines.length}A+${c.local_lines.length}T`).join(' - '));

 if (proposalOnly) {
 console.log(' (proposal-only - langkau hantar slip)');
 return true;
 }

 const distRes = await apiPost(cookie, '/api/payroll/distribute-payslips', {
 period_type: periodType,
 period_start: proposal.period_start,
 period_end: proposal.period_end,
 period_label: proposal.period_label,
 proposal,
 create_payroll_run: true,
 });

 if (!distRes.ok) {
 fail(`Hantar slip ${periodType}`, `HTTP ${distRes.status} ${distRes.body.error ?? JSON.stringify(distRes.body).slice(0, 120)}`);
 return false;
 }

 ok(
 `Hantar slip ${periodType}`,
 `${distRes.body.distributed} dihantar - ${distRes.body.skipped ?? 0} dilangkau - run ${distRes.body.payroll_run_id?.slice(0, 8) ?? ' - '}`
 );
 if (distRes.body.errors?.length) {
 fail('Ralat sebahagian', `${distRes.body.errors.length} - ${distRes.body.errors.slice(0, 3).join('; ')}`);
 }
 return true;
}

console.log('\n=== UAT Payroll - Production ===\n');
console.log(`URL: ${PRODUCTION_URL}`);
console.log(`Mod: ${proposalOnly ? 'cadangan sahaja' : 'cadangan + hantar slip'}`);

const password = env.GO_LIVE_PASSWORD?.trim() || DEFAULT_PASSWORD;
const hrProf = await resolveHrEmail();
if (!hrProf) {
 console.error('Tiada akaun HR/Admin aktif dijumpai.');
 process.exit(1);
}

console.log(`HR: ${hrProf.email} (${hrProf.role}) - ${hrProf.full_name}`);

let login = await loginAs(hrProf.email, password);
if (login.error) {
 console.log(` Login gagal (${login.error.message}) - reset password...`);
 let page = 1;
 let authUser = null;
 while (page <= 20) {
 const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
 authUser = data.users.find((u) => u.email?.toLowerCase() === hrProf.email.toLowerCase());
 if (authUser || data.users.length < 200) break;
 page++;
 }
 if (authUser) {
 await admin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
 login = await loginAs(hrProf.email, password);
 }
}

if (login.error || !login.session) {
 fail('Login HR', login.error?.message ?? 'tiada session');
 process.exit(1);
}
ok('Login HR', hrProf.email);

const { count: payslipBefore } = await admin
 .from('staff_payslips')
 .select('*', { count: 'exact', head: true });

ok('Payslip sebelum UAT', String(payslipBefore ?? 0));

const cookie = authCookie(login.session, login.user);
let passed = 0;
let failed = 0;

if (runWeekly) {
 (await runPeriod(cookie, 'WEEKLY', 'Gaji mingguan (asing)')) ? (passed += 1) : (failed += 1);
}
if (runMonthly) {
 (await runPeriod(cookie, 'MONTHLY', 'Gaji bulanan (tempatan)')) ? (passed += 1) : (failed += 1);
}

const { count: payslipAfter } = await admin
 .from('staff_payslips')
 .select('*', { count: 'exact', head: true });

ok('Payslip selepas UAT', `${payslipAfter ?? 0} (+${(payslipAfter ?? 0) - (payslipBefore ?? 0)})`);

console.log('\n--- Semak portal staf (s001@rkj.com) ---');
const staffLogin = await loginAs('s001@rkj.com', password);
if (staffLogin.error || !staffLogin.session) {
 fail('Login staf S001', staffLogin.error?.message ?? 'tiada session');
} else {
 ok('Login staf S001', 'auth OK');
 const staffCookie = authCookie(staffLogin.session, staffLogin.user);
 const myPayroll = await apiGet(staffCookie, '/api/me/payroll');
 if (!myPayroll.ok) {
 fail('GET /api/me/payroll', `HTTP ${myPayroll.status}`);
 } else {
 const slips = myPayroll.body.payroll?.payslips ?? [];
 ok('Slip di dashboard staf', `${slips.length} rekod`);
 if (slips.length > 0) {
 const withUrl = slips.filter((s) => s.download_url).length;
 ok('URL muat turun', `${withUrl}/${slips.length} ada signed URL`);
 }
 }
}

console.log('\n=== Ringkasan UAT ===');
console.log(` Langkah lulus: ${passed}`);
console.log(` Langkah gagal: ${failed}`);
console.log(
 failed === 0 && !proposalOnly
 ? '\n==> UAT Payroll OK. Semak browser: dist006@rkj.com ke /payroll - s001@rkj.com ke Dashboard\n'
 : failed === 0
 ? '\n==> Cadangan OK (belum hantar slip).\n'
 : '\n==> Ada kegagalan - semak log di atas.\n'
);

process.exit(failed > 0 ? 1 : 0);
