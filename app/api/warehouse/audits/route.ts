import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data } = await supabase.from('warehouse_audits').select(`
 id, audit_number, audit_date, status, notes, created_at,
 location:inventory_locations(name),
 warehouse_audit_items(
 system_quantity, audited_quantity, variance, unit,
 stock_item:stock_items(item_code, name))
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(20);

 return NextResponse.json({ audits: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'submit_warehouse_audit', {
 p_location_id: body.location_id,
 p_items: body.items,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
