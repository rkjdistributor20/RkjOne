import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
  const from =
    url.searchParams.get('from') ??
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const supabase = await createClient();

  const base = supabase
    .from('delivery_orders')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  const [{ count: total }, { count: pending }, { count: inTransit }, { count: delivered }] =
    await Promise.all([
      base,
      supabase.from('delivery_orders').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'PENDING'),
      supabase.from('delivery_orders').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'IN_TRANSIT'),
      supabase.from('delivery_orders').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('status', 'DELIVERED').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
    ]);

  return NextResponse.json({
    fleet: {
      total_orders: total ?? 0,
      pending: pending ?? 0,
      in_transit: inTransit ?? 0,
      delivered: delivered ?? 0,
    },
  });
}
