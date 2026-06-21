import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSetRotiProductionDate } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const status = new URL(request.url).searchParams.get('status');
  const supabase = await createClient();

  let query = supabase
    .from('hq_factory_orders' as 'products')
    .select(
      `
      id, order_number, production_date, status, notes, created_at, acknowledged_at, created_by,
      hq_factory_order_items(
        id, quantity, unit,
        stock_item:stock_items(item_code, name, category)
      )
    `
    )
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  if (!canSetRotiProductionDate(profile.role)) {
    return NextResponse.json(
      { error: 'Hanya pembuat order HQ boleh hantar order ke kilang' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'create_hq_factory_order', {
    p_production_date: body.production_date,
    p_items: body.items,
    p_notes: body.notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
