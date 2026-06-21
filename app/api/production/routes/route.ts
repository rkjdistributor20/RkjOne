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

  let query = supabase
    .from('hq_delivery_route_plans' as 'products')
    .select(
      `
      id, route_name, region_code, production_date, status,
      driver:drivers(full_name),
      vehicle:vehicles(vehicle_code, vehicle_type),
      stops:hq_delivery_route_stops(
        stop_sequence,
        branch:branches(branch_code, branch_name)
      )
    `
    )
    .eq('organization_id', profile.organization_id)
    .neq('status', 'CANCELLED')
    .order('production_date', { ascending: false })
    .limit(20);

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
    { p_order_id: body.order_id }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
