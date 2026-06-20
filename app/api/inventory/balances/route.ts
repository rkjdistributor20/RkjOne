import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const locationId = new URL(request.url).searchParams.get('location_id');
  if (!locationId) {
    return NextResponse.json({ error: 'location_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_balances')
    .select(`
      id, location_id, stock_item_id, quantity, unit,
      stock_item:stock_items(id, item_code, name, category, base_unit, min_threshold, critical_threshold)
    `)
    .eq('location_id', locationId)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    location_id: string;
    stock_item_id: string;
    quantity: number;
    unit: string;
    stock_item: {
      min_threshold: number | null;
      critical_threshold: number | null;
      id: string;
      item_code: string;
      name: string;
      category: string | null;
      base_unit: string;
    };
  };

  const balances = ((data ?? []) as unknown as Row[]).map((row) => {
    const item = row.stock_item;
    const qty = Number(row.quantity);
    let status: 'OK' | 'LOW' | 'CRITICAL' = 'OK';
    if (item?.critical_threshold != null && qty <= item.critical_threshold) {
      status = 'CRITICAL';
    } else if (item?.min_threshold != null && qty <= item.min_threshold) {
      status = 'LOW';
    }
    return { ...row, status };
  });

  return NextResponse.json({ balances });
}
