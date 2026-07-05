import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { HQ_STOCK_ITEM_CODES } from '@/lib/stock/catalog';
import type { StockItemOption } from '@/lib/inventory/types';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const hqOnly = new URL(request.url).searchParams.get('hq') === '1';

 const supabase = await createClient();
 let query = supabase.from('stock_items').select(
 'id, item_code, name, category, base_unit, min_threshold, critical_threshold, pack_quantity, pack_unit, conversion_text').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('name');

 if (hqOnly) {
 query = query.in('item_code', [...HQ_STOCK_ITEM_CODES]);
 }

 const { data, error } = await query;

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 return NextResponse.json({ items: (data ?? []) as StockItemOption[] });
}
