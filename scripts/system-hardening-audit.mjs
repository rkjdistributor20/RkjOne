import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const root = process.cwd();
const outputDir = path.join(root, 'outputs');
const outputFile = path.join(outputDir, 'system-hardening-audit.md');

async function exists(filePath) {
 try {
 await fs.access(filePath);
 return true;
 } catch {
 return false;
 }
}

async function readText(filePath) {
 try {
 return await fs.readFile(filePath, 'utf8');
 } catch {
 return '';
 }
}

async function listFiles(dir, ext) {
 try {
 const files = await fs.readdir(dir);
 return files.filter((file) => file.endsWith(ext)).sort();
 } catch {
 return [];
 }
}

function pass(condition) {
 return condition ? 'PASS' : 'WARN';
}

function row(status, area, finding, nextStep) {
 return `| ${status} | ${area} | ${finding} | ${nextStep} |`;
}

const packageJson = await readText(path.join(root, 'package.json'));
let packageData = {};
try {
 packageData = JSON.parse(packageJson);
} catch {
 packageData = {};
}
const nextConfig = await readText(path.join(root, 'next.config.ts'));
const gitignore = await readText(path.join(root, '.gitignore'));
const migrations = await listFiles(path.join(root, 'supabase', 'migrations'), '.sql');

const checks = [
 row(
 pass(Boolean(packageData.dependencies?.next) && Boolean(packageData.dependencies?.react)),
 'Framework',
 `Next.js ${packageData.dependencies?.next ?? 'tidak ditemui'} dan React ${packageData.dependencies?.react ?? 'tidak ditemui'} direkod daripada package.json.`,
 'Semak update keselamatan sebelum deploy besar.'),
 row(
 ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'Permissions-Policy']
 .every((key) => nextConfig.includes(key)) ? 'PASS' : 'FAIL',
 'Security headers',
 'CSP, HSTS, frame protection dan permissions policy disemak.',
 'Jangan deploy jika header kritikal dibuang.'),
 row(
 await exists(path.join(root, 'proxy.ts')) ? 'PASS' : 'WARN',
 'Access gate',
 'proxy.ts ditemui untuk kawalan laluan.',
 'Pastikan laluan admin/POS/laporan tidak bypass session.'),
 row(
 gitignore.includes('.env.local') && gitignore.includes('.env') ? 'PASS' : 'FAIL',
 'Secrets',
 '.gitignore menyekat fail env dan credential export.',
 'Jangan commit token, password, service role key, atau fail credential.'),
 row(
 migrations.length > 0 ? 'PASS' : 'FAIL',
 'Database',
 `${migrations.length} migration SQL ditemui.`,
 'Jalankan bundle migration dan backup sebelum perubahan besar.'),
 row(
 await exists(path.join(root, 'CHECKPOINT.json')) && await exists(path.join(root, 'RESUME.md')) ? 'PASS' : 'WARN',
 'Recovery',
 'Checkpoint dan resume worklog disemak.',
 'Update selepas deploy dan sebelum rehat panjang.'),
 row(
 await exists(path.join(root, 'public', 'manifest.json')) && await exists(path.join(root, 'public', 'sw.js')) ? 'PASS' : 'WARN',
 'PWA',
 'Manifest dan service worker tersedia.',
 'Uji install PWA pada Android/iOS selepas deploy.'),
row(
await exists(path.join(root, 'outputs', 'mobile-release', 'release-readiness-audit.md')) ? 'PASS' : 'WARN',
'Mobile store',
'Mobile readiness audit tersedia.',
'Jalankan npm run mobile:readiness sebelum submit Play Store/App Store.'),
row(
 await exists(path.join(root, 'scripts', 'verify-production-readiness.mjs')) &&
 await exists(path.join(root, 'docs', 'PRODUCTION_READINESS_PLAYBOOK.md')) ? 'PASS' : 'WARN',
 'Production readiness',
 'Readiness audit dan playbook owner tersedia.',
 'Jalankan npm run verify:readiness sebelum deploy besar.'),
row(
await exists(path.join(root, 'app', 'api', 'system', 'health', 'route.ts')) ? 'PASS' : 'WARN',
'Monitoring',
'Admin system health endpoint tersedia.',
 'Semak tab Tetapan > Kesihatan Sistem selepas login owner.'),
];

const content = `# RKJ One - System Hardening Audit

Tarikh jana: ${new Date().toLocaleString('ms-MY')}

Laporan ini tidak menyimpan credential, token, password atau nilai environment. Ia hanya menyemak kewujudan kawalan asas untuk owner/admin.

| Status | Kawasan | Semakan | Tindakan |
| --- | --- | --- | --- |
${checks.join('\n')}

## Nota Operasi

- Payment gateway live masih perlu diuji dengan merchant approved dan webhook sebenar sebelum QR online dibuka kepada staf.
- Untuk UAT POS, kekalkan manual payment/QR manual dahulu sehingga resit, stok, syif dan approval AM/OM stabil.
- Jalankan audit ini sebelum deploy besar: \`npm run system:audit\`.
- Jalankan readiness penuh sebelum deploy besar: \`npm run verify:readiness\`.
`;

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, content, 'utf8');
console.log(`System hardening audit saved: ${outputFile}`);
