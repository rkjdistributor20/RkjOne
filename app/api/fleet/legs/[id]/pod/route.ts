import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'submit_proof_of_delivery', {
    p_leg_id: id,
    p_receiver_name: body.receiver_name,
    p_receiver_signature_url: body.receiver_signature_url ?? null,
    p_gps_latitude: body.gps_latitude ?? null,
    p_gps_longitude: body.gps_longitude ?? null,
    p_driver_notes: body.driver_notes ?? null,
    p_image_urls: body.image_urls ?? [],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
