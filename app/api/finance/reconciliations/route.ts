import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('cash_reconciliations').select(`
 id, reconciliation_number, reconciliation_date,
 expected_cash, actual_cash, variance, status, notes,
 branch:branches(branch_name)
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(30);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ reconciliations: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'submit_cash_reconciliation', {
 p_branch_id: body.branch_id,
 p_reconciliation_date: body.reconciliation_date,
 p_expected_cash: body.expected_cash,
 p_actual_cash: body.actual_cash,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
