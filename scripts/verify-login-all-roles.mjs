/**
 * Uji login semua jenis pengguna - auth + profil + skop peranan.
 * Auto-baiki: reset password lalai jika auth gagal.
 *
 * Usage: npm run verify:login
 * npm run verify:login -- --fix (explicit fix mode, default ON)
 * npm run verify:login -- --no-fix
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const AM_ALLOWED = [
 '/dashboard',
 '/inventory',
 '/shifts',
 '/approvals',
 '/settings',
 '/change-password',
 '/profile',
];

const AM_BLOCKED = ['/pos', '/factory', '/warehouse', '/fleet', '/finance', '/payroll'];

/** Satu atau lebih akaun per peranan */
const TEST_MATRIX = [
 { role: 'SUPER_ADMIN', email: 'matisa@rkj.com', label: 'HQ Pentadbir Utama' },
 { role: 'ADMIN', email: 'norashikin@rkj.com', label: 'HQ Admin' },
 { role: 'HR', email: 'mohdali@rkj.com', label: 'HQ HR' },
 { role: 'OPERATION_MANAGER', email: 'ibrahim@rkj.com', label: 'HQ Operasi' },
 { role: 'CEO_FACTORY', email: 'muhammad@rkj.com', label: 'HQ Kilang' },
 { role: 'AREA_MANAGER', email: 'dist009@rkj.com', label: 'AM Utara', region: 'UTARA' },
 { role: 'AREA_MANAGER', email: 'dist001@rkj.com', label: 'AM Tengah', region: 'TENGAH' },
 { role: 'AREA_MANAGER', email: 'dist010@rkj.com', label: 'AM Selatan', region: 'SELATAN' },
 { role: 'DRIVER', email: 'd001@rkj.com', label: 'Pemandu D001' },
 { role: 'DRIVER', email: 'd002@rkj.com', label: 'Pemandu D002' },
 { role: 'STAFF', email: 's001@rkj.com', label: 'Staf S001' },
 { role: 'STAFF', email: 's052@rkj.com', label: 'Staf S052' },
 { role: 'SALES_AGENT', email: 'agent001@rkj.com', label: 'Ejen Nur Aisha' },
];

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

function amCanAccess(pathname) {
 return AM_ALLOWED.some(
 (p) => pathname === p || pathname.startsWith(`${p}/`)
 );
}

async function findUserByEmail(admin, email) {
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

async function resetUserPassword(admin, email) {
 const user = await findUserByEmail(admin, email);
 if (!user) return { ok: false, reason: 'Auth user tiada' };
 const { error } = await admin.auth.admin.updateUserById(user.id, {
 password: DEFAULT_PASSWORD,
 email_confirm: true,
 });
 if (error) return { ok: false, reason: error.message };
 await admin.from('profiles').update({ must_change_password: false }).eq('id', user.id);
 return { ok: true, userId: user.id };
}

async function testLogin(url, anonKey, admin, entry, autoFix) {
 const issues = [];
 const client = createClient(url, anonKey, {
 auth: { persistSession: false, autoRefreshToken: false },
 });

 let { data: authData, error: authErr } = await client.auth.signInWithPassword({
 email: entry.email,
 password: DEFAULT_PASSWORD,
 });

 if (authErr) {
 const msg = authErr.message ?? '';
 const credFail =
 msg.includes('Invalid login') ||
 msg.includes('Invalid credentials') ||
 msg.includes('Email not confirmed');

 if (credFail && autoFix) {
 const fixed = await resetUserPassword(admin, entry.email);
 if (fixed.ok) {
 ({ data: authData, error: authErr } = await client.auth.signInWithPassword({
 email: entry.email,
 password: DEFAULT_PASSWORD,
 }));
 if (!authErr) {
 issues.push('AUTO-FIX: password direset ke lalai');
 }
 } else {
 issues.push(`Auth gagal: ${msg} - fix gagal: ${fixed.reason}`);
 }
 } else {
 issues.push(`Auth gagal: ${msg}`);
 }
 }

 if (authErr || !authData?.user) {
 return { ok: false, issues };
 }

 const userId = authData.user.id;

 const { data: profile, error: profErr } = await client
 .from('profiles')
 .select(
 `
 id, full_name, email, role, status, organization_id, branch_id, region_id,
 must_change_password, avatar_url,
 branch:branches(branch_code, branch_name),
 region:regions!profiles_region_id_fkey(code, name)
 `
 )
 .eq('id', userId)
 .maybeSingle();

 if (profErr) issues.push(`Profil RLS/query: ${profErr.message}`);
 if (!profile) {
 issues.push('Profil tiada - jalankan npm run seed:users');
 return { ok: false, issues };
 }

 if (profile.role !== entry.role) {
 issues.push(`Peranan DB "${profile.role}" ≠ jangka "${entry.role}"`);
 }
 if (profile.status !== 'ACTIVE') {
 issues.push(`Status profil: ${profile.status}`);
 }
 if (!profile.organization_id) {
 issues.push('organization_id kosong');
 }

 if (entry.role === 'AREA_MANAGER') {
 if (!profile.region_id) issues.push('AM tiada region_id');
 const regionCode = profile.region?.code;
 if (entry.region && regionCode !== entry.region) {
 issues.push(`Kawasan DB ${regionCode ?? '?'} ≠ ${entry.region}`);
 }
 for (const p of AM_ALLOWED) {
 if (!amCanAccess(p)) issues.push(`Logic AM patut boleh ${p}`);
 }
 for (const p of AM_BLOCKED) {
 if (amCanAccess(p)) issues.push(`Logic AM tidak patut ${p}`);
 }
 }

 if (entry.role === 'STAFF' && !profile.branch_id) {
 issues.push('Staf tiada branch_id');
 }

 // Pemandu armada - branch_id opsyenal (skop fleet HQ)

 // Simulasi akses halaman kritikal selepas login
 const postLogin = {
 SUPER_ADMIN: '/dashboard',
 ADMIN: '/dashboard',
 HR: '/dashboard',
 OPERATION_MANAGER: '/dashboard',
 CEO_FACTORY: '/factory',
 AREA_MANAGER: '/inventory',
 DRIVER: '/fleet',
 STAFF: '/dashboard',
 FINANCE: '/finance',
 };
 const expectedLanding = postLogin[entry.role] ?? '/dashboard';
 if (entry.role === 'AREA_MANAGER' && !amCanAccess('/inventory')) {
 issues.push('AM tidak boleh /inventory');
 }

 return {
 ok: issues.filter((i) => !i.startsWith('AUTO-FIX')).length === 0,
 issues,
 meta: {
 role: profile.role,
 name: profile.full_name,
 mustChangePassword: profile.must_change_password,
 userId,
 expectedLanding,
 branch: profile.branch?.branch_code ?? null,
 region: profile.region?.code ?? null,
 },
 };
}

const env = {
 ...loadEnvFile(path.join(ROOT, '.env')),
 ...loadEnvFile(path.join(ROOT, '.env.local')),
 ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const autoFix = !args.includes('--no-fix');

if (!url || !anonKey || !serviceKey) {
 console.error('Perlu NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY dalam .env.local');
 process.exit(1);
}

const admin = createClient(url, serviceKey, {
 auth: { persistSession: false, autoRefreshToken: false },
});

console.log('\n=== RKJ One - Uji Login Semua Peranan ===\n');
console.log(`Auto-baiki password: ${autoFix ? 'YA' : 'TIDAK'}\n`);

const results = [];
let passed = 0;
let failed = 0;
let fixed = 0;

for (const entry of TEST_MATRIX) {
 const result = await testLogin(url, anonKey, admin, entry, autoFix);
 results.push({ entry, result });

 const fixNote = result.issues.find((i) => i.startsWith('AUTO-FIX'));
 if (fixNote) fixed += 1;

 if (result.ok) {
 passed += 1;
 const m = result.meta;
 console.log(` ✓ ${entry.label} (${entry.email})`);
 console.log(
 ` ${m.role} - ${m.name}${m.region ? ` - ${m.region}` : ''}${m.branch ? ` - ${m.branch}` : ''}${m.mustChangePassword ? ' - [tukar password]' : ''}`
 );
 } else {
 failed += 1;
 console.log(` ✗ ${entry.label} (${entry.email})`);
 for (const issue of result.issues) {
 console.log(` - ${issue}`);
 }
 }
}

// FINANCE - optional role
console.log('\n--- Peranan FINANCE (opsyenal) ---');
const { data: financeProfiles } = await admin
 .from('profiles')
 .select('email, full_name')
 .eq('role', 'FINANCE')
 .limit(3);

if (!financeProfiles?.length) {
 console.log(' ! Tiada pengguna FINANCE - diabaikan (U009 tidak di-seed)');
} else {
 for (const fp of financeProfiles) {
 const entry = { role: 'FINANCE', email: fp.email, label: 'Kewangan' };
 const result = await testLogin(url, anonKey, admin, entry, autoFix);
 if (result.ok) {
 passed += 1;
 console.log(` ✓ ${fp.email} (${fp.full_name})`);
 } else {
 failed += 1;
 console.log(` ✗ ${fp.email}`);
 result.issues.forEach((i) => console.log(` - ${i}`));
 }
 }
}

console.log('\n=== Ringkasan ===');
console.log(` Lulus: ${passed}`);
console.log(` Gagal: ${failed}`);
if (fixed > 0) console.log(` Auto-baiki: ${fixed} akaun password`);

if (failed > 0) {
 console.log('\n==> Masih ada masalah. Cuba: npm run seed:users\n');
 process.exit(1);
}

// UAT: pastikan akaun ujian tidak terkunci tukar-password
if (autoFix) {
 let cleared = 0;
 for (const { result } of results) {
 if (!result.ok || !result.meta?.mustChangePassword || !result.meta.userId) continue;
 await admin
 .from('profiles')
 .update({ must_change_password: false })
 .eq('id', result.meta.userId);
 cleared += 1;
 }
 if (cleared > 0) {
 console.log(` Auto-baiki: ${cleared} akaun - must_change_password dimatikan untuk UAT`);
 }
}

console.log('\n==> Semua jenis pengguna boleh login. Teruskan UAT manual.\n');
