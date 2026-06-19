import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

const ORDER_SELECT = `
  id, order_number, status, scheduled_date, notes, created_at,
  origin_location:inventory_locations!delivery_orders_origin_location_id_fkey(name, location_type),
  final_destination:inventory_locations!delivery_orders_final_destination_id_fkey(name, location_type),
  primary_driver:drivers(full_name),
  primary_vehicle:vehicles(vehicle_type, vehicle_code),
  delivery_legs(
    id, leg_sequence, leg_type, status, dispatched_at, delivered_at,
    from_location:inventory_locations!delivery_legs_from_location_id_fkey(name, location_type),
    to_location:inventory_locations!delivery_legs_to_location_id_fkey(name, location_type),
    driver:drivers(full_name),
    vehicle:vehicles(vehicle_type, vehicle_code),
    delivery_leg_items(quantity, unit, received_quantity, stock_item:stock_items(item_code, name)),
    proof_of_delivery(id, receiver_name, delivered_at, receiver_signature_url)
  )
`;

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = new URL(request.url).searchParams.get('status');
  const supabase = await createClient();

  let query = supabase
    .from('delivery_orders')
    .select(ORDER_SELECT)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'create_delivery_order', {
    p_origin_location_id: body.origin_location_id,
    p_final_destination_id: body.final_destination_id,
    p_legs: body.legs,
    p_primary_driver_id: body.primary_driver_id ?? null,
    p_primary_vehicle_id: body.primary_vehicle_id ?? null,
    p_scheduled_date: body.scheduled_date ?? null,
    p_notes: body.notes ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
