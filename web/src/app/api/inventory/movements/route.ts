import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('location_id');
  const limit = Number(searchParams.get('limit') ?? 50);

  if (!locationId) {
    return NextResponse.json({ error: 'location_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_movements')
    .select(`
      id, movement_type, quantity, unit, balance_before, balance_after,
      reference_type, notes, created_at,
      stock_item:stock_items(item_code, name),
      created_by_profile:profiles!stock_movements_created_by_fkey(full_name)
    `)
    .eq('location_id', locationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ movements: data ?? [] });
}
