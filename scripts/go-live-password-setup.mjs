/**
 * Setup kata laluan go-live: jana ke simpan (gitignored) ke putar semua akaun ke eksport CSV AM.
 *
 * Usage:
 * npm run go-live:passwords
 * npm run go-live:passwords -- --dry-run
 */

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';

const PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');
const EXPORT_CSV = path.join(ROOT, 'csv_import', 'go_live_credentials_export.csv');

function generatePassword() {
 const token = crypto.randomBytes(10).toString('base64url');
 return `RkjLive@${token}1`;
}

async function buildExport(admin, password) {
 const { data: staffRows } = await admin
 .from('staff')
 .select(
 `
 staff_code,
 full_name,
 branches(branch_code, branch_name, regions(code, name))
 `
 )
 .eq('status', 'ACTIVE')
 .order('staff_code');

 const { data: mgmtProfiles } = await admin
 .from('profiles')
 .select('email, full_name, role, employee_code, regions(code, name)')
 .in('role', [
 'SUPER_ADMIN',
 'ADMIN',
 'HR',
 'OPERATION_MANAGER',
 'CEO_FACTORY',
 'AREA_MANAGER',
 'DRIVER',
 'FINANCE',
 ])
 .order('role');

 const lines = [
 'kategori,kod,email,nama,peranan,kawasan,cawangan,kata_laluan_sementara,wajib_tukar',
 ];

 for (const row of staffRows ?? []) {
 const b = row.branches;
 const region = b?.regions?.name ?? b?.regions?.code ?? '';
 const email = `${String(row.staff_code).trim().toLowerCase()}@rkj.com`;
 lines.push(
 [
 'STAF',
 row.staff_code ?? '',
 email,
 row.full_name ?? '',
 'STAFF',
 region,
 b ? `${b.branch_code} - ${b.branch_name}` : '',
 password,
 'YA',
 ]
 .map((c) => `"${String(c).replace(/"/g, '""')}"`)
 .join(',')
 );
 }

 for (const p of mgmtProfiles ?? []) {
 if (!p.email?.endsWith('@rkj.com')) continue;
 lines.push(
 [
 'PENGURUS',
 p.employee_code ?? '',
 p.email,
 p.full_name ?? '',
 p.role,
 p.regions?.name ?? p.regions?.code ?? '',
 '',
 password,
 'YA',
 ]
 .map((c) => `"${String(c).replace(/"/g, '""')}"`)
 .join(',')
 );
 }

 fs.mkdirSync(path.dirname(EXPORT_CSV), { recursive: true });
 fs.writeFileSync(EXPORT_CSV, lines.join('\n'), 'utf8');
}

async function main() {
 const dryRun = process.argv.includes('--dry-run');
 const env = loadProjectEnv();

 console.log('\n=== RKJ One - Setup Kata Laluan Go-Live ===\n');

 if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
 console.error('✗ .env.local - SUPABASE keys diperlukan');
 process.exit(1);
 }

 let password = env.GO_LIVE_PASSWORD?.trim();
 if (!password && fs.existsSync(PASSWORD_FILE)) {
 password = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
 console.log(`Guna password sedia ada dari ${path.relative(ROOT, PASSWORD_FILE)}`);
 }
 if (!password) {
 password = generatePassword();
 console.log('Kata laluan baharu dijana.');
 }

 if (password.length < 10 || password === 'RkjOne@2025') {
 console.error('✗ Kata laluan tidak sah');
 process.exit(1);
 }

 console.log(`Fail password: ${path.relative(ROOT, PASSWORD_FILE)}`);
 console.log(`Eksport AM: ${path.relative(ROOT, EXPORT_CSV)}`);
 console.log(`Dry-run: ${dryRun ? 'YA' : 'TIDAK'}\n`);

 if (dryRun) {
 console.log('==> Dry-run - tiada perubahan.\n');
 return;
 }

 fs.mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
 fs.writeFileSync(
 PASSWORD_FILE,
 `${password}\n# JANGAN commit fail ini. Edarkan melalui saluran selamat.\n# Generated: ${new Date().toISOString()}\n`,
 'utf8'
 );
 console.log(`✓ Password disimpan (gitignored)\n`);

 const rotate = spawnSync(
 process.execPath,
 [
 path.join(ROOT, 'scripts', 'rotate-production-passwords.mjs'),
 '--password',
 password,
 '--confirm',
 '--skip',
 'admin@rkjone.com',
 '--skip',
 'safuan@rkjone.com',
 '--skip',
 'hakim@rkjone.com',
 '--skip',
 'yati@rkjone.com',
 ],
 { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ROTATE_PASSWORD: password } }
 );

 if (rotate.status !== 0) {
 console.error('\n✗ Putar password gagal');
 process.exit(rotate.status ?? 1);
 }

 const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
 await buildExport(admin, password);
 console.log(`\n✓ Eksport kredensial AM: ${path.relative(ROOT, EXPORT_CSV)}`);

 console.log('\n=== Seterusnya ===');
 console.log(' 1. Baca password: csv_import/.go-live-temp-password.txt');
 console.log(' 2. Edarkan CSV ke 3 AM (WhatsApp / mesyuarat - JANGAN email awam)');
 console.log(' 3. npm run verify:go-live-36');
 console.log(' 4. Staf login ke sistem minta tukar password sendiri\n');
}

main().catch((err) => {
 console.error(err);
 process.exit(1);
});
