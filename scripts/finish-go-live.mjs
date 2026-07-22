/**
 * Siapkan RKJ One untuk production - storage, verify, build.
 * Usage: npm run finish:go-live
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function run(label, cmd, args) {
 console.log(`\n=== ${label} ===\n`);
 const result = spawnSync(cmd, args, {
 cwd: ROOT,
 stdio: 'inherit',
 shell: process.platform === 'win32',
 });
 if (result.status !== 0) {
 console.error(`\n✗ ${label} gagal (exit ${result.status})\n`);
 process.exit(result.status ?? 1);
 }
}

console.log('\n╔══════════════════════════════════════╗');
console.log('║ RKJ One - Siap Production ║');
console.log('╚══════════════════════════════════════╝');

run('1/3 Storage buckets', 'npm', ['run', 'setup:storage']);
run('2/3 Verify go-live', 'npm', ['run', 'verify:go-live']);
run('3/3 Production build', 'npm', ['run', 'build']);

const envPath = path.join(ROOT, '.env.local');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const supabaseRef = env.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([^.]+)/)?.[1] ?? 'YOUR_PROJECT_REF';

console.log('\n╔══════════════════════════════════════╗');
console.log('║ Langkah Manual (5 minit) ║');
console.log('╚══════════════════════════════════════╝\n');

console.log('A) Deploy Vercel');
console.log(' npx vercel login');
console.log(' npx vercel --prod');
console.log(' Set env di Vercel Dashboard:');
console.log(' NEXT_PUBLIC_SUPABASE_URL');
console.log(' NEXT_PUBLIC_SUPABASE_ANON_KEY');
console.log(' SUPABASE_SERVICE_ROLE_KEY');
console.log(' NEXT_PUBLIC_APP_URL = https://your-app.vercel.app\n');

console.log('B) Supabase Auth (Dashboard ke Authentication ke Settings)');
console.log(' Site URL = URL Vercel production');
console.log(' Redirect URLs:');
console.log(' https://your-app.vercel.app/auth/callback');
console.log(' http://localhost:3000/auth/callback');
console.log(' Enable email signup = OFF\n');

console.log('C) Uji login pertama');
console.log(' Akaun pemilik akan diminta menukar kata laluan semasa login pertama');
console.log(' Area Manager: safuan@rkj.com, hakim@rkj.com, yati@rkj.com\n');

console.log('D) Go-live 36 cawangan - operasi sebenar serentak');
console.log(' Utara 12 (Safuan) + Tengah 10 (Hakim) + Selatan 14 (Yati)');
console.log(' Rujuk: docs/GO_LIVE_36.md');
console.log(` Supabase project: ${supabaseRef}\n`);

console.log('==> Sistem siap deploy. Jalankan langkah A & B di atas.\n');
