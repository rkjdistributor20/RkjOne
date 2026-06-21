import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSubmitHqFactoryOrder } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  if (!canSubmitHqFactoryOrder(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'complete_route_handoff', {
    p_primary_plan_id: body.primary_plan_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
