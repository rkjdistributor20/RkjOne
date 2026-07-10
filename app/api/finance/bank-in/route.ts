import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const url = new URL(request.url);
 const requestedLimit = Number(url.searchParams.get('limit') ?? 30);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
 : 30;

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 const { data, error } = await supabase.from('bank_in_records').select(`
 id, bank_in_number, collection_id, amount, bank_name, reference_number, slip_url, banked_at, status,
 collection:finance_collections(branch_id, collection_number, branch:branches(branch_name, branch_code))
 `).eq('organization_id', profile.organization_id).order('banked_at', { ascending: false }).limit(limit);

 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) return NextResponse.json({ records: [] });
 }

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 const rawRecords = (data ?? []) as Array<{
 collection?: { branch_id?: string | null } | Array<{ branch_id?: string | null }>;
 }>;
 const records = scope.branchIds === null
 ? data ?? []
 : rawRecords.filter((record) => {
 const collection = Array.isArray(record.collection) ? record.collection[0] : record.collection;
 return collection?.branch_id ? scope.branchIds!.includes(collection.branch_id) : false;
 });
 return NextResponse.json({ records }, {
 headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'record_bank_in', {
 p_amount: body.amount,
 p_collection_id: body.collection_id ?? null,
 p_bank_name: body.bank_name ?? null,
 p_reference_number: body.reference_number ?? null,
 p_slip_url: body.slip_url ?? null,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
