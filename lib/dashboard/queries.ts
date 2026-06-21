import { createClient } from '@/lib/supabase/server';
import type { DashboardStats } from '@/types/database';

export async function getDashboardStats(
  orgId: string
): Promise<DashboardStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('dashboard_stats')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('[dashboard_stats]', error.message);
    return null;
  }

  return data;
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

export async function getPosOverview(orgId: string): Promise<PosOverview> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [summariesRes, shiftsRes, recentRes, branchesRes] = await Promise.all([
    supabase
      .from('pos_daily_summaries')
      .select('branch_id, total_sales, transaction_count')
      .eq('organization_id', orgId)
      .eq('summary_date', today),
    supabase
      .from('pos_shifts')
      .select('branch_id')
      .eq('organization_id', orgId)
      .eq('status', 'OPEN'),
    supabase
      .from('pos_transactions')
      .select(
        'id, transaction_number, total, payment_method, created_at, branch_id'
      )
      .eq('organization_id', orgId)
      .eq('status', 'COMPLETED')
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('branches')
      .select('id, branch_name, branch_code')
      .eq('organization_id', orgId)
      .eq('status', 'ACTIVE'),
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
    branches: branchSummaries
      .filter((b) => b.total_sales > 0 || b.transaction_count > 0 || b.shift_open)
      .sort((a, b) => b.total_sales - a.total_sales),
    open_shifts: openShiftBranches.size,
    transactions_today: branchSummaries.reduce(
      (n, b) => n + b.transaction_count,
      0
    ),
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
    supabase
      .from('fleet_vehicles')
      .select('id, vehicle_code, vehicle_type, plate_number, status')
      .eq('organization_id', orgId)
      .eq('status', 'ACTIVE')
      .order('vehicle_code'),
    supabase
      .from('delivery_orders')
      .select('status')
      .eq('organization_id', orgId)
      .in('status', ['PENDING', 'IN_TRANSIT']),
  ]);

  const vehicles = (vehiclesRes.data ?? []) as Array<{
    id: string;
    vehicle_code: string;
    vehicle_type: string;
    plate_number: string | null;
    status: string;
  }>;

  const orders = (ordersRes.data ?? []) as Array<{ status: string }>;

  const statusRes = await supabase
    .from('fleet_status_logs')
    .select('vehicle_id, status')
    .eq('organization_id', orgId)
    .order('logged_at', { ascending: false });

  const latestByVehicle = new Map<string, string>();
  for (const log of statusRes.data ?? []) {
    const row = log as { vehicle_id: string; status: string };
    if (!latestByVehicle.has(row.vehicle_id)) {
      latestByVehicle.set(row.vehicle_id, row.status);
    }
  }

  return {
    vehicles: vehicles.map((v) => ({
      id: v.id,
      vehicle_code: v.vehicle_code,
      vehicle_type: v.vehicle_type,
      plate_number: v.plate_number,
      latest_status: latestByVehicle.get(v.id) ?? null,
    })),
    pending_deliveries: orders.filter((o) => o.status === 'PENDING').length,
    in_transit: orders.filter((o) => o.status === 'IN_TRANSIT').length,
  };
}
