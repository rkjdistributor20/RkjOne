import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_balances')
    .select(`
      quantity, unit,
      location:inventory_locations(name),
      stock_item:stock_items(item_code, name, min_threshold, critical_threshold)
    `)
    .eq('organization_id', profile.organization_id)
    .order('quantity');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = ((data ?? []) as unknown as Array<{
    quantity: number;
    unit: string;
    location: { name: string };
    stock_item: {
      item_code: string;
      name: string;
      min_threshold: number | null;
      critical_threshold: number | null;
    };
  }>)
    .map((b) => {
      const q = Number(b.quantity);
      const si = b.stock_item;
      let status: 'OK' | 'LOW' | 'CRITICAL' = 'OK';
      if (si.critical_threshold != null && q <= si.critical_threshold) status = 'CRITICAL';
      else if (si.min_threshold != null && q <= si.min_threshold) status = 'LOW';
      return {
        item_code: si.item_code,
        name: si.name,
        location_name: b.location.name,
        quantity: q,
        unit: b.unit,
        status,
      };
    })
    .filter((i) => i.status !== 'OK')
    .sort((a, b) => (a.status === 'CRITICAL' ? -1 : 1));

  return NextResponse.json({ items });
}
