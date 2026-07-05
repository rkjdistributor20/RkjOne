/**
 * Padam semua rekod staf dan profil INACTIVE (termasuk akaun auth pendua).
 *
 * Usage:
 * node scripts/purge-inactive-staff.mjs
 * node scripts/purge-inactive-staff.mjs --apply
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

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

const env = {
 ...loadEnvFile(path.join(ROOT, '.env.example')),
 ...loadEnvFile(path.join(ROOT, '.env.local')),
 ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
 console.error('Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY');
 process.exit(1);
}

const supabase = createClient(url, serviceKey, {
 auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n=== Buang Staf / Profil INACTIVE ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===\n`);

const { data: org } = await supabase.from('organizations').select('id').eq('code', 'RKJ').single();
if (!org?.id) throw new Error('Organisasi RKJ tidak dijumpai');

const { data: inactiveStaff } = await supabase
 .from('staff')
 .select('id, staff_code, full_name, profile_id')
 .eq('organization_id', org.id)
 .eq('status', 'INACTIVE');

const { data: inactiveProfiles } = await supabase
 .from('profiles')
 .select('id, email, full_name, role, employee_code, metadata')
 .eq('organization_id', org.id)
 .eq('status', 'INACTIVE');

console.log(`Staf INACTIVE: ${inactiveStaff?.length ?? 0}`);
console.log(`Profil INACTIVE: ${inactiveProfiles?.length ?? 0}\n`);

const staffToDelete = [];
for (const row of inactiveStaff ?? []) {
 const { count } = await supabase
 .from('staff_shifts')
 .select('id', { count: 'exact', head: true })
 .eq('staff_id', row.id);
 if ((count ?? 0) > 0) {
 console.log(` skip staf ${row.staff_code} - ada ${count} rekod syif`);
 continue;
 }
 staffToDelete.push(row);
 console.log(` staf: ${row.staff_code} - ${row.full_name}`);
}

const profileIdsFromStaff = new Set(
 staffToDelete.map((s) => s.profile_id).filter(Boolean)
);

const profilesToDelete = [];
for (const row of inactiveProfiles ?? []) {
 console.log(` profil: ${row.email ?? ' - '} - ${row.full_name} - ${row.role}`);
 profilesToDelete.push(row);
}

if (!APPLY) {
 console.log(
 `\nDry run: ${staffToDelete.length} staf + ${profilesToDelete.length} profil/auth akan dipadam.\nGuna --apply untuk laksana.\n`
 );
 process.exit(0);
}

let deletedStaff = 0;
for (const row of staffToDelete) {
 await supabase.from('staff_portal_credentials').delete().eq('staff_id', row.id);
 const { error } = await supabase.from('staff').delete().eq('id', row.id);
 if (error) {
 console.log(` ✗ Gagal padam staf ${row.staff_code}: ${error.message}`);
 continue;
 }
 deletedStaff += 1;
 console.log(` ✓ Padam staf ${row.staff_code}`);
}

const deletedUsers = new Set();
for (const row of profilesToDelete) {
 if (deletedUsers.has(row.id)) continue;

 const { data: linkedStaff } = await supabase
 .from('staff')
 .select('id, staff_code, status')
 .eq('profile_id', row.id);

 const activeLinks = (linkedStaff ?? []).filter((s) => s.status === 'ACTIVE');
 if (activeLinks.length > 0) {
 console.log(` skip profil ${row.email} - masih ada staf aktif`);
 continue;
 }

 for (const staff of linkedStaff ?? []) {
 await supabase.from('staff_portal_credentials').delete().eq('staff_id', staff.id);
 await supabase.from('staff').delete().eq('id', staff.id);
 }

 const { data: driverRows } = await supabase
 .from('drivers')
 .select('id')
 .eq('profile_id', row.id);
 for (const driver of driverRows ?? []) {
 await supabase.from('vehicles').update({ default_driver_id: null }).eq('default_driver_id', driver.id);
 await supabase.from('drivers').delete().eq('id', driver.id);
 }

 await supabase.from('profile_branch_access').delete().eq('profile_id', row.id);

 const { error: authErr } = await supabase.auth.admin.deleteUser(row.id);
 if (authErr) {
 const { error: profileErr } = await supabase.from('profiles').delete().eq('id', row.id);
 if (profileErr) {
 console.log(` ✗ Gagal padam ${row.email}: ${profileErr.message}`);
 continue;
 }
 }

 deletedUsers.add(row.id);
 console.log(` ✓ Padam profil/auth ${row.email ?? row.id}`);
}

console.log(`\n==> Selesai: ${deletedStaff} staf, ${deletedUsers.size} profil/auth dipadam.\n`);
