import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isHqStockItemCode } from '@/lib/stock/catalog';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();

  const { data: hqLoc } = await supabase
    .from('inventory_locations')
    .select('id, name')
    .eq('organization_id', profile.organization_id)
    .eq('location_type', 'HQ_WAREHOUSE')
    .limit(1)
    .maybeSingle();

  const hq = hqLoc as { id: string; name: string } | null;

  let totalItems = 0;
  let totalQty = 0;
  let lowStock = 0;

  if (hq) {
    const { data: balances } = await supabase
      .from('inventory_balances')
      .select(`
        quantity,
        stock_item:stock_items(item_code, min_threshold, critical_threshold)
      `)
      .eq('location_id', hq.id);

    const rows = ((balances ?? []) as unknown as Array<{
      quantity: number;
      stock_item: {
        item_code: string;
        min_threshold: number | null;
        critical_threshold: number | null;
      };
    }>).filter((r) => isHqStockItemCode(r.stock_item?.item_code ?? ''));

    totalItems = rows.length;
    totalQty = rows.reduce((s, r) => s + Number(r.quantity), 0);
    lowStock = rows.filter((r) => {
      const q = Number(r.quantity);
      const si = r.stock_item;
      return (
        (si.critical_threshold != null && q <= si.critical_threshold) ||
        (si.min_threshold != null && q <= si.min_threshold)
      );
    }).length;
  }

  const { count: pendingTransfers } = await supabase
    .from('stock_transfers')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .in('status', ['PENDING', 'IN_TRANSIT']);

  const { count: pendingDeliveries } = await supabase
    .from('delivery_orders')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .in('status', ['PENDING', 'IN_TRANSIT']);

  return NextResponse.json({
    summary: {
      location: hq,
      total_items: totalItems,
      total_quantity: totalQty,
      low_stock_count: lowStock,
      pending_transfers: pendingTransfers ?? 0,
      pending_deliveries: pendingDeliveries ?? 0,
    },
  });
}
