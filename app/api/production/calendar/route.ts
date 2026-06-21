import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const to =
    searchParams.get('to') ??
    new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data, error } = await inventoryRpc(supabase, 'get_published_production_dates', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dates = Array.isArray(data) ? data : [];
  return NextResponse.json({ dates });
}
