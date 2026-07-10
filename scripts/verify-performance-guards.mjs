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
  'OwnerOperationsPanels',
  'OwnerGroupOperationsFallback',
  'includeStockCounts: false',
  'hydrateDashboardStatsStockCounts(statsBase, kioskOverview)',
 ],
 },
 {
 file: 'components/dashboard/owner-group-dashboard.tsx',
 patterns: [
  'operations?: ReactNode',
  'OwnerGroupOperationsFallback',
  'OwnerGroupOperations',
  '<OwnerExecutiveHero profileName={profileName} stats={stats} />',
 ],
 },
 {
 file: 'components/warehouse/warehouse-dashboard.tsx',
 patterns: [
  "type WarehouseTab = 'stock' | 'hq-order' | 'audit'",
  'const [activeTab, setActiveTab]',
  'loadBalancesForLocation',
  'activeTab === \'stock\' || activeTab === \'audit\'',
  'orderBootstrapLoading',
 ],
 forbidden: [
  'fetchLocations',
  'const [sum, aud, locs, items] = await Promise.all',
 ],
 },
 {
 file: 'app/api/warehouse/summary/route.ts',
 patterns: [
  'hqLocationPromise',
  'pendingTransfersPromise',
  'pendingDeliveriesPromise',
  'Promise.all',
  "Cache-Control', 'private, max-age=15, stale-while-revalidate=45'",
 ],
 },
 {
 file: 'app/api/production/orders/route.ts',
 patterns: [
  'requestedLimit',
  'Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)',
  '.limit(limit)',
 ],
 },
 {
 file: 'components/warehouse/hq-factory-order-panel.tsx',
 patterns: [
  'fetchHqFactoryOrders(undefined, 15)',
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
 {
 file: 'components/reports/reports-dashboard.tsx',
 patterns: [
  "type ReportsTab = 'sales' | 'branches' | 'products' | 'staff' | 'inventory' | 'fleet'",
  'const [loadedTabs, setLoadedTabs]',
  'const loadTabData',
  '<Tabs value={activeTab}',
 ],
 forbidden: [
  'const [ov, tr, br, pr, st, inv, fl] = await Promise.all',
 ],
 },
 {
 file: 'components/finance/finance-dashboard.tsx',
 patterns: [
  "type FinanceTab = 'collections' | 'manualqr' | 'bankin' | 'recon' | 'reports'",
  'const loadCore',
  'const loadTabData',
  "fetchManualQrPayments('PENDING', 20)",
  '<Tabs value={activeTab}',
 ],
 forbidden: [
  'const [sum, col, bi, usage, req, rec, rep, br, qr] = await Promise.all',
 ],
 },
 {
 file: 'components/fleet/fleet-dashboard.tsx',
 patterns: [
  "type FleetTab = 'overview' | 'schedule' | 'drivers' | 'deliveries' | 'vehicles' | 'status'",
  'const loadStatusLogs',
  'const loadCreateResources',
 '<Tabs value={activeTab}',
 ],
 forbidden: [
  'const [ord, veh, drv, logs, loc, items] = await Promise.all',
 ],
 },
 {
 file: 'app/api/reports/overview/route.ts',
 patterns: [
  'Promise.all',
  "Cache-Control': 'private, max-age=30, stale-while-revalidate=90'",
 ],
 },
 {
 file: 'app/api/reports/products/route.ts',
 patterns: [
  'Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)',
  '.limit(500)',
  'b.revenue - a.revenue',
  "Cache-Control': 'private, max-age=30, stale-while-revalidate=90'",
 ],
 },
 {
 file: 'app/api/finance/summary/route.ts',
 patterns: [
  'Promise.all',
  "Cache-Control': 'private, max-age=10, stale-while-revalidate=30'",
 ],
 },
 {
 file: 'lib/finance/api.ts',
 patterns: [
  'fetchCollections(status?: string, limit = 50)',
  'fetchBankIns(limit = 30)',
  'fetchManualQrPayments(status?: string, limit = 30)',
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
