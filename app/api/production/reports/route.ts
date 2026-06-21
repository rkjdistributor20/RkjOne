import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const orderId = new URL(request.url).searchParams.get('order_id');
  if (!orderId) {
    return NextResponse.json({ error: 'order_id diperlukan' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await inventoryRpc(supabase, 'get_factory_order_report', {
    p_order_id: orderId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ report: data });
}
