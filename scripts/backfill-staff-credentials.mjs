/**
 * Backfill akaun portal + kredensial untuk semua staf kiosk sedia ada.
 *
 * Usage: npm run backfill:staff-credentials
 * npm run backfill:staff-credentials -- --force (reset semua kredensial)
 *
 * Perlu .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DEFAULT_PASSWORD = process.env.RKJ_INITIAL_PASSWORD?.trim();
if (!DEFAULT_PASSWORD) throw new Error('RKJ_INITIAL_PASSWORD is required');
const EXCLUDED_STAFF_CODES = new Set(['S015', 'S020', 'S045']);

function loadEnvFile(filePath) {
 if (!fs.existsSync(filePath)) return {};
 const out = {};
 for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
 const trimmed = line.trim();
 if (!trimmed || trimmed.startsWith('#')) continue;
 const eq = trimmed.indexOf('=');
 if (eq === -1) continue;
 const key = trimmed.slice(0, eq).trim();
 let val = trimmed.slice(eq + 1).trim();
 if (
 (val.startsWith('"') && val.endsWith('"')) ||
 (val.startsWith("'") && val.endsWith("'"))
 ) {
 val = val.slice(1, -1);
 }
 out[key] = val;
 }
 return out;
}

function staffLoginEmail(staffCode) {
 return `${staffCode.trim().toLowerCase()}@rkj.com`;
}

async function findUserByEmail(supabase, email) {
 const target = email.toLowerCase();
 let page = 1;
 while (page <= 20) {
 const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
 if (error) throw error;
 const hit = data.users.find((u) => u.email?.toLowerCase() === target);
 if (hit) return hit;
 if (data.users.length < 200) break;
 page += 1;
 }
 return null;
}

async function ensureStaffPortal(supabase, staff, orgId, force) {
 const email = staffLoginEmail(staff.staff_code);

 if (!force) {
 const { data: existingCred } = await supabase
 .from('staff_portal_credentials')
 .select('staff_id')
 .eq('staff_id', staff.id)
 .maybeSingle();
 if (existingCred) {
 return { status: 'skipped', email };
 }
 }

 const password = DEFAULT_PASSWORD;
 const existing = await findUserByEmail(supabase, email);
 let userId;

 if (existing) {
 const { error } = await supabase.auth.admin.updateUserById(existing.id, {
 password,
 email_confirm: true,
 user_metadata: {
 full_name: staff.full_name,
 role: 'STAFF',
 employee_code: staff.staff_code,
 },
 });
 if (error) throw new Error(`${email}: ${error.message}`);
 userId = existing.id;
 } else {
 const { data, error } = await supabase.auth.admin.createUser({
 email,
 password,
 email_confirm: true,
 user_metadata: {
 full_name: staff.full_name,
 role: 'STAFF',
 employee_code: staff.staff_code,
 },
 });
 if (error) throw new Error(`${email}: ${error.message}`);
 userId = data.user.id;
 }

 const { error: profileErr } = await supabase
 .from('profiles')
 .update({
 organization_id: orgId,
 full_name: staff.full_name,
 email,
 role: 'STAFF',
 branch_id: staff.branch_id,
 region_id: staff.region_id,
 employee_code: staff.staff_code,
 status: 'ACTIVE',
 must_change_password: true,
 })
 .eq('id', userId);

 if (profileErr) throw new Error(`${email} profile: ${profileErr.message}`);

 const { error: linkErr } = await supabase
 .from('staff')
 .update({ profile_id: userId })
 .eq('id', staff.id);

 if (linkErr) throw new Error(`${email} staff link: ${linkErr.message}`);

 const { error: credErr } = await supabase.from('staff_portal_credentials').upsert(
 {
 staff_id: staff.id,
 organization_id: orgId,
 login_email: email,
 portal_password: password,
 updated_at: new Date().toISOString(),
 },
 { onConflict: 'staff_id' }
 );

 if (credErr) throw new Error(`${email} creds: ${credErr.message}`);

 return { status: existing ? 'updated' : 'created', email, password };
}

async function main() {
 const force = process.argv.includes('--force');
 const env = {
 ...loadEnvFile(path.join(ROOT, '.env.local')),
 ...process.env,
 };

 const url = env.NEXT_PUBLIC_SUPABASE_URL;
 const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

 if (!url || !serviceKey) {
 console.error('❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
 process.exit(1);
 }

 const supabase = createClient(url, serviceKey);

 const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
 if (!org) {
 console.error('❌ Organization not found');
 process.exit(1);
 }

 const { data: staffList, error } = await supabase
 .from('staff')
 .select('id, staff_code, full_name, branch_id, region_id, profile_id, status')
 .eq('organization_id', org.id)
 .eq('status', 'ACTIVE')
 .not('branch_id', 'is', null)
 .order('staff_code');

 if (error) {
 console.error('❌', error.message);
 process.exit(1);
 }

 console.log('\n=== Backfill Kredensial Staf ===\n');
 if (force) console.log('Mod: --force (reset semua kredensial)\n');

 let created = 0;
 let updated = 0;
 let skipped = 0;
 let failed = 0;
 const csvRows = ['staff_code,full_name,login_email,password,status'];

 for (const s of staffList ?? []) {
 if (EXCLUDED_STAFF_CODES.has(s.staff_code)) {
 console.log(` - ${s.staff_code} (dilangkau)`);
 skipped += 1;
 continue;
 }

 try {
 const result = await ensureStaffPortal(supabase, s, org.id, force);
 if (result.status === 'skipped') {
 console.log(` ○ ${s.staff_code} - kredensial sedia ada`);
 skipped += 1;
 } else {
 console.log(` ✓ ${s.staff_code} - ${result.status} (${result.email})`);
 if (result.status === 'created') created += 1;
 else updated += 1;
 csvRows.push(
 `${s.staff_code},${JSON.stringify(s.full_name)},${result.email},${result.password},${result.status}`
 );
 }
 } catch (err) {
 console.log(` ✗ ${s.staff_code} - ${err.message}`);
 failed += 1;
 }
 }

 const csvPath = path.join(ROOT, 'csv_import', 'staff_credentials_backfill.csv');
 fs.mkdirSync(path.dirname(csvPath), { recursive: true });
 fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

 console.log('\n=== Ringkasan ===');
 console.log(` Dicipta: ${created}`);
 console.log(` Dikemas kini: ${updated}`);
 console.log(` Dilangkau: ${skipped}`);
 console.log(` Gagal: ${failed}`);
 console.log(`\n📄 Senarai: ${csvPath}`);
 console.log(`🔑 Kata laluan default: ${DEFAULT_PASSWORD}`);
 console.log(' Staf mesti tukar password pada log masuk pertama.\n');

 process.exit(failed > 0 ? 1 : 0);
}

main();
