/**
 * Semak sambungan production Vercel + Supabase.
 * Usage: npm run verify:production
 */

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';

const checks = [];

function ok(label, detail) {
 checks.push({ ok: true, label, detail });
 console.log(` ✓ ${label}${detail ? ` - ${detail}` : ''}`);
}

function fail(label, detail) {
 checks.push({ ok: false, label, detail });
 console.log(` ✗ ${label}${detail ? ` - ${detail}` : ''}`);
}

async function fetchStatus(path, opts = {}) {
 const ctrl = new AbortController();
 const timer = setTimeout(() => ctrl.abort(), 20000);
 try {
 const res = await fetch(`${PRODUCTION_URL}${path}`, {
 redirect: 'manual',
 signal: ctrl.signal,
 ...opts,
 });
 clearTimeout(timer);
 return res;
 } catch (err) {
 clearTimeout(timer);
 throw err;
 }
}

console.log('\n=== RKJ One - Semakan Production ===\n');
console.log(`URL: ${PRODUCTION_URL}\n`);

console.log('1. Halaman awam');
try {
 const login = await fetchStatus('/login');
 login.status === 200
 ? ok('GET /login', `HTTP ${login.status}`)
 : fail('GET /login', `HTTP ${login.status}`);
} catch (e) {
 fail('GET /login', e.message);
}

try {
 const inv = await fetchStatus('/inventory');
 const loc = inv.headers.get('location') ?? '';
 inv.status === 307 && loc.includes('/login')
 ? ok('GET /inventory (tanpa auth)', `HTTP ${inv.status} ke login`)
 : fail('GET /inventory', `HTTP ${inv.status} loc=${loc}`);
} catch (e) {
 fail('GET /inventory', e.message);
}

console.log('\n2. API health');
try {
 const res = await fetchStatus('/api/health');
 if (!res.ok) {
 fail('GET /api/health', `HTTP ${res.status}`);
 } else {
 const body = await res.json();
 body.ok ? ok('Supabase via Vercel', `${body.supabase} - ${body.branches} cawangan`) : fail('Supabase via Vercel', body.supabase);
 body.commit ? ok('Deploy commit', body.commit) : fail('Deploy commit', 'tiada VERCEL_GIT_COMMIT_SHA');
 body.appUrl === PRODUCTION_URL
 ? ok('NEXT_PUBLIC_APP_URL', body.appUrl)
 : fail('NEXT_PUBLIC_APP_URL', `Vercel=${body.appUrl ?? 'null'} - jangka ${PRODUCTION_URL}`);
 }
} catch (e) {
 fail('GET /api/health', e.message);
}

console.log('\n3. GitHub master (banding commit)');
try {
 const res = await fetch('https://api.github.com/repos/rkjdistributor20/RkjOne/commits/master', {
 headers: { 'User-Agent': 'rkj-verify-production' },
 });
 const j = await res.json();
 res.ok ? ok('GitHub master', j.sha.slice(0, 7)) : fail('GitHub', `HTTP ${res.status}`);
} catch (e) {
 fail('GitHub', e.message);
}

const failed = checks.filter((c) => !c.ok).length;
console.log('\n=== Ringkasan ===');
console.log(` Lulus: ${checks.filter((c) => c.ok).length}`);
console.log(` Gagal: ${failed}\n`);

if (failed > 0) {
 console.log('==> Semak Vercel env: npm run deploy:env https://rkj-one.vercel.app\n');
 process.exit(1);
}

console.log('==> Production OK. UAT AM: login safuan@rkj.com ke /inventory\n');
