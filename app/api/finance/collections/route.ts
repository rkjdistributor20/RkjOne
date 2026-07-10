import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const url = new URL(request.url);
 const status = url.searchParams.get('status');
 const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
 : 50;
 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let query = supabase.from('finance_collections').select(`
 id, branch_id, collection_number, collection_type, amount, status,
 collected_from, collector_name, third_party_name, collected_at, created_at,
 branch:branches(branch_name, branch_code)
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(limit);

 if (status) query = query.eq('status', status);
 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) return NextResponse.json({ collections: [] });
 query = query.in('branch_id', scope.branchIds);
 }

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ collections: data ?? [] }, {
 headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'create_finance_collection', {
 p_collection_type: body.collection_type,
 p_amount: body.amount,
 p_branch_id: body.branch_id ?? null,
 p_shift_id: body.shift_id ?? null,
 p_collected_from: body.collected_from ?? null,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
