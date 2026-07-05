/**
 * Bundle verify production - readiness + production + AM + ejen + payroll + go-live 36.
 * Usage: npm run verify:all
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const steps = [
 { name: 'Production readiness', cmd: 'npm', args: ['run', 'verify:readiness'] },
 { name: 'Production health', cmd: 'npm', args: ['run', 'verify:production'] },
 { name: 'Area Manager UAT', cmd: 'npm', args: ['run', 'uat:am'] },
 { name: 'Sales Agent UAT', cmd: 'npm', args: ['run', 'uat:sales-agent'] },
 { name: 'Payroll UAT', cmd: 'npm', args: ['run', 'verify:payroll'] },
 { name: 'Go-live 36 branches', cmd: 'npm', args: ['run', 'verify:go-live-36'] },
];

console.log('\n=== RKJ One - Verify All (Production) ===\n');

let failed = 0;
for (const step of steps) {
 console.log(`\n--- ${step.name} ---\n`);
 const result = spawnSync(step.cmd, step.args, { cwd: ROOT, stdio: 'inherit', shell: true });
 if (result.status !== 0) {
 console.log(`\nFAIL ${step.name} gagal (exit ${result.status})\n`);
 failed++;
 } else {
 console.log(`\nPASS ${step.name} OK\n`);
 }
}

console.log('\n=== Ringkasan Verify All ===');
if (failed) {
 console.log(`Gagal: ${failed}/${steps.length}`);
 process.exit(1);
}
console.log(`Lulus: ${steps.length}/${steps.length}`);
console.log('\nManual: docs/UAT_SALES_AGENT.md - docs/UAT_AM.md - docs/GO_LIVE_36.md\n');
