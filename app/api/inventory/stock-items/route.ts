import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import type { StockItemOption } from '@/lib/inventory/types';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, item_code, name, category, base_unit, min_threshold, critical_threshold')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: (data ?? []) as StockItemOption[] });
}
