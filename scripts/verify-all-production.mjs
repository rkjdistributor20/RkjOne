/**
 * Bundle verify production - production + AM + ejen + go-live 36
 * Usage: npm run verify:all
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const steps = [
 { name: 'Production health', cmd: 'npm', args: ['run', 'verify:production'] },
 { name: 'Area Manager UAT', cmd: 'npm', args: ['run', 'uat:am'] },
 { name: 'Sales Agent UAT', cmd: 'npm', args: ['run', 'uat:sales-agent'] },
 { name: 'Go-live 36 branches', cmd: 'npm', args: ['run', 'verify:go-live-36'] },
];

console.log('\n=== RKJ One - Verify All (Production) ===\n');

let failed = 0;
for (const step of steps) {
 console.log(`\n--- ${step.name} ---\n`);
 const r = spawnSync(step.cmd, step.args, { cwd: ROOT, stdio: 'inherit', shell: true });
 if (r.status !== 0) {
 console.log(`\n✗ ${step.name} gagal (exit ${r.status})\n`);
 failed++;
 } else {
 console.log(`\n✓ ${step.name} OK\n`);
 }
}

console.log('\n=== Ringkasan Verify All ===');
if (failed) {
 console.log(` Gagal: ${failed}/${steps.length}`);
 process.exit(1);
}
console.log(` Lulus: ${steps.length}/${steps.length}`);
console.log('\n Manual: docs/UAT_SALES_AGENT.md - docs/UAT_AM.md - docs/GO_LIVE_36.md\n');
