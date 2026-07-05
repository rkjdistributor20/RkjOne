import { createClient } from '@/lib/supabase/server';
import type { DashboardStats } from '@/types/database';
import { fetchKioskOverviewForBranches } from '@/lib/inventory/kiosk-overview-data';

export async function getDashboardStats(
 orgId: string,
 branchIds: string[] | null = null): Promise<DashboardStats | null> {
 const supabase = await createClient();

 if (branchIds === null) {
 const { data, error } = await supabase.from('dashboard_stats').select('*').eq('organization_id', orgId).maybeSingle();

 if (error) {
 console.error('[dashboard_stats]', error.message);
 return null;
 }

 return data;
 }

 if (branchIds.length === 0) {
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

 const today = new Date().toISOString().slice(0, 10);
 const weekStart = new Date();
 weekStart.setDate(weekStart.getDate() ?? weekStart.getDay());
 const weekStartStr = weekStart.toISOString().slice(0, 10);
 const monthStart = `${today.slice(0, 8)}01`;

 const [todayRes, weekRes, monthRes, approvalsRes, kioskOverview] = await Promise.all([
 supabase.from('pos_daily_summaries').select('total_sales').eq('organization_id', orgId).eq('summary_date', today).in('branch_id', branchIds),
 supabase.from('pos_daily_summaries').select('total_sales').eq('organization_id', orgId).gte('summary_date', weekStartStr).in('branch_id', branchIds),
 supabase.from('pos_daily_summaries').select('total_sales').eq('organization_id', orgId).gte('summary_date', monthStart).in('branch_id', branchIds),
 supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'PENDING').in('branch_id', branchIds),
 fetchKioskOverviewForBranches(supabase, orgId, branchIds),
 ]);

 const sum = (rows: Array<{ total_sales?: number }> | null) =>
 (rows ?? []).reduce((n, r) => n + Number(r.total_sales ?? 0), 0);

 return {
 organization_id: orgId,
 sales_today: sum(todayRes.data as Array<{ total_sales: number }> | null),
 sales_this_week: sum(weekRes.data as Array<{ total_sales: number }> | null),
 sales_this_month: sum(monthRes.data as Array<{ total_sales: number }> | null),
 pending_approvals: approvalsRes.count ?? 0,
 critical_stock_count: kioskOverview.summary.critical,
 low_stock_count: kioskOverview.summary.low,
 outstanding_cash: 0,
 };
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

export async function getPosOverview(
 orgId: string,
 branchIds: string[] | null = null,
 options?: { includeAllBranches?: boolean }): Promise<PosOverview> {
 const supabase = await createClient();
 const today = new Date().toISOString().slice(0, 10);

 let branchesQuery = supabase.from('branches').select('id, branch_name, branch_code').eq('organization_id', orgId).eq('status', 'ACTIVE');

 if (branchIds !== null) {
 if (branchIds.length === 0) {
 return {
 branches: [],
 open_shifts: 0,
 transactions_today: 0,
 recent_transactions: [],
 };
 }
 branchesQuery = branchesQuery.in('id', branchIds);
 }

 let summariesQuery = supabase.from('pos_daily_summaries').select('branch_id, total_sales, transaction_count').eq('organization_id', orgId).eq('summary_date', today);

 let shiftsQuery = supabase.from('pos_shifts').select('branch_id').eq('organization_id', orgId).eq('status', 'OPEN');

 let recentQuery = supabase.from('pos_transactions').select(
 'id, transaction_number, total, payment_method, created_at, branch_id').eq('organization_id', orgId).eq('status', 'COMPLETED').gte('created_at', `${today}T00:00:00`).order('created_at', { ascending: false }).limit(5);

 if (branchIds !== null) {
 summariesQuery = summariesQuery.in('branch_id', branchIds);
 shiftsQuery = shiftsQuery.in('branch_id', branchIds);
 recentQuery = recentQuery.in('branch_id', branchIds);
 }

 const [summariesRes, shiftsRes, recentRes, branchesRes] = await Promise.all([
 summariesQuery,
 shiftsQuery,
 recentQuery,
 branchesQuery,
 ]);

 const summaries = (summariesRes.data ?? []) as DailySummaryRow[];
 const shifts = (shiftsRes.data ?? []) as OpenShiftRow[];
 const branches = (branchesRes.data ?? []) as BranchRow[];
 const recent = (recentRes.data ?? []) as RecentTransactionRow[];

 const openShiftBranches = new Set(shifts.map((s) => s.branch_id));
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
 : branchSummaries.filter((b) => b.total_sales > 0 || b.transaction_count > 0 || b.shift_open).sort((a, b) => b.total_sales ?? a.total_sales),
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

export async function getFleetOverview(orgId: string): Promise<FleetOverview> {
 const supabase = await createClient();

 const [vehiclesRes, ordersRes] = await Promise.all([
 supabase.from('vehicles').select(`
 id, vehicle_code, vehicle_type, plate_number, status,
 fleet_status_log(status, logged_at)
 `).eq('organization_id', orgId).eq('status', 'ACTIVE').order('vehicle_code'),
 supabase.from('delivery_orders').select('status').eq('organization_id', orgId).in('status', ['PENDING', 'IN_TRANSIT']),
 ]);

 const rows = (vehiclesRes.data ?? []) as Array<{
 id: string;
 vehicle_code: string;
 vehicle_type: string;
 plate_number: string | null;
 status: string;
 fleet_status_log: Array<{ status: string; logged_at: string }> | null;
 }>;

 const orders = (ordersRes.data ?? []) as Array<{ status: string }>;

 const vehicles = rows.map((v) => {
 const logs = v.fleet_status_log;
 const latest = logs?.sort(
 (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0];
 return {
 id: v.id,
 vehicle_code: v.vehicle_code,
 vehicle_type: v.vehicle_type,
 plate_number: v.plate_number,
 latest_status: latest?.status ?? null,
 };
 });

 return {
 vehicles,
 pending_deliveries: orders.filter((o) => o.status === 'PENDING').length,
 in_transit: orders.filter((o) => o.status === 'IN_TRANSIT').length,
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
