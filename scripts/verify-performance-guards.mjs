import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
 {
 file: 'app/(dashboard)/dashboard/page.tsx',
 patterns: [
  'Suspense',
  'DashboardOpsPanels',
  'DashboardOpsFallback',
  'includeStockCounts: false',
  'hydrateDashboardStatsStockCounts(statsBase, kioskOverview)',
 ],
 },
 {
 file: 'components/performance/web-vitals-reporter.tsx',
 patterns: [
  'useReportWebVitals',
  'GOOD_METRIC_SAMPLE_RATE',
  'navigator.sendBeacon',
 ],
 },
 {
 file: 'app/api/monitoring/web-vitals/route.ts',
 patterns: [
  'performance_web_vitals',
  'getCurrentProfile',
  'cleanRoute',
 ],
 },
 {
 file: 'instrumentation-client.ts',
 patterns: [
  'rkj-app-init',
  'onRouterTransitionStart',
 ],
 },
 {
  file: 'lib/dashboard/queries.ts',
  patterns: [
  'getDashboardSnapshotViaRpc',
  'get_dashboard_snapshot',
  'getDashboardDateWindow',
  'ACTIVE_BRANCHES_CACHE_TTL_MS',
  'activeBranchesCache',
  'ACTIVE_VEHICLES_CACHE_TTL_MS',
  'activeVehiclesCache',
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
  file: 'supabase/migrations/20260710153256_performance_web_vitals.sql',
  patterns: [
  'performance_web_vitals',
  'ENABLE ROW LEVEL SECURITY',
  'performance_web_vitals_insert_own_org',
  'idx_performance_web_vitals_org_route_metric_created',
  ],
 },
 {
  file: 'app/(dashboard)/dashboard/loading.tsx',
  patterns: [
  'DashboardLoading',
  'Skeleton',
  'ModuleLayout',
  ],
 },
 {
  file: 'supabase/migrations/20260710151434_dashboard_performance_acceleration.sql',
  patterns: [
  'idx_delivery_orders_org_status_created',
  'idx_fleet_status_log_org_vehicle_logged',
  'dashboard_daily_rollups',
  'get_dashboard_snapshot',
  'SECURITY INVOKER',
  ],
 },
 {
  file: 'scripts/performance-budget.mjs',
  patterns: [
  'Performance budget target',
  'bestOfTwo',
  'expectedStatuses',
  ],
 },
 {
  file: 'app/api/pos/products/route.ts',
  patterns: [
  '.limit(300)',
  "Cache-Control', 'private, max-age=30, stale-while-revalidate=60'",
  ],
 },
 {
  file: 'app/api/inventory/stock-items/route.ts',
  patterns: [
  '.limit(300)',
  "Cache-Control', 'private, max-age=30, stale-while-revalidate=60'",
  ],
 },
 {
  file: 'app/api/staff/grouped/route.ts',
  patterns: [
  'MAX_GROUPED_STAFF_ROWS',
  '.limit(MAX_GROUPED_STAFF_ROWS)',
  ],
 },
 {
  file: 'package.json',
  patterns: [
  '"perf:budget": "node scripts/performance-budget.mjs"',
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
