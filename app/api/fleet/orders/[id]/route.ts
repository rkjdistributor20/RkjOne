import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('delivery_orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ order: data });
}
