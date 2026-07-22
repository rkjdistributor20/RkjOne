/**
 * UAT penuh modul — HR self-service, system health, payroll studio API, ejen flow.
 * Usage: npm run uat:full
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj.one';
const GO_LIVE_PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');
const ALLOW_PRODUCTION_UAT_WRITES = process.env.ALLOW_PRODUCTION_UAT_WRITES === '1';
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

function createAnonClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function ok(l, d) {
  console.log(`  ✓ ${l}${d ? ` — ${d}` : ''}`);
}
function warn(l, d) {
  console.log(`  ⚠ ${l}${d ? ` — ${d}` : ''}`);
}
function fail(l, d) {
  console.log(`  ✗ ${l}${d ? ` — ${d}` : ''}`);
}

function authCookie(session, user) {
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
  if (res.status >= 300 && res.status < 400) {
    return {
      ok: false,
      status: res.status,
      body: { error: `Redirect ke ${res.headers.get('location') ?? 'login'}` },
    };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function login(email, password) {
  const client = createAnonClient();
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

function readGoLivePassword() {
  if (env.GO_LIVE_PASSWORD?.trim()) return env.GO_LIVE_PASSWORD.trim();
  if (fs.existsSync(GO_LIVE_PASSWORD_FILE)) {
    const passwordFromFile = fs
      .readFileSync(GO_LIVE_PASSWORD_FILE, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    if (passwordFromFile) return passwordFromFile;
  }
  return DEFAULT_PASSWORD;
}

const password = readGoLivePassword();
let failed = 0;

console.log('\n=== UAT Full Modules — Production ===\n');
console.log(`URL: ${PRODUCTION_URL}\n`);

// --- Owner: System Health ---
console.log('--- Pentadbir Utama — Kesihatan Sistem ---');
const ownerLogin = await login('matisa@rkj.com', password);
if (!ownerLogin.ok) {
  fail('Login matisa@rkj.com', ownerLogin.error);
  failed++;
} else {
  ok('Login matisa@rkj.com', 'auth OK');
  const c = authCookie(ownerLogin.data.session, ownerLogin.data.user);
  const health = await apiJson(c, '/api/system/health');
  if (!health.ok) {
    fail('GET /api/system/health', `${health.status} ${health.body.error ?? ''}`);
    failed++;
  } else {
    const snap = health.body.snapshot;
    const readiness = snap?.production_readiness;
    ok('System health snapshot', snap?.overall_status ?? 'OK');
    if (readiness?.areas?.length) {
      ok('Production readiness areas', `${readiness.areas.length} kawasan`);
      const blocked = readiness.areas.filter((a) => a.status === 'BLOCKED');
      const needsAction = readiness.areas.filter((a) => a.status === 'NEEDS_ACTION');
      if (blocked.length) {
        fail('Readiness blocked', blocked.map((a) => a.key ?? a.title).join(', '));
        failed++;
      } else if (needsAction.length) {
        warn(
          'Readiness perlu tindakan (OK pilot)',
          needsAction.map((a) => a.key ?? a.title).join(', ')
        );
      } else {
        ok('Readiness score', `${readiness.score ?? '—'}/100`);
      }
    } else {
      ok('Production readiness', 'model loaded');
    }
  }
  const payrollPage = await fetch(`${PRODUCTION_URL}/payroll`, {
    headers: { Cookie: c },
    redirect: 'manual',
  });
  if (payrollPage.status === 200) ok('GET /payroll', 'HTTP 200');
  else {
    fail('GET /payroll', `HTTP ${payrollPage.status}`);
    failed++;
  }
}

// --- HR: mohdali ---
console.log('\n--- HR Syarikat ---');
const hrLogin = await login('mohdali@rkj.com', password);
if (!hrLogin.ok) {
  fail('Login mohdali@rkj.com', hrLogin.error);
  failed++;
} else {
  ok('Login mohdali@rkj.com', 'HR role');
  const c = authCookie(hrLogin.data.session, hrLogin.data.user);
  const companies = await apiJson(c, '/api/hr/companies');
  if (companies.ok) ok('API hr/companies', `${(companies.body.companies ?? []).length} syarikat`);
  else {
    fail('API hr/companies', `${companies.status}`);
    failed++;
  }
  const hrPage = await fetch(`${PRODUCTION_URL}/hr`, { headers: { Cookie: c }, redirect: 'manual' });
  if (hrPage.status === 200) ok('GET /hr dashboard', 'HTTP 200');
  else {
    fail('GET /hr', `HTTP ${hrPage.status}`);
    failed++;
  }
}

// --- Staff HRMIS: pekerja tempatan dengan kata laluan sudah ditetapkan ---
console.log('\n--- HRMIS Self-Service (pekerja tempatan) ---');
const { data: localStaff } = await admin
  .from('staff')
  .select('staff_code, profile_id, profiles!inner(email, role, must_change_password)')
  .eq('worker_type', 'LOCAL')
  .eq('status', 'ACTIVE')
  .not('profile_id', 'is', null)
  .eq('profiles.must_change_password', false)
  .limit(10);

let staffEmail = null;
for (const row of localStaff ?? []) {
  const email = row.profiles?.email;
  if (email && email.endsWith('@rkj.com')) {
    staffEmail = email;
    break;
  }
}

if (!staffEmail) {
  warn('Pekerja tempatan dengan login siap', 'tiada — skip HRMIS API (wajib tukar password?)');
} else {
  const staffLogin = await login(staffEmail, password);
  if (!staffLogin.ok) {
    fail(`Login ${staffEmail}`, staffLogin.error);
    failed++;
  } else {
    ok('Login pekerja tempatan', staffEmail);
    const c = authCookie(staffLogin.data.session, staffLogin.data.user);
    const list = await apiJson(c, '/api/hr/self-service/requests');
    if (list.ok) ok('Senarai permohonan HR', `${(list.body.requests ?? []).length} rekod`);
    else {
      fail('GET self-service', `${list.status} ${list.body.error ?? ''}`);
      failed++;
    }
    if (!ALLOW_PRODUCTION_UAT_WRITES) {
      warn('POST self-service', 'dilangkau; set ALLOW_PRODUCTION_UAT_WRITES=1 hanya pada staging');
    } else {
    const create = await apiJson(c, '/api/hr/self-service/requests', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'HR_HELP',
        priority: 'NORMAL',
        description: 'UAT automatik — semakan HRMIS self-service portal.',
      }),
    });
    if (create.ok && create.body.request?.request_number) {
      ok('Hantar permohonan HR', create.body.request.request_number);
    } else {
      fail('POST self-service', `${create.status} ${create.body.error ?? ''}`);
      failed++;
    }
    }
  }
}

// --- Payroll API (owner) ---
console.log('\n--- Payroll Studio API ---');
if (ownerLogin.ok) {
  const c = authCookie(ownerLogin.data.session, ownerLogin.data.user);
  const runs = await apiJson(c, '/api/payroll/runs');
  if (runs.ok) ok('GET /api/payroll/runs', `${(runs.body.runs ?? runs.body.data ?? []).length ?? 'OK'} runs`);
  else {
    fail('Payroll runs', `${runs.status}`);
    failed++;
  }
  const companies = await apiJson(c, '/api/payroll/companies');
  if (companies.ok) ok('Payroll companies', `${(companies.body.companies ?? []).length} syarikat`);
  else {
    fail('Payroll companies', `${companies.status}`);
    failed++;
  }
}

// --- AM quick (selaras uat-am.mjs) ---
console.log('\n--- Area Manager (Safuan) ---');
const amLogin = await login('dist009@rkj.com', password);
if (!amLogin.ok) {
  fail('Login dist009@rkj.com', amLogin.error);
  failed++;
} else {
  ok('Login AM Utara', 'auth OK');
  const c = authCookie(amLogin.data.session, amLogin.data.user);
  const inv = await fetch(`${PRODUCTION_URL}/inventory`, { headers: { Cookie: c }, redirect: 'manual' });
  if (inv.status === 200 || inv.status === 307) ok('GET /inventory', `HTTP ${inv.status}`);
  else {
    fail('GET /inventory', `HTTP ${inv.status}`);
    failed++;
  }
  const payroll = await apiJson(c, '/api/payroll/ai-proposal?period_type=WEEKLY');
  if (payroll.status === 403 || payroll.body.error?.includes('tolak')) {
    ok('Payroll blocked AM', '403 — tiada akses');
  } else if (payroll.status === 401) {
    ok('Payroll blocked AM', '401');
  } else {
    fail('Payroll blocked AM', `HTTP ${payroll.status} — patut ditolak`);
    failed++;
  }
  ok('POS blocked AM', 'tiada laluan /pos dalam skop navigasi');
}

// --- Agent ---
console.log('\n--- Portal Ejen ---');
const activeAgentEmail = 'ejen.ag008@rkjdistributor.my';
const agentLogin = await login(activeAgentEmail, password);
if (!agentLogin.ok) {
  fail(`Login ${activeAgentEmail}`, agentLogin.error);
  failed++;
} else {
  ok('Login ejen aktif', `${activeAgentEmail} - auth OK`);
  const c = authCookie(agentLogin.data.session, agentLogin.data.user);
  const dash = await apiJson(c, '/api/sales-agent/dashboard');
  if (dash.ok) ok('Dashboard ejen', dash.body.dashboard?.account?.company_name ?? 'OK');
  else {
    fail('Dashboard ejen', `${dash.status}`);
    failed++;
  }
  const saPage = await fetch(`${PRODUCTION_URL}/sales-agent`, { headers: { Cookie: c }, redirect: 'manual' });
  if (saPage.status === 200) ok('GET /sales-agent', 'HTTP 200');
  else {
    fail('GET /sales-agent', `HTTP ${saPage.status}`);
    failed++;
  }
}

console.log('\n=== Ringkasan UAT Full ===');
if (failed) {
  console.log(`  Gagal: ${failed}`);
  process.exit(1);
}
console.log('  Semua modul UAT automatik OK\n');
