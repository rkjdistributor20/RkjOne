import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  daysUntilExpiry,
  isRotiBatchExpired,
  isRotiBatchExpiringSoon,
  ROTI_SHELF_LIFE_DAYS,
  type RotiBatchAtLocation,
} from '@/lib/stock/expiry';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const locationId = new URL(request.url).searchParams.get('location_id');
  if (!locationId) {
    return NextResponse.json({ error: 'location_id required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('stock_batches')
    .select(`
      id,
      stock_item_id,
      quantity_remaining,
      unit,
      production_date,
      expires_on,
      status,
      stock_item:stock_items(item_code, name, category)
    `)
    .eq('location_id', locationId)
    .in('status', ['ACTIVE', 'EXPIRED'])
    .gt('quantity_remaining', 0)
    .order('production_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    stock_item_id: string;
    quantity_remaining: number;
    unit: string;
    production_date: string;
    expires_on: string;
    status: string;
    stock_item: { item_code: string; name: string; category: string | null } | null;
  };

  const batches: RotiBatchAtLocation[] = ((data ?? []) as unknown as Row[])
    .filter((row) => row.stock_item?.category === 'Roti')
    .map((row) => {
      const days = daysUntilExpiry(row.expires_on);
      const expired = row.status === 'EXPIRED' || isRotiBatchExpired(row.expires_on);
      return {
        batch_id: row.id,
        stock_item_id: row.stock_item_id,
        item_code: row.stock_item!.item_code,
        item_name: row.stock_item!.name,
        quantity_remaining: Number(row.quantity_remaining),
        unit: row.unit,
        production_date: row.production_date,
        expires_on: row.expires_on,
        days_until_expiry: days,
        expired,
        expiring_soon: !expired && isRotiBatchExpiringSoon(row.expires_on),
      };
    });

  return NextResponse.json({
    batches,
    shelf_life_days: ROTI_SHELF_LIFE_DAYS,
  });
}
