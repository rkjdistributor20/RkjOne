import type { SupabaseClient } from '@supabase/supabase-js';

export type BranchMetricsRow = {
 branch_id: string;
 branch_code: string;
 branch_name: string;
 sales_today: number;
 sales_week: number;
 sales_month: number;
 txn_today: number;
 txn_week: number;
 txn_month: number;
 shift_open: boolean;
 staff_count: number;
 staff_clocked_in_today: number;
 /** Purata jualan harian minggu ini (exclude hari ini) */
 avg_daily_week: number;
};

function dateStrings() {
 const now = new Date();
 const today = now.toISOString().slice(0, 10);
 const weekStart = new Date(now);
 weekStart.setDate(weekStart.getDate() ?? weekStart.getDay());
 const monthStart = `${today.slice(0, 8)}01`;
 return {
 today,
 weekStart: weekStart.toISOString().slice(0, 10),
 monthStart,
 };
}

type SummaryRow = {
 branch_id: string;
 summary_date: string;
 total_sales: number;
 transaction_count: number;
};

export async function getAreaManagerBranchMetrics(
 supabase: SupabaseClient,
 orgId: string,
 branchIds: string[]): Promise<BranchMetricsRow[]> {
 if (!branchIds.length) return [];

 const { today, weekStart, monthStart } = dateStrings();

 const [branchesRes, summariesRes, shiftsRes, staffRes, attendanceRes] =
 await Promise.all([
 supabase.from('branches').select('id, branch_code, branch_name').eq('organization_id', orgId).in('id', branchIds).eq('status', 'ACTIVE').order('branch_code'),
 supabase.from('pos_daily_summaries').select('branch_id, summary_date, total_sales, transaction_count').eq('organization_id', orgId).in('branch_id', branchIds).gte('summary_date', monthStart),
 supabase.from('pos_shifts').select('branch_id').eq('organization_id', orgId).eq('status', 'OPEN').in('branch_id', branchIds),
 supabase.from('staff').select('branch_id').eq('organization_id', orgId).eq('status', 'ACTIVE').in('branch_id', branchIds),
 supabase.from('attendance_records').select('branch_id, staff_id').eq('organization_id', orgId).eq('attendance_date', today).in('branch_id', branchIds),
 ]);

 const branches = branchesRes.data ?? [];
 const summaries = (summariesRes.data ?? []) as SummaryRow[];
 const openShifts = new Set((shiftsRes.data ?? []).map((s) => s.branch_id as string));

 const staffCount = new Map<string, number>();
 for (const s of staffRes.data ?? []) {
 if (!s.branch_id) continue;
 staffCount.set(s.branch_id, (staffCount.get(s.branch_id) ?? 0) + 1);
 }

 const clockedIn = new Map<string, Set<string>>();
 for (const a of attendanceRes.data ?? []) {
 if (!a.branch_id) continue;
 const set = clockedIn.get(a.branch_id) ?? new Set();
 set.add(a.staff_id as string);
 clockedIn.set(a.branch_id, set);
 }

 return branches.map((b) => {
 const rows = summaries.filter((s) => s.branch_id === b.id);
 let salesToday = 0;
 let salesWeek = 0;
 let salesMonth = 0;
 let txnToday = 0;
 let txnWeek = 0;
 let txnMonth = 0;
 let weekDaysBeforeToday = 0;
 let salesWeekBeforeToday = 0;

 for (const r of rows) {
 const sales = Number(r.total_sales ?? 0);
 const txn = Number(r.transaction_count ?? 0);
 if (r.summary_date === today) {
 salesToday += sales;
 txnToday += txn;
 }
 if (r.summary_date >= weekStart) {
 salesWeek += sales;
 txnWeek += txn;
 if (r.summary_date < today) {
 weekDaysBeforeToday += 1;
 salesWeekBeforeToday += sales;
 }
 }
 salesMonth += sales;
 txnMonth += txn;
 }

 const avgDailyWeek =
 weekDaysBeforeToday > 0 ? salesWeekBeforeToday / weekDaysBeforeToday : salesWeek / 7;

 return {
 branch_id: b.id,
 branch_code: b.branch_code,
 branch_name: b.branch_name,
 sales_today: salesToday,
 sales_week: salesWeek,
 sales_month: salesMonth,
 txn_today: txnToday,
 txn_week: txnWeek,
 txn_month: txnMonth,
 shift_open: openShifts.has(b.id),
 staff_count: staffCount.get(b.id) ?? 0,
 staff_clocked_in_today: clockedIn.get(b.id)?.size ?? 0,
 avg_daily_week: avgDailyWeek,
 };
 });
}
