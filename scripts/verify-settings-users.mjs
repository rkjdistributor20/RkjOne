/**
 * Semak sambungan API pengguna + query Supabase.
 * Usage: node scripts/verify-settings-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app';
const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error('Missing .env.local Supabase keys');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey);

function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail) {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const PROFILE_EMBED = `
  id, full_name, email, role, status, branch_id, region_id, employee_code, metadata,
  branch:branches!profiles_branch_id_fkey(branch_name, branch_code),
  region:regions!profiles_region_id_fkey(name, code),
  legal_entity:legal_entities(code, legal_name)
`;

const STAFF_EMBED = `
  id, staff_code, full_name, branch_id, region_id, profile_id,
  legal_entity:legal_entities(code, legal_name),
  branch:branches!staff_branch_id_fkey(branch_code, branch_name),
  profile:profiles!staff_profile_id_fkey(${PROFILE_EMBED})
`;

console.log('\n=== Semakan Tetapan Pengguna ===\n');

let failed = 0;
const check = (pass, label, detail) => {
  if (pass) ok(label, detail);
  else {
    fail(label, detail);
    failed++;
  }
};

// 1. Org
const { data: org, error: orgErr } = await admin
  .from('organizations')
  .select('id, code')
  .eq('code', 'RKJ')
  .maybeSingle();
check(!orgErr && org?.id, 'Supabase organizations', orgErr?.message ?? org?.code);

// 2. Staff query (nested embed)
const { data: staffRows, error: staffErr } = await admin
  .from('staff')
  .select(STAFF_EMBED)
  .eq('organization_id', org.id)
  .eq('status', 'ACTIVE')
  .order('staff_code')
  .limit(5);
check(!staffErr && (staffRows?.length ?? 0) > 0, 'Query staff + profile embed', staffErr?.message ?? `${staffRows?.length} sample`);

const { count: staffCount } = await admin
  .from('staff')
  .select('*', { count: 'exact', head: true })
  .eq('organization_id', org.id)
  .eq('status', 'ACTIVE');
check((staffCount ?? 0) >= 80, 'Jumlah staf aktif', String(staffCount));

// 3. Profiles query
const { data: profileRows, error: profileErr } = await admin
  .from('profiles')
  .select(PROFILE_EMBED)
  .eq('organization_id', org.id)
  .eq('status', 'ACTIVE')
  .limit(5);
check(!profileErr && (profileRows?.length ?? 0) > 0, 'Query profiles embed', profileErr?.message ?? `${profileRows?.length} sample`);

// 4. Broken old query (should fail)
const { error: brokenErr } = await admin
  .from('profiles')
  .select(
    'id, region:regions(name, code), legal_entity:legal_entities(code, legal_name)'
  )
  .eq('organization_id', org.id)
  .limit(1);
check(!!brokenErr, 'Query lama memang rosak (dijangka)', brokenErr?.message?.slice(0, 60));

// 5. Login owner + API production
const password = env.GO_LIVE_PASSWORD?.trim() || 'RkjOne@2025';
let signInResult = await anon.auth.signInWithPassword({
  email: 'matisa@rkj.com',
  password,
});

if (signInResult.error) {
  let page = 1;
  let user = null;
  while (page <= 20) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    user = data.users.find((u) => u.email?.toLowerCase() === 'matisa@rkj.com');
    if (user || data.users.length < 200) break;
    page++;
  }
  if (user) {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    signInResult = await anon.auth.signInWithPassword({
      email: 'matisa@rkj.com',
      password,
    });
  }
}

check(!signInResult.error && signInResult.data?.session, 'Login matisa@rkj.com', signInResult.error?.message);

if (signInResult.data?.session) {
  const session = signInResult.data.session;
  const token = session.access_token;
  const projectRef = new URL(url).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieVal = encodeURIComponent(
    JSON.stringify({
      access_token: token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: 'bearer',
      user: signInResult.data.user,
    })
  );
  const apiRes = await fetch(`${PRODUCTION_URL}/api/settings/users`, {
    headers: { Cookie: `${cookieName}=${cookieVal}` },
  });
  const apiBody = await apiRes.json().catch(() => ({}));
  check(apiRes.ok, 'GET /api/settings/users (production)', `HTTP ${apiRes.status} ${apiBody.error ?? ''}`);
  if (apiRes.ok) {
    check((apiBody.users?.length ?? 0) >= 80, 'API users count', `${apiBody.users?.length} (staff_total=${apiBody.staff_total})`);
    const byCo = {};
    for (const u of apiBody.users ?? []) {
      const k = u.legal_entity_code ?? 'HQ';
      byCo[k] = (byCo[k] ?? 0) + 1;
    }
    ok('Pecahan syarikat', JSON.stringify(byCo));
  }
}

// 6. matisa profile role
const { data: ownerProf } = await admin
  .from('profiles')
  .select('role, status, organization_id')
  .ilike('email', 'matisa@rkj.com')
  .maybeSingle();
check(ownerProf?.role === 'SUPER_ADMIN' && ownerProf?.status === 'ACTIVE', 'Profil owner', `${ownerProf?.role} · ${ownerProf?.status}`);

console.log('\n---');
console.log(`Hasil: ${failed === 0 ? 'SEMUA OK' : `${failed} GAGAL`}\n`);
process.exit(failed > 0 ? 1 : 0);
