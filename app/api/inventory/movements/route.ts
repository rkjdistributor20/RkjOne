import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertAmStockKiosk, isStockRecordId, stockGuardErrorMessage } from '@/lib/inventory/stock-guard';
import type { Enums } from '@/types/database';

const FILTERS = {
 in: ['RECEIVE', 'TRANSFER_IN'],
 out: ['SALE_DEDUCT', 'WRITE_OFF', 'TRANSFER_OUT'],
 adjustment: ['ADJUSTMENT', 'COUNT'],
 transfer: ['TRANSFER_IN', 'TRANSFER_OUT'],
} satisfies Record<string, Enums<'movement_type'>[]>;

function mytDayStart(value: string | null) {
 if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const day = new Date(`${value}T00:00:00.000Z`);
 return Number.isFinite(day.getTime()) && day.toISOString().startsWith(value)
 ? day.getTime() - 8 * 60 * 60 * 1000 : null;
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { searchParams } = new URL(request.url);
 const locationId = searchParams.get('location_id');
 const limit = Number(searchParams.get('limit') ?? 50);
 const kind = searchParams.get('kind');
 const from = mytDayStart(searchParams.get('from'));
 const to = mytDayStart(searchParams.get('to'));

 if (!isStockRecordId(locationId)) {
 return NextResponse.json({ error: 'location_id required' }, { status: 400 });
 }
 if (!Number.isInteger(limit) || limit < 1 || limit > 1000 ||
 (kind && !Object.hasOwn(FILTERS, kind)) ||
 (searchParams.has('from') && from === null) || (searchParams.has('to') && to === null) ||
 (from !== null && to !== null && from > to)) {
 return NextResponse.json({ error: 'Penapis pergerakan stok tidak sah' }, { status: 400 });
 }

 const supabase = await createClient();
 if (profile.role === 'AREA_MANAGER') {
 try {
 await assertAmStockKiosk(supabase, profile, locationId);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }
 }
 let query = supabase.from('stock_movements').select(`
 id, movement_type, quantity, unit, balance_before, balance_after,
 reference_type, reference_id, notes, created_at,
 stock_item:stock_items(item_code, name),
 created_by_profile:profiles!stock_movements_created_by_fkey(full_name)
 `).eq('organization_id', profile.organization_id).eq('location_id', locationId)
 .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
 if (kind) query = query.in('movement_type', FILTERS[kind as keyof typeof FILTERS]);
 if (from !== null) query = query.gte('created_at', new Date(from).toISOString());
 if (to !== null) query = query.lt('created_at', new Date(to + 86_400_000).toISOString());
 const { data, error } = await query;

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 return NextResponse.json({ movements: data ?? [] });
}
