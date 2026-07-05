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
 });
 }

 const today = new Date().toISOString().slice(0, 10);

 let pendingCollectionsQuery = supabase.from('finance_collections').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'PENDING');
 if (scope.branchIds !== null) pendingCollectionsQuery = pendingCollectionsQuery.in('branch_id', scope.branchIds);
 const { count: pendingCollections } = await pendingCollectionsQuery;

 let collectedTodayQuery = supabase.from('finance_collections').select('amount').eq('organization_id', profile.organization_id).eq('status', 'COLLECTED').gte('collected_at', `${today}T00:00:00`);
 if (scope.branchIds !== null) collectedTodayQuery = collectedTodayQuery.in('branch_id', scope.branchIds);
 const { data: collectedToday } = await collectedTodayQuery;

 const { data: bankedToday } = await supabase.from('bank_in_records').select('amount').eq('organization_id', profile.organization_id).gte('banked_at', `${today}T00:00:00`);

 let pendingReconQuery = supabase.from('cash_reconciliations').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'PENDING');
 if (scope.branchIds !== null) pendingReconQuery = pendingReconQuery.in('branch_id', scope.branchIds);
 const { count: pendingRecon } = await pendingReconQuery;

 let outstandingQuery = supabase.from('finance_collections').select('amount').eq('organization_id', profile.organization_id).in('status', ['PENDING', 'COLLECTED']);
 if (scope.branchIds !== null) outstandingQuery = outstandingQuery.in('branch_id', scope.branchIds);
 const { data: outstanding } = await outstandingQuery;

 const sum = (rows: { amount: number }[] | null) =>
 (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

 return NextResponse.json({
 summary: {
 pending_collections: pendingCollections ?? 0,
 collected_today: sum(collectedToday as { amount: number }[] | null),
 banked_today: sum(bankedToday as { amount: number }[] | null),
 pending_reconciliations: pendingRecon ?? 0,
 outstanding_cash: sum(outstanding as { amount: number }[] | null),
 },
 });
}
