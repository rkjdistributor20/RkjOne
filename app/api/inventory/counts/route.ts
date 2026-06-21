import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  assertStockMutationAllowed,
  stockGuardErrorMessage,
} from '@/lib/inventory/stock-guard';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = await createClient();

  try {
    await assertStockMutationAllowed(
      supabase,
      profile,
      'count',
      body.location_id
    );
  } catch (err) {
    return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
  }

  const { data, error } = await inventoryRpc(supabase, 'submit_stock_count', {
    p_location_id: body.location_id,
    p_items: body.items,
    p_notes: body.notes ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
