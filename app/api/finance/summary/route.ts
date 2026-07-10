import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 if (scope.branchIds !== null && scope.branchIds.length === 0) {
 return NextResponse.json({
 summary: {
 pending_collections: 0,
 collected_today: 0,
 banked_today: 0,
 pending_reconciliations: 0,
 outstanding_cash: 0,
 },
 }, {
 headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
 });
 }

 const today = new Date().toISOString().slice(0, 10);

 let pendingCollectionsQuery = supabase.from('finance_collections').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'PENDING');
 if (scope.branchIds !== null) pendingCollectionsQuery = pendingCollectionsQuery.in('branch_id', scope.branchIds);

 let collectedTodayQuery = supabase.from('finance_collections').select('amount').eq('organization_id', profile.organization_id).eq('status', 'COLLECTED').gte('collected_at', `${today}T00:00:00`);
 if (scope.branchIds !== null) collectedTodayQuery = collectedTodayQuery.in('branch_id', scope.branchIds);

 const bankedTodayQuery = supabase.from('bank_in_records').select('amount').eq('organization_id', profile.organization_id).gte('banked_at', `${today}T00:00:00`);

 let pendingReconQuery = supabase.from('cash_reconciliations').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'PENDING');
 if (scope.branchIds !== null) pendingReconQuery = pendingReconQuery.in('branch_id', scope.branchIds);

 let outstandingQuery = supabase.from('finance_collections').select('amount').eq('organization_id', profile.organization_id).in('status', ['PENDING', 'COLLECTED']);
 if (scope.branchIds !== null) outstandingQuery = outstandingQuery.in('branch_id', scope.branchIds);

 const [
 pendingCollectionsResult,
 collectedTodayResult,
 bankedTodayResult,
 pendingReconResult,
 outstandingResult,
 ] = await Promise.all([
 pendingCollectionsQuery,
 collectedTodayQuery,
 bankedTodayQuery,
 pendingReconQuery,
 outstandingQuery,
 ]);

 if (pendingCollectionsResult.error) return NextResponse.json({ error: pendingCollectionsResult.error.message }, { status: 500 });
 if (collectedTodayResult.error) return NextResponse.json({ error: collectedTodayResult.error.message }, { status: 500 });
 if (bankedTodayResult.error) return NextResponse.json({ error: bankedTodayResult.error.message }, { status: 500 });
 if (pendingReconResult.error) return NextResponse.json({ error: pendingReconResult.error.message }, { status: 500 });
 if (outstandingResult.error) return NextResponse.json({ error: outstandingResult.error.message }, { status: 500 });

 const sum = (rows: { amount: number }[] | null) =>
 (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

 return NextResponse.json({
 summary: {
 pending_collections: pendingCollectionsResult.count ?? 0,
 collected_today: sum(collectedTodayResult.data as { amount: number }[] | null),
 banked_today: sum(bankedTodayResult.data as { amount: number }[] | null),
 pending_reconciliations: pendingReconResult.count ?? 0,
 outstanding_cash: sum(outstandingResult.data as { amount: number }[] | null),
 },
 }, {
 headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
 });
}
