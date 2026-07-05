import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const RAW_MATERIAL_CATEGORY = 'Bahan Mentah Kilang';

function statusFor(
 quantity: number,
 item?: { min_threshold?: number | null; critical_threshold?: number | null }) {
 if (item?.critical_threshold != null && quantity <= Number(item.critical_threshold)) {
 return 'CRITICAL';
 }
 if (item?.min_threshold != null && quantity <= Number(item.min_threshold)) {
 return 'LOW';
 }
 return 'OK';
}

function dateDaysAgo(days: number) {
 const d = new Date();
 d.setDate(d.getDate() - days);
 return d.toISOString().slice(0, 10);
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const db = supabase as any;

 const { data: location, error: locError } = await db.from('inventory_locations').select('id, name, location_type').eq('organization_id', profile.organization_id).eq('location_type', 'FACTORY').eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();

 if (locError) return NextResponse.json({ error: locError.message }, { status: 500 });

 const { data: items, error: itemError } = await db.from('stock_items').select(
 'id, item_code, name, category, base_unit, storage_unit, conversion_text, min_threshold, critical_threshold').eq('organization_id', profile.organization_id).eq('category', RAW_MATERIAL_CATEGORY).eq('status', 'ACTIVE').order('name');

 if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

 const itemIds = (items ?? []).map((item: { id: string }) => item.id);
 let balances: any[] = [];

 if (location && itemIds.length > 0) {
 const { data, error } = await db.from('inventory_balances').select('id, location_id, stock_item_id, quantity, unit, last_movement_at, updated_at').eq('location_id', location.id).in('stock_item_id', itemIds);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 balances = data ?? [];
 }

 const balanceByItem = new Map(balances.map((b) => [b.stock_item_id, b]));
 type RawBalanceRow = {
 id: string | null;
 location_id: string | null;
 stock_item_id: string;
 quantity: number;
 unit: string;
 last_movement_at: string | null;
 updated_at: string | null;
 stock_item: any;
 status: 'OK' | 'LOW' | 'CRITICAL';
 };

 const balanceRows: RawBalanceRow[] = (items ?? []).map((item: any) => {
 const balance = balanceByItem.get(item.id);
 const quantity = Number(balance?.quantity ?? 0);
 return {
 id: balance?.id ?? null,
 location_id: location?.id ?? null,
 stock_item_id: item.id,
 quantity,
 unit: balance?.unit ?? item.base_unit,
 last_movement_at: balance?.last_movement_at ?? null,
 updated_at: balance?.updated_at ?? null,
 stock_item: item,
 status: statusFor(quantity, item),
 };
 });

 const { data: cards, error: cardError } = await db.from('factory_raw_material_stock_cards').select(
 `
 id, stock_date, production_date, stock_in_qty, stock_out_qty, balance_qty,
 unit_label, measurement_note, source_month, source_ref, notes, created_at,
 stock_item:stock_items(id, item_code, name, category, base_unit, storage_unit, conversion_text),
 recorded_by_profile:profiles!factory_raw_material_stock_cards_recorded_by_fkey(full_name)
 `).eq('organization_id', profile.organization_id).order('stock_date', { ascending: false }).order('created_at', { ascending: false }).limit(80);

 if (cardError) return NextResponse.json({ error: cardError.message }, { status: 500 });

 const recentFrom = dateDaysAgo(14);
 const { data: recent, error: recentError } = await db.from('factory_raw_material_stock_cards').select('stock_out_qty, stock_date').eq('organization_id', profile.organization_id).gte('stock_date', recentFrom);

 if (recentError) return NextResponse.json({ error: recentError.message }, { status: 500 });

 const totalUsage14Days = (recent ?? []).reduce(
 (sum: number, row: { stock_out_qty: number | string }) => sum + Number(row.stock_out_qty ?? 0),
 0);
 const latestDate = (cards ?? [])[0]?.stock_date ?? null;

 return NextResponse.json({
 location,
 balances: balanceRows,
 cards: cards ?? [],
 summary: {
 total_items: balanceRows.length,
 ok_count: balanceRows.filter((b) => b.status === 'OK').length,
 low_count: balanceRows.filter((b) => b.status === 'LOW').length,
 critical_count: balanceRows.filter((b) => b.status === 'CRITICAL').length,
 total_usage_14_days: totalUsage14Days,
 latest_stock_card_date: latestDate,
 },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY'].includes(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses rekod bahan mentah kilang' }, { status: 403 });
 }

 const body = await request.json();
 const supabase = await createClient();
 const { data, error } = await (supabase as any).rpc('record_factory_raw_material_usage', {
 p_production_date: body.production_date,
 p_items: body.items ?? [],
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ result: data });
}
