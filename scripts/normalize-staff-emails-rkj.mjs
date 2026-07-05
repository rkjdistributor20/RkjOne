/**
 * Normalkan semua email staf ke {staff_code}@rkj.com
 *
 * Usage:
 * node scripts/normalize-staff-emails-rkj.mjs (dry-run)
 * node scripts/normalize-staff-emails-rkj.mjs --apply
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';

const APPLY = process.argv.includes('--apply');
const GROUP_OWNER_EMAIL = 'matisa@rkj.com';
const EXPORT_CSV = path.join(ROOT, 'csv_import', 'staff_emails_normalized.csv');

function staffLoginEmail(staffCode) {
 return `${String(staffCode).trim().toLowerCase()}@rkj.com`;
}

async function listAllAuthUsers(admin) {
 const users = [];
 let page = 1;
 while (page <= 30) {
 const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
 if (error) throw error;
 users.push(...data.users);
 if (data.users.length < 200) break;
 page += 1;
 }
 return users;
}

function unwrap(row) {
 if (!row) return null;
 return Array.isArray(row) ? row[0] ?? null : row;
}

async function main() {
 const env = loadProjectEnv();
 const url = env.NEXT_PUBLIC_SUPABASE_URL;
 const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !serviceKey) {
 console.error('Missing Supabase env (.env.local)');
 process.exit(1);
 }

 const admin = createClient(url, serviceKey, {
 auth: { autoRefreshToken: false, persistSession: false },
 });

 console.log(`\n=== Normalkan Email Staf ke @rkj.com ===`);
 console.log(`Mod: ${APPLY ? 'APPLY (tulis DB)' : 'DRY-RUN'}\n`);

 const { data: org, error: orgErr } = await admin
 .from('organizations')
 .select('id')
 .eq('code', 'RKJ')
 .single();
 if (orgErr || !org) throw orgErr ?? new Error('Org RKJ tiada');

 const { data: staffRows, error: staffErr } = await admin
 .from('staff')
 .select(
 `
 id,
 staff_code,
 full_name,
 profile_id,
 organization_id,
 profiles(id, email, role, employee_code, status)
 `
 )
 .eq('organization_id', org.id)
 .eq('status', 'ACTIVE')
 .not('profile_id', 'is', null)
 .order('staff_code');

 if (staffErr) throw staffErr;

 const authUsers = await listAllAuthUsers(admin);
 const authByEmail = new Map(
 authUsers.map((u) => [u.email?.toLowerCase() ?? '', u])
 );

 const processedProfiles = new Set();
 const results = [];
 const csvLines = ['staff_code,nama,email_lama,email_baru,status,nota'];

 for (const row of staffRows ?? []) {
 const profile = unwrap(row.profiles);
 if (!profile?.id || !row.profile_id) continue;

 const target = staffLoginEmail(row.staff_code);
 const current = (profile.email ?? '').toLowerCase();

 if (processedProfiles.has(profile.id)) {
 results.push({
 staff_code: row.staff_code,
 status: 'skipped',
 note: 'profil dikongsi (sudah diproses)',
 });
 csvLines.push(
 [row.staff_code, row.full_name, profile.email, target, 'SKIP', 'profil dikongsi'].join(',')
 );
 continue;
 }

 if (
 current === GROUP_OWNER_EMAIL.toLowerCase() &&
 profile.role === 'SUPER_ADMIN'
 ) {
 processedProfiles.add(profile.id);
 results.push({
 staff_code: row.staff_code,
 status: 'skipped',
 note: 'pemilik kumpulan - kekal matisa@rkj.com',
 });
 csvLines.push(
 [row.staff_code, row.full_name, profile.email, profile.email, 'SKIP', 'pemilik'].join(',')
 );
 continue;
 }

 if (current === target) {
 processedProfiles.add(profile.id);
 if (APPLY) {
 await admin.from('staff_portal_credentials').upsert(
 {
 staff_id: row.id,
 organization_id: org.id,
 login_email: target,
 updated_at: new Date().toISOString(),
 },
 { onConflict: 'staff_id', ignoreDuplicates: false }
 );
 }
 results.push({ staff_code: row.staff_code, status: 'ok', note: 'sudah @rkj.com' });
 csvLines.push([row.staff_code, row.full_name, profile.email, target, 'OK', ''].join(','));
 continue;
 }

 const taken = authByEmail.get(target);
 if (taken && taken.id !== profile.id) {
 results.push({
 staff_code: row.staff_code,
 status: 'conflict',
 note: `${target} sudah digunakan oleh auth lain`,
 });
 csvLines.push(
 [row.staff_code, row.full_name, profile.email, target, 'CONFLICT', 'email taken'].join(',')
 );
 continue;
 }

 if (APPLY) {
 const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
 email: target,
 email_confirm: true,
 });
 if (authErr) {
 results.push({
 staff_code: row.staff_code,
 status: 'error',
 note: authErr.message,
 });
 csvLines.push(
 [row.staff_code, row.full_name, profile.email, target, 'ERROR', authErr.message].join(',')
 );
 continue;
 }

 const { error: profErr } = await admin
 .from('profiles')
 .update({ email: target, updated_at: new Date().toISOString() })
 .eq('id', profile.id);
 if (profErr) {
 results.push({
 staff_code: row.staff_code,
 status: 'error',
 note: profErr.message,
 });
 continue;
 }

 await admin.from('staff_portal_credentials').upsert(
 {
 staff_id: row.id,
 organization_id: org.id,
 login_email: target,
 updated_at: new Date().toISOString(),
 },
 { onConflict: 'staff_id' }
 );

 authByEmail.delete(current);
 authByEmail.set(target, { id: profile.id, email: target });
 }

 processedProfiles.add(profile.id);
 results.push({
 staff_code: row.staff_code,
 status: APPLY ? 'updated' : 'would_update',
 from: profile.email,
 to: target,
 });
 csvLines.push(
 [row.staff_code, row.full_name, profile.email, target, APPLY ? 'UPDATED' : 'PLAN', ''].join(',')
 );
 console.log(` ${APPLY ? '✓' : ' ke '} ${row.staff_code}: ${profile.email} ke ${target}`);
 }

 fs.mkdirSync(path.dirname(EXPORT_CSV), { recursive: true });
 fs.writeFileSync(EXPORT_CSV, csvLines.join('\n'), 'utf8');

 const summary = {
 updated: results.filter((r) => r.status === 'updated' || r.status === 'would_update').length,
 ok: results.filter((r) => r.status === 'ok').length,
 skipped: results.filter((r) => r.status === 'skipped').length,
 conflict: results.filter((r) => r.status === 'conflict').length,
 error: results.filter((r) => r.status === 'error').length,
 };

 console.log('\n--- Ringkasan ---');
 console.log(` Dikemaskini: ${summary.updated}`);
 console.log(` Sudah OK: ${summary.ok}`);
 console.log(` Dilangkau: ${summary.skipped}`);
 console.log(` Konflik: ${summary.conflict}`);
 console.log(` Ralat: ${summary.error}`);
 console.log(` CSV: ${path.relative(ROOT, EXPORT_CSV)}`);

 if (!APPLY && summary.updated > 0) {
 console.log('\nJalankan: node scripts/normalize-staff-emails-rkj.mjs --apply\n');
 }

 process.exit(summary.conflict + summary.error > 0 ? 1 : 0);
}

main().catch((err) => {
 console.error(err);
 process.exit(1);
});
