import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const { id: orderId } = await params;
  let currentLat: number | null = null;
  let currentLng: number | null = null;

  try {
    const body = await request.json();
    if (body?.current_lat != null) currentLat = Number(body.current_lat);
    if (body?.current_lng != null) currentLng = Number(body.current_lng);
  } catch {
    // body optional
  }

  const supabase = await createClient();
  const { data, error } = await inventoryRpc(supabase, 'optimize_delivery_order_route', {
    p_order_id: orderId,
    p_current_lat: currentLat,
    p_current_lng: currentLng,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
