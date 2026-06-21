import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;

  const supabase = await createClient();
  const { data, error } = await inventoryRpc(supabase, 'get_driver_work_schedule', {
    p_from: from ?? new Date().toISOString().slice(0, 10),
    p_to: to ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ schedule: data ?? [] });
}
