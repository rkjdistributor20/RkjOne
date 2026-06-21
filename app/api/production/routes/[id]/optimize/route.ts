import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSubmitHqFactoryOrder } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  if (!canSubmitHqFactoryOrder(profile.role)) {
    return NextResponse.json({ error: 'Hanya HQ boleh susun semula laluan' }, { status: 403 });
  }

  const { id: planId } = await params;
  const supabase = await createClient();
  const { data, error } = await inventoryRpc(supabase, 'optimize_delivery_route_stops', {
    p_plan_id: planId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
