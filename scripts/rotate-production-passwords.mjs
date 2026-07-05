/**
 * Tukar kata laluan semua pengguna Auth (go-live production).
 * Set must_change_password=true - pengguna wajib tukar pada login pertama.
 *
 * Usage:
 * npm run rotate:passwords -- --password "KataLaluanBaru2025!" --confirm
 * npm run rotate:passwords -- --dry-run
 *
 * Env alternatif: ROTATE_PASSWORD + ROTATE_CONFIRM=yes
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';

const OLD_KNOWN = 'RkjOne@2025';

function parseArgs(argv) {
 const out = { dryRun: false, confirm: false, password: '', roles: null, skip: [] };
 for (let i = 0; i < argv.length; i++) {
 const a = argv[i];
 if (a === '--dry-run') out.dryRun = true;
 else if (a === '--confirm') out.confirm = true;
 else if (a === '--password') out.password = argv[++i] ?? '';
 else if (a === '--role') {
 out.roles = out.roles ?? [];
 out.roles.push(argv[++i]?.toUpperCase());
 } else if (a === '--skip') out.skip.push((argv[++i] ?? '').toLowerCase());
 }
 return out;
}

async function listAllUsers(admin) {
 const users = [];
 let page = 1;
 while (page <= 50) {
 const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
 if (error) throw error;
 users.push(...data.users);
 if (data.users.length < 200) break;
 page += 1;
 }
 return users;
}

async function main() {
 const args = parseArgs(process.argv.slice(2));
 const env = loadProjectEnv();
 const password = args.password || env.ROTATE_PASSWORD || '';
 const confirmed = args.confirm || env.ROTATE_CONFIRM === 'yes';

 console.log('\n=== RKJ One - Putar Kata Laluan Production ===\n');

 if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
 console.error('✗ Set NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY dalam .env.local');
 process.exit(1);
 }

 const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
 auth: { persistSession: false, autoRefreshToken: false },
 });

 const authUsers = await listAllUsers(admin);
 const emails = authUsers
 .map((u) => u.email?.toLowerCase())
 .filter(Boolean)
 .filter((e) => !args.skip.includes(e));

 const { data: profiles } = await admin
 .from('profiles')
 .select('id, email, role, full_name, status')
 .in(
 'email',
 emails.map((e) => e)
 );

 const profileByEmail = new Map(
 (profiles ?? []).map((p) => [p.email?.toLowerCase(), p])
 );

 let targets = authUsers.filter((u) => u.email && !args.skip.includes(u.email.toLowerCase()));

 if (args.roles?.length) {
 targets = targets.filter((u) => {
 const p = profileByEmail.get(u.email.toLowerCase());
 return p && args.roles.includes(p.role);
 });
 }

 console.log(`Pengguna auth: ${authUsers.length}`);
 console.log(`Sasaran putar: ${targets.length}`);
 if (args.skip.length) console.log(`Skip: ${args.skip.join(', ')}`);
 if (args.roles?.length) console.log(`Filter peranan: ${args.roles.join(', ')}`);
 console.log('');

 if (args.dryRun) {
 for (const u of targets) {
 const p = profileByEmail.get(u.email.toLowerCase());
 console.log(` - ${u.email} - ${p?.role ?? '?'} - ${p?.full_name ?? ''}`);
 }
 console.log('\n==> Dry-run sahaja. Tambah --password & --confirm untuk jalankan.\n');
 return;
 }

 if (!password || password.length < 10) {
 console.error('✗ --password wajib (minimum 10 aksara)');
 process.exit(1);
 }

 if (password === OLD_KNOWN) {
 console.error(`✗ Jangan guna kata laluan lama (${OLD_KNOWN})`);
 process.exit(1);
 }

 if (!confirmed) {
 console.error('✗ Tambah --confirm (atau ROTATE_CONFIRM=yes) untuk sahkan');
 process.exit(1);
 }

 let ok = 0;
 let fail = 0;
 const logLines = ['email,role,full_name,status'];

 for (const user of targets) {
 const email = user.email.toLowerCase();
 const profile = profileByEmail.get(email);
 const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
 password,
 email_confirm: true,
 });
 if (pwErr) {
 console.log(` ✗ ${email} - ${pwErr.message}`);
 fail += 1;
 continue;
 }

 const { error: profErr } = await admin
 .from('profiles')
 .update({ must_change_password: true })
 .eq('id', user.id);

 if (profErr) {
 console.log(` ⚠ ${email} - password OK, profil gagal: ${profErr.message}`);
 fail += 1;
 continue;
 }

 console.log(` ✓ ${email}`);
 ok += 1;
 logLines.push(
 [email, profile?.role ?? '', profile?.full_name ?? '', profile?.status ?? ''].join(',')
 );
 }

 const stamp = new Date().toISOString().slice(0, 10);
 const outPath = path.join(ROOT, 'csv_import', `password_rotation_${stamp}.csv`);
 fs.mkdirSync(path.dirname(outPath), { recursive: true });
 fs.writeFileSync(outPath, logLines.join('\n'), 'utf8');

 console.log(`\n=== Ringkasan ===`);
 console.log(` Berjaya: ${ok}`);
 console.log(` Gagal: ${fail}`);
 console.log(` Log: ${outPath}`);
 console.log('\n ⚠ Kata laluan baru hanya dalam arg/env - JANGAN commit .env atau log password.');
 console.log(' Edarkan kata laluan sementara melalui saluran selamat (WhatsApp peribadi / AM).\n');

 if (fail > 0) process.exit(1);
}

main().catch((err) => {
 console.error(err);
 process.exit(1);
});
