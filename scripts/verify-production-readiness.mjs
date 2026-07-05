/**
 * RKJ One production readiness audit.
 *
 * This is a local, read-only guardrail. It does not print secrets and it does
 * not modify database data. Reports are saved under outputs/production-readiness.
 */

import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'outputs', 'production-readiness');
const REPORT_JSON = path.join(OUT_DIR, 'readiness-report.json');
const REPORT_MD = path.join(OUT_DIR, 'readiness-report.md');

const results = [];

function rel(filePath) {
 return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

async function exists(relativePath, minBytes = 1) {
 try {
 const stat = await fs.stat(path.join(ROOT, relativePath));
 return stat.isFile() && stat.size >= minBytes;
 } catch {
 return false;
 }
}

async function read(relativePath) {
 try {
 return await fs.readFile(path.join(ROOT, relativePath), 'utf8');
 } catch {
 return '';
 }
}

async function listFiles(relativeDir, ext) {
 try {
 const files = await fs.readdir(path.join(ROOT, relativeDir));
 return files.filter((file) => file.endsWith(ext)).sort();
 } catch {
 return [];
 }
}

function record(area, check, ok, detail = '', priority = 'P1') {
 results.push({ area, check, ok, detail, priority });
 const mark = ok ? 'PASS' : priority === 'P0' ? 'FAIL' : 'WARN';
 console.log(`${mark.padEnd(4)} ${area} - ${check}${detail ? `: ${detail}` : ''}`);
}

async function walk(relativeDir, extensions) {
 const root = path.join(ROOT, relativeDir);
 const found = [];

 async function visit(dir) {
 let entries = [];
 try {
 entries = await fs.readdir(dir, { withFileTypes: true });
 } catch {
 return;
 }

 for (const entry of entries) {
 const full = path.join(dir, entry.name);
 if (entry.isDirectory()) {
 if (['node_modules', '.next', '.git', 'android', 'ios'].includes(entry.name)) continue;
 await visit(full);
 } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
 found.push(full);
 }
 }
 }

 await visit(root);
 return found;
}

function hasAll(text, needles) {
 return needles.every((needle) => text.includes(needle));
}

async function main() {
 console.log('\n=== RKJ One - Production Readiness Audit ===\n');

 const packageJson = await read('package.json');
 const nextConfig = await read('next.config.ts');
 const gitignore = await read('.gitignore');
 const migrations = await listFiles('supabase/migrations', '.sql');
 const migrationText = await Promise.all(
 migrations.map(async (file) => read(`supabase/migrations/${file}`)));
 const allMigrations = migrationText.join('\n');

 record(
 'Build',
 'Next.js build script exists',
 packageJson.includes('"build": "next build"'),
 'npm run build',
 'P0');
 record(
 'Build',
 'Production verify scripts exist',
 hasAll(packageJson, [
 '"verify:production"',
 '"verify:hr"',
 '"verify:payroll"',
 '"verify:ui-polish"',
 '"mobile:readiness"',
 '"system:audit"',
 ]),
 'production, HR, payroll, UI, mobile and system audit',
 'P0');
 record(
 'Security',
 'Security headers configured',
 hasAll(nextConfig, [
 'Content-Security-Policy',
 'Strict-Transport-Security',
 'X-Frame-Options',
 'Permissions-Policy',
 'frame-ancestors',
 ]),
 'CSP, HSTS, frame protection and permissions policy',
 'P0');
 record(
 'Security',
 'Secret files are ignored',
 hasAll(gitignore, [
 '.env.local',
 'csv_import/.go-live-temp-password.txt',
 'outputs/mobile-release/play-store-reviewer-account.*',
 ]),
 'env, temporary passwords and reviewer credentials',
 'P0');
 record(
 'Database',
 'Supabase migrations present',
 migrations.length >= 100,
 `${migrations.length} SQL migration files`,
 'P0');
 record(
 'Database',
 'Audit and RLS foundations exist',
 hasAll(allMigrations, [
 'CREATE TABLE audit_logs',
 'ENABLE ROW LEVEL SECURITY',
 'offline_sync_queue',
 ]),
 'audit_logs, RLS and offline queue',
 'P0');
 record(
 'POS',
 'POS SOP and offline components exist',
 await exists('components/pos/pos-stock-sop-panel.tsx') &&
 await exists('components/pos/pos-terminal.tsx') &&
 await exists('lib/pos/offline-queue.ts') &&
 await exists('app/offline/page.tsx'),
 'stock SOP, terminal, offline queue and fallback page',
 'P0');
 record(
 'HR',
 'HRMIS and leave balance files exist',
 await exists('components/hr/employee-hrmis-dashboard.tsx') &&
 await exists('lib/hr/leave-balances.ts') &&
 await exists('app/api/hr/leave-balances/route.ts'),
 'employee self-service, leave balances and API',
 'P0');
 record(
 'Payroll',
 'Payroll studio exists',
 await exists('components/payroll/payroll-studio.tsx') &&
 await exists('scripts/verify-payroll-module.mjs'),
 'draft payroll, preview payslip and verification script',
 'P0');
 record(
 'Mobile',
 'PWA and app shell assets exist',
 await exists('public/manifest.json') &&
 await exists('public/sw.js') &&
 await exists('capacitor.config.ts') &&
 await exists('android/app/src/main/AndroidManifest.xml') &&
 await exists('ios/App/App/Info.plist'),
 'manifest, service worker, Capacitor, Android and iOS shell',
 'P1');
 record(
 'Mobile',
 'Store submission documents exist',
 await exists('docs/mobile/PLAY_STORE_SUBMISSION.md') &&
 await exists('docs/mobile/APP_STORE_SUBMISSION.md') &&
 await exists('docs/mobile/DATA_SAFETY.md') &&
 await exists('docs/mobile/RELEASE_CHECKLIST.md'),
 'Play Store, App Store, Data Safety and release checklist',
 'P1');
 record(
 'Recovery',
 'Operational recovery files exist',
 await exists('CHECKPOINT.json') &&
 await exists('RESUME.md') &&
 await exists('scripts/bundle-migrations.mjs') &&
 await exists('docs/GO_LIVE_CHECKLIST.md'),
 'checkpoint, resume, migration bundle and go-live checklist',
 'P0');
 record(
 'Readiness',
 'Production readiness model is wired',
 await exists('lib/system/production-readiness.ts') &&
 (await read('lib/system/health.ts')).includes('production_readiness'),
 'system health includes production readiness',
 'P0');

 const uiFiles = await walk('app', ['.ts', '.tsx']);
 uiFiles.push(...await walk('components', ['.ts', '.tsx']));
 uiFiles.push(...await walk('lib', ['.ts', '.tsx']));
 const mojibakePattern = /[\uFFFD]|\u00c3|\u00c2|\u00e2\u20ac|\u00e2\u0153|\u00f0\u0178/;
 const mojibakeFiles = [];
 for (const file of uiFiles) {
 const text = await fs.readFile(file, 'utf8');
 if (mojibakePattern.test(text)) mojibakeFiles.push(rel(file));
 }
 record(
 'Text',
 'No mojibake in app UI source',
 mojibakeFiles.length === 0,
 mojibakeFiles.slice(0, 8).join(', ') || 'clean',
 'P0');

 const failures = results.filter((item) => !item.ok && item.priority === 'P0').length;
 const warnings = results.filter((item) => !item.ok && item.priority !== 'P0').length;
 const passed = results.filter((item) => item.ok).length;

 await fs.mkdir(OUT_DIR, { recursive: true });
 const report = {
 generated_at: new Date().toISOString(),
 passed,
 warnings,
 failures,
 results,
 };
 await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
 await fs.writeFile(
 REPORT_MD,
 [
 '# RKJ One - Production Readiness Report',
 '',
 `Generated: ${report.generated_at}`,
 '',
 `Passed: ${passed}`,
 `Warnings: ${warnings}`,
 `Failures: ${failures}`,
 '',
 '| Priority | Area | Check | Status | Detail |',
 '| --- | --- | --- | --- | --- |',
 ...results.map((item) => `| ${item.priority} | ${item.area} | ${item.check.replaceAll('|', '/')} | ${item.ok ? 'PASS' : item.priority === 'P0' ? 'FAIL' : 'WARN'} | ${String(item.detail ?? '').replaceAll('|', '/')} |`),
 '',
 '## Owner Next Step',
 '',
 failures > 0
 ? 'Do not deploy for real operation until P0 failures are fixed.'
 : 'P0 readiness passed. Continue UAT by role, then deploy after build and production checks pass.',
 '',
 ].join('\n'),
 'utf8');

 console.log('\n=== Summary ===');
 console.log(`Passed: ${passed}`);
 console.log(`Warnings: ${warnings}`);
 console.log(`Failures: ${failures}`);
 console.log(`Report: ${rel(REPORT_MD)}`);

 if (failures > 0) process.exit(1);
}

main().catch((err) => {
 console.error(`Audit failed: ${err instanceof Error ? err.message : String(err)}`);
 process.exit(1);
});
