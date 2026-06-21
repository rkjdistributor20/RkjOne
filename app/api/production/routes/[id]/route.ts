import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSubmitHqFactoryOrder } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  if (!canSubmitHqFactoryOrder(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'update_delivery_route_plan', {
    p_plan_id: id,
    p_driver_id: body.driver_id ?? null,
    p_vehicle_id: body.vehicle_id ?? null,
    p_stop_order: body.stop_order ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
