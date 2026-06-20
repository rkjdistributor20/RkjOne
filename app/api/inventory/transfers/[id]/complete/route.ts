import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'complete_stock_transfer', {
    p_transfer_id: id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
