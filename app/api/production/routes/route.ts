import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSubmitHqFactoryOrder } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const orderId = new URL(request.url).searchParams.get('order_id');
 const supabase = await createClient();

 let query = supabase.from('hq_delivery_route_plans' as 'products').select(
 `
 id, route_name, region_code, production_date, status, route_pattern,
 handoff_completed_at, depends_on_plan_id, instruction_code, instruction_part,
 ai_route_summary, ai_optimized_at,
 driver:drivers(id, full_name, driver_code),
 vehicle:vehicles(vehicle_code, vehicle_type),
 stops:hq_delivery_route_stops(
 id, stop_sequence, is_handoff, notes,
 handoff_driver:drivers!hq_delivery_route_stops_handoff_driver_id_fkey(full_name),
 branch:branches(branch_code, branch_name),
 items:hq_delivery_route_stop_items(
 id, stock_item_id, quantity, planned_quantity, adjusted_quantity, adjustment_reason,
 stock_item:stock_items(item_code, name)))
 `).eq('organization_id', profile.organization_id).neq('status', 'CANCELLED').order('production_date', { ascending: false }).limit(30);

 if (orderId) {
 query = query.eq('factory_order_id', orderId);
 }

 const { data, error } = await query;
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 return NextResponse.json({ routes: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (!canSubmitHqFactoryOrder(profile.role)) {
 return NextResponse.json({ error: 'Hanya HQ boleh susun laluan' }, { status: 403 });
 }

 const body = await request.json();
 if (!body.order_id) {
 return NextResponse.json({ error: 'order_id diperlukan' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data, error } = await inventoryRpc(
 supabase,
 'create_delivery_routes_for_factory_order',
 { p_order_id: body.order_id, p_replace: body.replace ?? false });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const { data: processed, error: postErr } = await inventoryRpc(
 supabase,
 'post_process_driver_instructions',
 { p_order_id: body.order_id, p_max_stops: 20 });

 if (postErr) {
 return NextResponse.json({ error: postErr.message }, { status: 400 });
 }

 return NextResponse.json({ result: data, post_process: processed });
}
