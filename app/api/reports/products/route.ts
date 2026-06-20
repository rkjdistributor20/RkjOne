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
  const limit = Number(url.searchParams.get('limit') ?? 15);

  const supabase = await createClient();

  const { data: txs } = await supabase
    .from('pos_transactions')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'COMPLETED')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  const txIds = ((txs ?? []) as { id: string }[]).map((t) => t.id);
  if (txIds.length === 0) return NextResponse.json({ products: [] });

  const { data: items, error } = await supabase
    .from('pos_transaction_items')
    .select('product_name, sku, quantity, line_total')
    .in('transaction_id', txIds.slice(0, 500));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byProduct = new Map<string, { product_name: string; sku: string; quantity_sold: number; revenue: number }>();

  for (const item of (items ?? []) as Array<{
    product_name: string;
    sku: string;
    quantity: number;
    line_total: number;
  }>) {
    const key = item.sku;
    const cur = byProduct.get(key) ?? {
      product_name: item.product_name,
      sku: item.sku,
      quantity_sold: 0,
      revenue: 0,
    };
    cur.quantity_sold += Number(item.quantity);
    cur.revenue += Number(item.line_total);
    byProduct.set(key, cur);
  }

  const products = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  return NextResponse.json({ products });
}
