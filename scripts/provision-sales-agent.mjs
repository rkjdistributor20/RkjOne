/**
 * Pautkan akaun ejen sedia ada kepada pengguna SALES_AGENT.
 * Guna bila admin daftar syarikat ejen semasa login sebagai SUPER_ADMIN.
 *
 * Usage:
 *   node scripts/provision-sales-agent.mjs
 *   node scripts/provision-sales-agent.mjs --apply
 *   node scripts/provision-sales-agent.mjs --apply --email agent001@rkj.com
 */

import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const APPLY = process.argv.includes('--apply');
const emailArg = process.argv.find((a, i) => process.argv[i - 1] === '--email');
const AGENT_EMAIL = (emailArg ?? 'agent001@rkj.com').toLowerCase();
const PASSWORD = process.env.GO_LIVE_PASSWORD?.trim() || DEFAULT_PASSWORD;

const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

console.log('\n=== Provision Ejen Jualan ===\n');
console.log(`Mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
console.log(`Email ejen: ${AGENT_EMAIL}\n`);

const { data: org } = await admin.from('organizations').select('id').eq('code', 'RKJ').single();
const { data: agents, error: agentErr } = await admin
  .from('sales_agent_accounts')
  .select('id, company_name, profile_id, contact_email, legal_entity_id')
  .eq('organization_id', org.id);

if (agentErr || !agents?.length) {
  console.error('Tiada sales_agent_accounts — daftar syarikat di /sales-agent dahulu');
  process.exit(1);
}

const agent = agents[0];
const { data: linked } = await admin
  .from('profiles')
  .select('email, role, full_name')
  .eq('id', agent.profile_id)
  .single();

console.log(`Akaun: ${agent.company_name}`);
console.log(`Profil semasa: ${linked?.full_name} (${linked?.email}) — ${linked?.role}`);

if (linked?.role === 'SALES_AGENT' && linked?.email?.toLowerCase() === AGENT_EMAIL) {
  console.log('\n✓ Akaun ejen sudah dipaut dengan betul.\n');
  process.exit(0);
}

let userId;
const existing = await findUserByEmail(AGENT_EMAIL);

if (existing) {
  userId = existing.id;
  console.log(`Pengguna auth wujud: ${AGENT_EMAIL}`);
} else {
  console.log(`Akan cipta pengguna: ${AGENT_EMAIL}`);
  if (APPLY) {
    const { data, error } = await admin.auth.admin.createUser({
      email: AGENT_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: agent.company_name,
        role: 'SALES_AGENT',
        employee_code: 'AGENT001',
        legal_entity_code: 'RKJ_DIST',
      },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log('  ✓ Auth user dicipta');
  }
}

if (APPLY && userId) {
  const { error: profErr } = await admin
    .from('profiles')
    .update({
      role: 'SALES_AGENT',
      full_name: agent.company_name,
      email: AGENT_EMAIL,
      legal_entity_id: agent.legal_entity_id,
      employee_code: 'AGENT001',
      status: 'ACTIVE',
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (profErr) throw profErr;
  console.log('  ✓ Profil dikemas kini → SALES_AGENT');

  const { error: linkErr } = await admin
    .from('sales_agent_accounts')
    .update({
      profile_id: userId,
      contact_email: AGENT_EMAIL,
      contact_person: agent.company_name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agent.id);
  if (linkErr) throw linkErr;
  console.log('  ✓ sales_agent_accounts.profile_id dipaut');

  console.log('\n=== Selesai ===');
  console.log(`Login: ${AGENT_EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Portal: https://rkj-one.vercel.app/sales-agent\n`);
} else if (!APPLY) {
  console.log('\nDry-run — jalankan dengan --apply untuk tulis ke Supabase.\n');
}
