import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
 {
 file: 'app/(dashboard)/dashboard/page.tsx',
 patterns: [
  'includeStockCounts: false',
  'hydrateDashboardStatsStockCounts(statsBase, kioskOverview)',
 ],
 },
 {
 file: 'lib/dashboard/queries.ts',
 patterns: [
  'stockCountsPromise',
  'visibleBranchIds',
  "select('id', { count: 'exact', head: true })",
  "from('fleet_status_log')",
 ],
 forbidden: [
  'fleet_status_log(status, logged_at)',
 ],
 },
 {
 file: 'lib/dashboard/am-branch-metrics.ts',
 patterns: [
  'summariesByBranch',
  'summariesByBranch.get(b.id)',
 ],
 },
 {
 file: 'components/dashboard/workflow-sop-panel.tsx',
 patterns: [
  'MAX_VISIBLE_STEPS = 4',
  'visibleSteps.map',
  'hiddenStepCount',
 ],
 },
];

let failed = 0;

for (const check of checks) {
 const fullPath = path.join(root, check.file);
 const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
 if (!content) {
  console.error(`x ${check.file} missing or empty`);
  failed += 1;
  continue;
 }

 for (const pattern of check.patterns) {
  if (!content.includes(pattern)) {
   console.error(`x ${check.file} missing: ${pattern}`);
   failed += 1;
  }
 }

 for (const pattern of check.forbidden ?? []) {
  if (content.includes(pattern)) {
   console.error(`x ${check.file} still contains bulky pattern: ${pattern}`);
   failed += 1;
  }
 }
}

if (failed > 0) {
 console.error(`\nPerformance guard check failed: ${failed} issue(s).`);
 process.exit(1);
}

console.log('Performance guard check passed.');
