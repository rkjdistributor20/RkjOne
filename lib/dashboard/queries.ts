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
    branches: branchSummaries.sort((a, b) => b.total_sales - a.total_sales),
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
