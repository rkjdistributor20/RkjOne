import { createClient } from '@/lib/supabase/server';
import type { DashboardStats } from '@/types/database';
import { fetchKioskOverviewForBranches } from '@/lib/inventory/kiosk-overview-data';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type KioskOverviewSnapshot = Awaited<ReturnType<typeof fetchKioskOverviewForBranches>>;

type DashboardSnapshotRow = {
 organization_id?: string | null;
 sales_today?: number | string | null;
 sales_this_week?: number | string | null;
 sales_this_month?: number | string | null;
 pending_approvals?: number | string | null;
 critical_stock_count?: number | string | null;
 low_stock_count?: number | string | null;
 outstanding_cash?: number | string | null;
};

type DashboardRpcClient = {
 rpc: (
  fn: 'get_dashboard_snapshot',
  args: { p_org_id: string; p_branch_ids: string[] | null }) => {
  maybeSingle: () => Promise<{
   data: DashboardSnapshotRow | null;
   error: { message: string } | null;
  }>;
 };
};

function toNumber(value: number | string | null | undefined) {
 return Number(value ?? 0);
}

function toInteger(value: number | string | null | undefined) {
 return Math.trunc(Number(value ?? 0));
}

function emptyDashboardStats(orgId: string): DashboardStats {
 return {
 organization_id: orgId,
 sales_today: 0,
 sales_this_week: 0,
 sales_this_month: 0,
 pending_approvals: 0,
 critical_stock_count: 0,
 low_stock_count: 0,
 outstanding_cash: 0,
 };
}

function normalizeDashboardSnapshot(row: DashboardSnapshotRow, orgId: string): DashboardStats {
 return {
 organization_id: row.organization_id ?? orgId,
 sales_today: toNumber(row.sales_today),
 sales_this_week: toNumber(row.sales_this_week),
 sales_this_month: toNumber(row.sales_this_month),
 pending_approvals: toInteger(row.pending_approvals),
 critical_stock_count: toInteger(row.critical_stock_count),
 low_stock_count: toInteger(row.low_stock_count),
 outstanding_cash: toNumber(row.outstanding_cash),
 };
}

async function getDashboardSnapshotViaRpc(
 supabase: unknown,
 orgId: string,
 branchIds: string[] | null): Promise<DashboardStats | null> {
 const { data, error } = await (supabase as DashboardRpcClient)
 .rpc('get_dashboard_snapshot', { p_org_id: orgId, p_branch_ids: branchIds })
 .maybeSingle();

 if (error) {
  const message = error.message.toLowerCase();
  if (!message.includes('could not find') && !message.includes('does not exist')) {
   console.error('[get_dashboard_snapshot]', error.message);
  }
  return null;
 }

 return data ? normalizeDashboardSnapshot(data, orgId) : null;
}

function getDashboardDateWindow() {
 const now = new Date();
 const today = now.toISOString().slice(0, 10);
 const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
 const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
 weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);

 return {
  today,
  weekStart: weekStart.toISOString().slice(0, 10),
  monthStart: `${today.slice(0, 8)}01`,
 };
}

export function hydrateDashboardStatsStockCounts(
 stats: DashboardStats,
 kioskOverview: KioskOverviewSnapshot): DashboardStats {
 return {
 ...stats,
 critical_stock_count: kioskOverview.summary.critical,
 low_stock_count: kioskOverview.summary.low,
 };
}

export async function getDashboardStats(
 orgId: string,
 branchIds: string[] | null = null,
 options: { includeStockCounts?: boolean; kioskOverview?: KioskOverviewSnapshot } = {}): Promise<DashboardStats | null> {
 const supabase = await createClient();

 if (branchIds === null) {
 const { data, error } = await supabase.from('dashboard_stats').select('*').eq('organization_id', orgId).maybeSingle();

 if (error) {
 console.error('[dashboard_stats]', error.message);
 return null;
 }

  return data ? normalizeDashboardSnapshot(data, orgId) : null;
 }

 if (branchIds.length === 0) {
 return emptyDashboardStats(orgId);
 }

 const stockCountsPromise =
 options.includeStockCounts === false
 ? Promise.resolve(null)
 : options.kioskOverview
 ? Promise.resolve(options.kioskOverview)
 : fetchKioskOverviewForBranches(supabase, orgId, branchIds);

 const [snapshot, snapshotKioskOverview] = await Promise.all([
 getDashboardSnapshotViaRpc(supabase, orgId, branchIds),
 stockCountsPromise,
 ]);

 if (snapshot) {
  return snapshotKioskOverview
  ? hydrateDashboardStatsStockCounts(snapshot, snapshotKioskOverview)
  : snapshot;
 }

 const { today, weekStart, monthStart } = getDashboardDateWindow();

 const [todayRes, weekRes, monthRes, approvalsRes, kioskOverview] = await Promise.all([
 supabase.from('pos_daily_summaries').select('total_sales').eq('organization_id', orgId).eq('summary_date', today).in('branch_id', branchIds),
 supabase.from('pos_daily_summaries').select('total_sales').eq('organization_id', orgId).gte('summary_date', weekStart).in('branch_id', branchIds),
 supabase.from('pos_daily_summaries').select('total_sales').eq('organization_id', orgId).gte('summary_date', monthStart).in('branch_id', branchIds),
 supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'PENDING').in('branch_id', branchIds),
 Promise.resolve(snapshotKioskOverview),
 ]);

 const sum = (rows: Array<{ total_sales?: number }> | null) =>
 (rows ?? []).reduce((n, r) => n + Number(r.total_sales ?? 0), 0);

 const stats = {
 organization_id: orgId,
 sales_today: sum(todayRes.data as Array<{ total_sales: number }> | null),
 sales_this_week: sum(weekRes.data as Array<{ total_sales: number }> | null),
 sales_this_month: sum(monthRes.data as Array<{ total_sales: number }> | null),
 pending_approvals: approvalsRes.count ?? 0,
 critical_stock_count: 0,
 low_stock_count: 0,
 outstanding_cash: 0,
 };

 return kioskOverview ? hydrateDashboardStatsStockCounts(stats, kioskOverview) : stats;
}

export type PosBranchSummary = {
 branch_id: string;
 branch_name: string;
 branch_code: string;
 total_sales: number;
 transaction_count: number;
 shift_open: boolean;
};

export type PosOverview = {
 branches: PosBranchSummary[];
 open_shifts: number;
 transactions_today: number;
 recent_transactions: Array<{
 id: string;
 transaction_number: string;
 total: number;
 payment_method: string;
 created_at: string;
 branch_name?: string;
 }>;
};

type DailySummaryRow = {
 branch_id: string;
 total_sales: number;
 transaction_count: number;
};

type OpenShiftRow = {
 branch_id: string;
};

type BranchRow = {
 id: string;
 branch_name: string;
 branch_code: string;
};

type RecentTransactionRow = {
 id: string;
 transaction_number: string;
 total: number;
 payment_method: string;
 created_at: string;
 branch_id: string;
};

const ACTIVE_BRANCHES_CACHE_TTL_MS = 60_000;
const activeBranchesCache = new Map<string, { expiresAt: number; rows: BranchRow[] }>();

async function getCachedActiveBranches(
 supabase: SupabaseServerClient,
 orgId: string): Promise<BranchRow[]> {
 const cached = activeBranchesCache.get(orgId);
 if (cached && cached.expiresAt > Date.now()) {
  return cached.rows;
 }

 const { data } = await supabase
 .from('branches')
 .select('id, branch_name, branch_code')
 .eq('organization_id', orgId)
 .eq('status', 'ACTIVE')
 .order('branch_code');

 const rows = (data ?? []) as BranchRow[];
 activeBranchesCache.set(orgId, {
  expiresAt: Date.now() + ACTIVE_BRANCHES_CACHE_TTL_MS,
  rows,
 });
 return rows;
}

export async function getPosOverview(
 orgId: string,
 branchIds: string[] | null = null,
 options?: { includeAllBranches?: boolean }): Promise<PosOverview> {
 const supabase = await createClient();
 const today = new Date().toISOString().slice(0, 10);

 const scopedBranchIds = branchIds;
 if (scopedBranchIds !== null && scopedBranchIds.length === 0) {
 return {
 branches: [],
 open_shifts: 0,
 transactions_today: 0,
 recent_transactions: [],
 };
 }

 let summariesQuery = supabase.from('pos_daily_summaries').select('branch_id, total_sales, transaction_count').eq('organization_id', orgId).eq('summary_date', today);

 let shiftsQuery = supabase.from('pos_shifts').select('branch_id').eq('organization_id', orgId).eq('status', 'OPEN');

 let recentQuery = supabase.from('pos_transactions').select(
 'id, transaction_number, total, payment_method, created_at, branch_id').eq('organization_id', orgId).eq('status', 'COMPLETED').gte('created_at', `${today}T00:00:00`).order('created_at', { ascending: false }).limit(5);

 if (scopedBranchIds !== null) {
 summariesQuery = summariesQuery.in('branch_id', scopedBranchIds);
 shiftsQuery = shiftsQuery.in('branch_id', scopedBranchIds);
 recentQuery = recentQuery.in('branch_id', scopedBranchIds);
 }

 const [summariesRes, shiftsRes, recentRes] = await Promise.all([
 summariesQuery,
 shiftsQuery,
 recentQuery,
 ]);

 const summaries = (summariesRes.data ?? []) as DailySummaryRow[];
 const shifts = (shiftsRes.data ?? []) as OpenShiftRow[];
 const recent = (recentRes.data ?? []) as RecentTransactionRow[];
 const openShiftBranches = new Set(shifts.map((s) => s.branch_id));
 const visibleBranchIds = options?.includeAllBranches
 ? scopedBranchIds
 : Array.from(new Set([
 ...summaries.map((s) => s.branch_id),
 ...shifts.map((s) => s.branch_id),
 ...recent.map((t) => t.branch_id),
 ]));

 let branches: BranchRow[] = [];
 if (visibleBranchIds === null || visibleBranchIds.length > 0) {
 const activeBranches = await getCachedActiveBranches(supabase, orgId);
 if (visibleBranchIds === null) {
  branches = activeBranches;
 } else {
  const visibleBranchSet = new Set(visibleBranchIds);
  branches = activeBranches.filter((branch) => visibleBranchSet.has(branch.id));
 }
 }

 const summaryMap = new Map(summaries.map((s) => [s.branch_id, s]));
 const branchNameMap = new Map(branches.map((b) => [b.id, b.branch_name]));

 const branchSummaries: PosBranchSummary[] = branches.map((b) => {
 const summary = summaryMap.get(b.id);
 return {
 branch_id: b.id,
 branch_name: b.branch_name,
 branch_code: b.branch_code,
 total_sales: Number(summary?.total_sales ?? 0),
 transaction_count: Number(summary?.transaction_count ?? 0),
 shift_open: openShiftBranches.has(b.id),
 };
 });

 return {
 branches: options?.includeAllBranches
 ? branchSummaries.sort((a, b) => a.branch_code.localeCompare(b.branch_code))
 : branchSummaries.filter((b) => b.total_sales > 0 || b.transaction_count > 0 || b.shift_open).sort((a, b) => b.total_sales - a.total_sales),
 open_shifts: openShiftBranches.size,
 transactions_today: branchSummaries.reduce(
 (n, b) => n + b.transaction_count,
 0),
 recent_transactions: recent.map((t) => ({
 id: t.id,
 transaction_number: t.transaction_number,
 total: Number(t.total),
 payment_method: t.payment_method,
 created_at: t.created_at,
 branch_name: branchNameMap.get(t.branch_id),
 })),
 };
}

export type FleetOverviewVehicle = {
 id: string;
 vehicle_code: string;
 vehicle_type: string;
 plate_number: string | null;
 latest_status: string | null;
};

export type FleetOverview = {
 vehicles: FleetOverviewVehicle[];
 pending_deliveries: number;
 in_transit: number;
};

type ActiveVehicleRow = {
 id: string;
 vehicle_code: string;
 vehicle_type: string;
 plate_number: string | null;
 status: string;
};

const ACTIVE_VEHICLES_CACHE_TTL_MS = 60_000;
const activeVehiclesCache = new Map<string, { expiresAt: number; rows: ActiveVehicleRow[] }>();

async function getCachedActiveVehicles(
 supabase: SupabaseServerClient,
 orgId: string): Promise<ActiveVehicleRow[]> {
 const cached = activeVehiclesCache.get(orgId);
 if (cached && cached.expiresAt > Date.now()) {
  return cached.rows;
 }

 const { data } = await supabase
 .from('vehicles')
 .select('id, vehicle_code, vehicle_type, plate_number, status')
 .eq('organization_id', orgId)
 .eq('status', 'ACTIVE')
 .order('vehicle_code');

 const rows = (data ?? []) as ActiveVehicleRow[];
 activeVehiclesCache.set(orgId, {
  expiresAt: Date.now() + ACTIVE_VEHICLES_CACHE_TTL_MS,
  rows,
 });
 return rows;
}

export async function getFleetOverview(orgId: string): Promise<FleetOverview> {
 const supabase = await createClient();

 const [rows, pendingRes, inTransitRes] = await Promise.all([
 getCachedActiveVehicles(supabase, orgId),
 supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'PENDING'),
 supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'IN_TRANSIT'),
 ]);

 const vehicleIds = rows.map((v) => v.id);
 const latestStatusByVehicle = new Map<string, string>();

 if (vehicleIds.length > 0) {
 const { data: statusRows } = await supabase
 .from('fleet_status_log')
 .select('vehicle_id, status, logged_at')
 .eq('organization_id', orgId)
 .in('vehicle_id', vehicleIds)
 .order('logged_at', { ascending: false })
 .limit(Math.min(Math.max(vehicleIds.length * 10, 50), 500));

 const statusLogRows = (statusRows ?? []) as Array<{ vehicle_id: string | null; status: string }>;
 for (const row of statusLogRows) {
 const vehicleId = row.vehicle_id;
 if (vehicleId && !latestStatusByVehicle.has(vehicleId)) {
 latestStatusByVehicle.set(vehicleId, row.status);
 }
 }
 }

 const vehicles = rows.map((v) => {
 return {
 id: v.id,
 vehicle_code: v.vehicle_code,
 vehicle_type: v.vehicle_type,
 plate_number: v.plate_number,
 latest_status: latestStatusByVehicle.get(v.id) ?? null,
 };
 });

 return {
 vehicles,
 pending_deliveries: pendingRes.count ?? 0,
 in_transit: inTransitRes.count ?? 0,
 };
}

export type AreaManagerContext = {
 regionName: string | null;
 branchCount: number;
};

export async function getAreaManagerDashboardContext(
 orgId: string,
 regionId: string | null,
 branchIds: string[] | null): Promise<AreaManagerContext> {
 const supabase = await createClient();
 let regionName: string | null = null;

 if (regionId) {
 const { data } = await supabase.from('regions').select('name').eq('organization_id', orgId).eq('id', regionId).maybeSingle();
 regionName = (data as { name: string } | null)?.name ?? null;
 }

 return {
 regionName,
 branchCount: branchIds?.length ?? 0,
 };
}

export { fetchKioskOverviewForBranches };
