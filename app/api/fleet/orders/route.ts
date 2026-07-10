import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();

 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const mine = searchParams.get('mine') === 'true';
 const status = searchParams.get('status');
 const requestedLimit = Number(searchParams.get('limit') ?? 20);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
 : 20;

 const supabase = await createClient();

 let query = supabase.from('delivery_orders').select(`
 *,
 origin_location:inventory_locations!delivery_orders_origin_location_id_fkey(*),
 final_destination:inventory_locations!delivery_orders_final_destination_id_fkey(*),
 primary_driver:drivers!delivery_orders_primary_driver_id_fkey(*),
 primary_vehicle:vehicles!delivery_orders_primary_vehicle_id_fkey(*),
 delivery_legs(
 *,
 from_location:inventory_locations!delivery_legs_from_location_id_fkey(*),
 to_location:inventory_locations!delivery_legs_to_location_id_fkey(*),
 driver:drivers!delivery_legs_driver_id_fkey(*),
 vehicle:vehicles!delivery_legs_vehicle_id_fkey(*),
 delivery_leg_items(
 *,
 stock_item:stock_items(*)),
 proof_of_delivery(*))
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(limit);

 if (status) {
 query = query.eq('status', status);
 }

 if (mine && profile.role === 'DRIVER') {
 const { data: driverRows } = await supabase.from('drivers').select('id, driver_code').eq('organization_id', profile.organization_id).eq('profile_id', profile.id).eq('status', 'ACTIVE');

 const myDrivers = (driverRows ?? []) as Array<{ id: string; driver_code: string }>;
 const driverIds = new Set(myDrivers.map((driver) => driver.id));
 const driverCodes = new Set(myDrivers.map((driver) => driver.driver_code));

 if (driverCodes.has('DIST-DRV-001') || driverCodes.has('DIST-AST-001')) {
 const { data: companionRows } = await supabase
 .from('drivers')
 .select('id')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE')
 .in('driver_code', ['DIST-DRV-001', 'DIST-AST-001']);

 for (const driver of (companionRows ?? []) as Array<{ id: string }>) {
 driverIds.add(driver.id);
 }
 }

 if (driverIds.size === 0) {
 return NextResponse.json({ orders: [] });
 }
 query = query.in('primary_driver_id', [...driverIds]);
 }

 const { data, error } = await query;

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const response = NextResponse.json({ orders: data ?? [] });
 response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
 return response;
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();

 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const supabase = await createClient();

 try {
 const payload = await request.json();

 const { data, error } = await inventoryRpc(supabase, 'create_delivery_order', {
 p_final_destination_id: payload.final_destination_id,
 p_legs: payload.legs,
 p_notes: payload.notes ?? null,
 p_origin_location_id: payload.origin_location_id ?? null,
 p_primary_driver_id: payload.primary_driver_id ?? null,
 p_primary_vehicle_id: payload.primary_vehicle_id ?? null,
 p_scheduled_date: payload.scheduled_date ?? null,
 p_ai_route_summary: payload.ai_route_summary ?? null,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 return NextResponse.json({
 result: {
 order_id: data,
 order_number: null,
 },
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Failed to create delivery order' },
 { status: 500 });
 }
}
