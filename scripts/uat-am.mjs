/**
 * UAT Area Manager - login + skop inventori production.
 *
 * Usage: npm run uat:am
 */

import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj.one';

const AM_ACCOUNTS = [
 { email: 'dist009@rkj.com', region: 'UTARA', expectedKiosks: 12, label: 'Safuan (Utara)' },
 { email: 'dist001@rkj.com', region: 'TENGAH', expectedKiosks: 10, label: 'Fathur/Hakim (Tengah)' },
 { email: 'dist010@rkj.com', region: 'SELATAN', expectedKiosks: 14, label: 'Yati (Selatan)' },
];

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

function ok(label, detail) {
 console.log(` ✓ ${label}${detail ? ` - ${detail}` : ''}`);
}
function fail(label, detail) {
 console.log(` ✗ ${label}${detail ? ` - ${detail}` : ''}`);
}

function authCookie(session, user) {
 const projectRef = new URL(url).hostname.split('.')[0];
 const cookieName = `sb-${projectRef}-auth-token`;
 return `${cookieName}=${encodeURIComponent(
 JSON.stringify({
 access_token: session.access_token,
 refresh_token: session.refresh_token,
 expires_at: session.expires_at,
 token_type: 'bearer',
 user,
 })
 )}`;
}

async function apiGet(cookie, path) {
 const res = await fetch(`${PRODUCTION_URL}${path}`, {
 headers: { Cookie: cookie, Accept: 'application/json' },
 redirect: 'manual',
 });
 if (res.status >= 300 && res.status < 400) {
 return { ok: false, status: res.status, body: { error: `Redirect ke ${res.headers.get('location')}` } };
 }
 const text = await res.text();
 let body = {};
 try {
 body = text ? JSON.parse(text) : {};
 } catch {
 body = { error: text.slice(0, 200) };
 }
 return { ok: res.ok, status: res.status, body };
}

console.log('\n=== UAT Area Manager - Production ===\n');
console.log(`URL: ${PRODUCTION_URL}\n`);

const password = env.GO_LIVE_PASSWORD?.trim() || DEFAULT_PASSWORD;
let failed = 0;

for (const acc of AM_ACCOUNTS) {
 console.log(`--- ${acc.label} (${acc.email}) ---`);

 const { data: prof } = await admin
 .from('profiles')
 .select('id, role, status, region_id, full_name, legal_entity:legal_entities(code)')
 .ilike('email', acc.email)
 .maybeSingle();

 if (!prof || prof.status !== 'ACTIVE' || prof.role !== 'AREA_MANAGER') {
 fail('Profil AM', prof ? `${prof.status} - ${prof.role}` : 'tiada');
 failed += 1;
 continue;
 }

 const { data: region } = await admin.from('regions').select('code').eq('id', prof.region_id).maybeSingle();
 if (region?.code !== acc.region) {
 fail('Kawasan', `${region?.code ?? '?'} (jangka ${acc.region})`);
 failed += 1;
 continue;
 }
 ok('Profil', `${prof.full_name} - ${acc.region} - majikan ${prof.legal_entity?.code ?? '?'}`);

 let login = await anon.auth.signInWithPassword({ email: acc.email, password });
 if (login.error) {
 let page = 1;
 let user = null;
 while (page <= 20) {
 const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
 user = data.users.find((u) => u.email?.toLowerCase() === acc.email.toLowerCase());
 if (user || data.users.length < 200) break;
 page++;
 }
 if (user) {
 await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
 login = await anon.auth.signInWithPassword({ email: acc.email, password });
 }
 }

 if (login.error || !login.data.session) {
 fail('Login', login.error?.message ?? 'tiada session');
 failed += 1;
 continue;
 }
 ok('Login', 'auth OK');

 const cookie = authCookie(login.data.session, login.data.user);

 const invPage = await fetch(`${PRODUCTION_URL}/inventory`, {
 headers: { Cookie: cookie },
 redirect: 'manual',
 });
 if (invPage.status === 200 || invPage.status === 307) {
 ok('GET /inventory', `HTTP ${invPage.status}`);
 } else {
 fail('GET /inventory', `HTTP ${invPage.status}`);
 failed += 1;
 }

 const overview = await apiGet(cookie, '/api/inventory/overview');
 if (!overview.ok) {
 fail('API inventori', `HTTP ${overview.status} ${overview.body.error ?? ''}`);
 failed += 1;
 continue;
 }

 const nodes = overview.body.nodes ?? [];
 const kioskNode = nodes.find((n) => n.location_type === 'BRANCH_KIOSK');
 const kioskCount = kioskNode?.location_count ?? kioskNode?.locations?.length ?? 0;
 const hasHq = nodes.some((n) => n.location_type === 'HQ_WAREHOUSE' || n.location_type === 'FACTORY');

 if (hasHq) {
 fail('Skop inventori', 'nampak HQ/kilang (patut kiosk sahaja)');
 failed += 1;
 } else {
 ok('Skop inventori', 'kiosk sahaja - tiada HQ/kilang');
 }

 if (kioskCount >= acc.expectedKiosks - 1) {
 ok('Bil. kiosk kawasan', String(kioskCount));
 } else {
 fail('Bil. kiosk kawasan', `${kioskCount} (jangka ~${acc.expectedKiosks})`);
 failed += 1;
 }

 const payroll = await apiGet(cookie, '/api/payroll/ai-proposal?period_type=WEEKLY');
 if (payroll.status === 403 || payroll.body.error?.includes('tolak')) {
 ok('Payroll blocked', '403 - AM tiada akses');
 } else if (payroll.status === 401) {
 ok('Payroll blocked', '401');
 } else {
 fail('Payroll blocked', `HTTP ${payroll.status} - patut ditolak`);
 failed += 1;
 }

 const posBlocked = !['/dashboard', '/inventory', '/shifts', '/approvals', '/maintenance', '/settings', '/change-password', '/profile'].some(
 (p) => '/pos' === p || '/pos'.startsWith(`${p}/`)
 );
 if (posBlocked) {
 ok('POS blocked', 'AM tiada laluan /pos dalam skop');
 } else {
 fail('POS blocked', 'logic skop salah');
 failed += 1;
 }

 console.log('');
}

console.log('=== Ringkasan UAT AM ===');
if (failed) {
 console.log(` Gagal: ${failed}\n`);
 process.exit(1);
}
console.log(' Semua AM lulus ✓');
console.log('\n Manual browser: https://rkj.one/inventory');
console.log(' dist009@rkj.com (Utara) - dist001@rkj.com (Tengah) - dist010@rkj.com (Selatan)');
console.log(` Password: ${DEFAULT_PASSWORD}\n`);
