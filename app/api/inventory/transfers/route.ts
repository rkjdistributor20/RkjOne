import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertTransferCreateAllowed,
 stockGuardErrorMessage,
} from '@/lib/inventory/stock-guard';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const locationId = new URL(request.url).searchParams.get('location_id');
 const supabase = await createClient();

 let query = supabase.from('stock_transfers').select(`
 id, transfer_number, status, created_at, dispatched_at, delivered_at,
 from_location:inventory_locations!stock_transfers_from_location_id_fkey(id, name, location_type, branch_id),
 to_location:inventory_locations!stock_transfers_to_location_id_fkey(id, name, location_type, branch_id),
 stock_transfer_items(quantity, unit, production_date, stock_item:stock_items(item_code, name, category))
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(50);

 if (locationId) {
 query = query.or(
 `from_location_id.eq.${locationId},to_location_id.eq.${locationId}`);
 }

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 return NextResponse.json({ transfers: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 try {
 await assertTransferCreateAllowed(
 supabase,
 profile,
 body.from_location_id,
 body.to_location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'create_stock_transfer', {
 p_from_location_id: body.from_location_id,
 p_to_location_id: body.to_location_id,
 p_items: body.items,
 p_driver_id: body.driver_id ?? null,
 p_vehicle_id: body.vehicle_id ?? null,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
