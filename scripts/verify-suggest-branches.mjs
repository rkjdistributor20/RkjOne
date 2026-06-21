/**
 * Verify suggest_hq_factory_order returns all branches (service role, no auth.uid).
 * Run: node scripts/verify-suggest-branches.mjs
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const adminSb = createClient(url, key);
const userSb = anon ? createClient(url, anon) : null;

const { data: orgs } = await adminSb.from('organizations').select('id').limit(1);
const orgId = orgs?.[0]?.id;
if (!orgId) {
  console.error('No organization found');
  process.exit(1);
}

const { data: branches } = await adminSb
  .from('branches')
  .select('branch_code, status')
  .eq('organization_id', orgId)
  .order('branch_code');

console.log('Branches in DB:', branches?.length ?? 0);

let rpcClient = adminSb;
if (userSb) {
  const { error: signErr } = await userSb.auth.signInWithPassword({
    email: 'ibrahim@rkj.com',
    password: 'RkjOne@2025',
  });
  if (signErr) {
    console.warn('Sign-in failed:', signErr.message, '— trying service role only');
  } else {
    rpcClient = userSb;
    console.log('Signed in as ibrahim@rkj.com for RPC test');
  }
}

const { data, error } = await rpcClient.rpc('suggest_hq_factory_order', {
  p_production_date: '2026-06-22',
});

if (error) {
  console.error('RPC error:', error.message);
  process.exit(1);
}

const j = typeof data === 'string' ? JSON.parse(data) : data;
console.log('RPC branch_count:', j.branch_count);
console.log('RPC branches length:', j.branches?.length);

if (!j.branch_count && j.branches?.length === 0) {
  console.log('Note: RPC returned empty — check auth / org profile.');
}

const noKiosk = j.branches?.filter((b) => !b.has_kiosk).map((b) => b.branch_code) ?? [];
console.log('No kiosk:', noKiosk.join(', ') || '(none)');

const withSuggest =
  j.branches?.filter((b) => b.items?.some((i) => i.suggested_bags > 0)).length ?? 0;
console.log('Branches with AI suggestions:', withSuggest);

const sample = j.branches?.find((b) => b.branch_code === 'BR001');
if (sample) {
  console.log(
    'BR001:',
    JSON.stringify(
      {
        potential: sample.potential_factor,
        avg_sales: sample.avg_daily_sales,
        items: sample.items?.map((i) => ({
          code: i.item_code,
          stock: i.current_pcs,
          suggest: i.suggested_bags,
          status: i.stock_status,
        })),
      },
      null,
      2
    )
  );
}
