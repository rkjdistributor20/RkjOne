import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';

function parseRange(request: Request) {
 const url = new URL(request.url);
 const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
 const from =
 url.searchParams.get('from') ??
 new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
 return { from, to };
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { from, to } = parseRange(request);
 const supabase = await createClient();

 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let summariesQuery = supabase.from('pos_daily_summaries').select('total_sales, total_cash, total_qr, transaction_count, void_count, refund_count').eq('organization_id', profile.organization_id).gte('summary_date', from).lte('summary_date', to);

 if (scope.branchIds !== null) {
 summariesQuery = applyBranchIdsFilter(summariesQuery, 'branch_id', scope.branchIds);
 }

 const deliveriesPendingQuery = supabase.from('delivery_orders').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).in('status', ['PENDING', 'IN_TRANSIT']);

 const deliveriesCompletedQuery = supabase.from('delivery_orders').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'DELIVERED').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);

 const payrollRunsQuery = supabase.from('payroll_runs').select('total_net').eq('organization_id', profile.organization_id).eq('status', 'APPROVED').gte('period_start', from).lte('period_end', to);

 const lowStockQuery = supabase.from('inventory_balances').select('quantity, stock_item:stock_items(min_threshold, critical_threshold)').eq('organization_id', profile.organization_id).limit(1000);

 let outstandingQuery = supabase.from('finance_collections').select('amount').eq('organization_id', profile.organization_id).eq('status', 'PENDING');

 if (scope.branchIds !== null) {
 outstandingQuery = applyBranchIdsFilter(outstandingQuery, 'branch_id', scope.branchIds);
 }

 const [
 summariesResult,
 deliveriesPendingResult,
 deliveriesCompletedResult,
 payrollRunsResult,
 lowStockResult,
 outstandingResult,
 ] = await Promise.all([
 summariesQuery,
 deliveriesPendingQuery,
 deliveriesCompletedQuery,
 payrollRunsQuery,
 lowStockQuery,
 outstandingQuery,
 ]);

 if (summariesResult.error) return NextResponse.json({ error: summariesResult.error.message }, { status: 500 });
 if (payrollRunsResult.error) return NextResponse.json({ error: payrollRunsResult.error.message }, { status: 500 });
 if (lowStockResult.error) return NextResponse.json({ error: lowStockResult.error.message }, { status: 500 });
 if (outstandingResult.error) return NextResponse.json({ error: outstandingResult.error.message }, { status: 500 });

 const rows = (summariesResult.data ?? []) as Array<{
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 void_count: number;
 refund_count: number;
 }>;

 const agg = rows.reduce(
 (a, r) => ({
 total_sales: a.total_sales + Number(r.total_sales),
 total_cash: a.total_cash + Number(r.total_cash),
 total_qr: a.total_qr + Number(r.total_qr),
 transaction_count: a.transaction_count + Number(r.transaction_count),
 void_count: a.void_count + Number(r.void_count),
 refund_count: a.refund_count + Number(r.refund_count),
 }),
 { total_sales: 0, total_cash: 0, total_qr: 0, transaction_count: 0, void_count: 0, refund_count: 0 });

 const payrollRuns = payrollRunsResult.data ?? [];
 const payrollNet = (payrollRuns as { total_net: number }[]).reduce(
 (s, r) => s + Number(r.total_net),
 0);

 const lowStockCount = ((lowStockResult.data ?? []) as unknown as Array<{
 quantity: number;
 stock_item: { min_threshold: number | null; critical_threshold: number | null };
 }>).filter((b) => {
 const q = Number(b.quantity);
 const si = b.stock_item;
 return (
 (si.critical_threshold != null && q <= si.critical_threshold) ||
 (si.min_threshold != null && q <= si.min_threshold));
 }).length;

 const outstandingCash = ((outstandingResult.data ?? []) as { amount: number }[]).reduce(
 (s, r) => s + Number(r.amount),
 0);

 return NextResponse.json({
 overview: {
 period_start: from,
 period_end: to,...agg,
 deliveries_pending: deliveriesPendingResult.count ?? 0,
 deliveries_completed: deliveriesCompletedResult.count ?? 0,
 payroll_runs: payrollRuns?.length ?? 0,
 payroll_net: payrollNet,
 low_stock_count: lowStockCount,
 outstanding_cash: outstandingCash,
 },
 }, {
 headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=90' },
 });
}
