import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { createClient } from '@/lib/supabase/server';

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

 let query = supabase.from('finance_collection_usages').select(`
 id, collection_id, branch_id, supply_request_id, usage_number, usage_type, amount,
 description, proof_url, receipt_number, vehicle_reference, vendor_name,
 spent_at, status, reviewed_at, review_notes, created_at,
 branch:branches(branch_name, branch_code),
 collection:finance_collections(collection_number, amount, status)
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(80);

 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) return NextResponse.json({ usages: [] });
 query = query.in('branch_id', scope.branchIds);
 }

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 return NextResponse.json({ usages: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'record_collection_cash_usage', {
 p_collection_id: body.collection_id,
 p_usage_type: body.usage_type,
 p_amount: body.amount,
 p_description: body.description,
 p_proof_url: body.proof_url ?? null,
 p_receipt_number: body.receipt_number ?? null,
 p_supply_request_id: body.supply_request_id ?? null,
 p_vehicle_reference: body.vehicle_reference ?? null,
 p_vendor_name: body.vendor_name ?? null,
 p_spent_at: body.spent_at ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'review_collection_cash_usage', {
 p_usage_id: body.usage_id,
 p_status: body.status,
 p_review_notes: body.review_notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
