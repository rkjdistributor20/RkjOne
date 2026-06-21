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

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'confirm_route_stop_delivery', {
    p_stop_id: id,
    p_receiver_name: body.receiver_name ?? null,
    p_driver_notes: body.driver_notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
