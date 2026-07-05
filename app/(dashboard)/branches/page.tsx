import { redirect } from 'next/navigation';
import {
 BranchesDashboard,
 type BranchDashboardBranch,
 type BranchDashboardRegion,
 type BranchesDashboardSummary,
 type BranchInventoryStatus,
} from '@/components/branches/branches-dashboard';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { getAreaManagerBranchMetrics } from '@/lib/dashboard/am-branch-metrics';
import { fetchKioskOverviewForBranches } from '@/lib/dashboard/queries';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type EmbeddedRegion = {
 id: string;
 name: string;
 manager_name: string | null;
};

type BranchRow = {
 id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 manager_name: string | null;
 region_id: string | null;
 status: string;
 region: EmbeddedRegion | EmbeddedRegion[] | null;
};

type MaintenanceRow = {
 branch_id: string | null;
 priority: string | null;
 status: string | null;
};

export default async function BranchesPage() {
 const profile = await getCurrentProfile();
 if (!profile) {
 redirect('/login');
 }

 const supabase = await createClient();
 const regions = await fetchRegions(supabase, profile.organization_id);

 const scope = await resolveScopedBranches(supabase, profile);

 let branchQuery = supabase
 .from('branches')
 .select('id, branch_code, branch_name, area, manager_name, region_id, status, region:regions(id, name, manager_name)')
 .eq('organization_id', profile.organization_id)
 .order('branch_code');

 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) {
 return (
 <BranchesDashboard
 branches={[]}
 regions={regions}
 summary={emptySummary()}
 canManageBranches={canManageBranchProfiles(profile.role)}
 userRole={profile.role}
 />)
 }
 branchQuery = branchQuery.in('id', scope.branchIds);
 }

 const { data: branchRows, error: branchError } = await branchQuery;
 if (branchError) {
 throw new Error(branchError.message);
 }

 const branches = ((branchRows ?? []) as unknown as BranchRow[]).map((row) => {
 const region = one(row.region);
 return {
 id: row.id,
 branch_code: row.branch_code,
 branch_name: row.branch_name,
 area: row.area,
 manager_name: region?.manager_name ?? row.manager_name,
 region_id: row.region_id ?? region?.id ?? null,
 status: row.status,
 region_name: region?.name ?? null,
 };
 });

 const branchIds = branches.map((branch) => branch.id);
 const [metrics, kioskOverview, maintenanceRows] = await Promise.all([
 getAreaManagerBranchMetrics(supabase, profile.organization_id, branchIds),
 fetchKioskOverviewForBranches(supabase, profile.organization_id, branchIds),
 fetchOpenMaintenanceRows(supabase, profile.organization_id, branchIds),
 ]);

 const metricsByBranch = new Map(metrics.map((row) => [row.branch_id, row]));
 const kioskByBranch = new Map(kioskOverview.branches.map((row) => [row.branch_id, row]));
 const maintenanceByBranch = new Map<string, { open: number; urgent: number }>();

 for (const row of maintenanceRows) {
 if (!row.branch_id) continue;
 const current = maintenanceByBranch.get(row.branch_id) ?? { open: 0, urgent: 0 };
 current.open += 1;
 if (row.priority === 'URGENT' || row.priority === 'HIGH') current.urgent += 1;
 maintenanceByBranch.set(row.branch_id, current);
 }

 const dashboardBranches: BranchDashboardBranch[] = branches.map((branch) => {
 const metric = metricsByBranch.get(branch.id);
 const kiosk = kioskByBranch.get(branch.id);
 const maintenance = maintenanceByBranch.get(branch.id) ?? { open: 0, urgent: 0 };
 const hasKioskLocation = kiosk?.has_location ?? false;
 const inventoryStatus: BranchInventoryStatus = hasKioskLocation
 ? (kiosk?.worst_status ?? 'OK')
 : 'NO_LOCATION';

 return {
 id: branch.id,
 region_id: branch.region_id,
 branch_code: branch.branch_code,
 branch_name: branch.branch_name,
 area: branch.area,
 region_name: branch.region_name,
 manager_name: branch.manager_name,
 status: branch.status,
 sales_today: metric?.sales_today ?? 0,
 sales_week: metric?.sales_week ?? 0,
 sales_month: metric?.sales_month ?? 0,
 transactions_today: metric?.txn_today ?? 0,
 shift_open: metric?.shift_open ?? false,
 staff_count: metric?.staff_count ?? 0,
 staff_clocked_in_today: metric?.staff_clocked_in_today ?? 0,
 inventory_status: inventoryStatus,
 inventory_low_count: kiosk?.low_count ?? 0,
 inventory_critical_count: kiosk?.critical_count ?? 0,
 pending_transfers: kiosk?.pending_transfers ?? 0,
 has_kiosk_location: hasKioskLocation,
 maintenance_open: maintenance.open,
 maintenance_urgent: maintenance.urgent,
 profile_score: profileScore({
 area: branch.area,
 manager_name: branch.manager_name,
 region_name: branch.region_name,
 has_kiosk_location: hasKioskLocation,
 }),
 };
 });

 const summary = buildSummary(dashboardBranches);

 return (
 <BranchesDashboard
 branches={dashboardBranches}
 regions={regions}
 summary={summary}
 canManageBranches={canManageBranchProfiles(profile.role)}
 userRole={profile.role}
 />);
}

function one<T>(value: T | T[] | null | undefined): T | null {
 if (Array.isArray(value)) return value[0] ?? null;
 return value ?? null;
}

async function fetchOpenMaintenanceRows(
 supabase: Awaited<ReturnType<typeof createClient>>,
 orgId: string,
 branchIds: string[]): Promise<MaintenanceRow[]> {
 if (!branchIds.length) return [];

 const { data, error } = await supabase
 .from('maintenance_reports')
 .select('branch_id, priority, status')
 .eq('organization_id', orgId)
 .in('branch_id', branchIds)
 .in('status', ['NEW', 'REVIEWING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS']);

 if (error) {
 console.error('[branches:maintenance]', error.message);
 return [];
 }

 return (data ?? []) as MaintenanceRow[];
}

async function fetchRegions(
 supabase: Awaited<ReturnType<typeof createClient>>,
 orgId: string): Promise<BranchDashboardRegion[]> {
 const { data, error } = await supabase
 .from('regions')
 .select('id, code, name, manager_name, status')
 .eq('organization_id', orgId)
 .eq('status', 'ACTIVE')
 .order('code');

 if (error) {
 console.error('[branches:regions]', error.message);
 return [];
 }

 return ((data ?? []) as Array<BranchDashboardRegion & { status?: string }>).map((region) => ({
 id: region.id,
 code: region.code,
 name: region.name,
 manager_name: region.manager_name,
 }));
}

function profileScore({
 area,
 manager_name,
 region_name,
 has_kiosk_location,
}: {
 area: string | null;
 manager_name: string | null;
 region_name: string | null;
 has_kiosk_location: boolean;
}) {
 const checks = [
 true,
 true,
 Boolean(area),
 Boolean(manager_name),
 Boolean(region_name),
 has_kiosk_location,
 ];
 const passed = checks.filter(Boolean).length;
 return Math.round((passed / checks.length) * 100);
}

function buildSummary(branches: BranchDashboardBranch[]): BranchesDashboardSummary {
 return {
 total: branches.length,
 active: branches.filter((branch) => branch.status === 'ACTIVE').length,
 open_pos: branches.filter((branch) => branch.shift_open).length,
 sales_today: branches.reduce((sum, branch) => sum + branch.sales_today, 0),
 sales_month: branches.reduce((sum, branch) => sum + branch.sales_month, 0),
 transactions_today: branches.reduce((sum, branch) => sum + branch.transactions_today, 0),
 staff_total: branches.reduce((sum, branch) => sum + branch.staff_count, 0),
 inventory_alerts: branches.filter(
 (branch) =>
 branch.inventory_status === 'LOW' ||
 branch.inventory_status === 'CRITICAL' ||
 branch.inventory_status === 'NO_LOCATION').length,
 pending_transfers: branches.reduce((sum, branch) => sum + branch.pending_transfers, 0),
 maintenance_open: branches.reduce((sum, branch) => sum + branch.maintenance_open, 0),
 };
}

function emptySummary(): BranchesDashboardSummary {
 return {
 total: 0,
 active: 0,
 open_pos: 0,
 sales_today: 0,
 sales_month: 0,
 transactions_today: 0,
 staff_total: 0,
 inventory_alerts: 0,
 pending_transfers: 0,
 maintenance_open: 0,
 };
}

function canManageBranchProfiles(role: string) {
 return ['SUPER_ADMIN', 'ADMIN'].includes(role);
}
