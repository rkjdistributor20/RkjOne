import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertAmStockKiosk,
 assertStockMutationAllowed,
 isStockRecordId,
 stockGuardErrorMessage,
 stockPostingErrorStatus,
} from '@/lib/inventory/stock-guard';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const locationId = new URL(request.url).searchParams.get('location_id');
 if (!isStockRecordId(locationId)) return NextResponse.json({ error: 'location_id required' }, { status: 400 });
 const supabase = await createClient();
 try {
 await assertAmStockKiosk(supabase, profile, locationId);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await supabase.from('stock_counts').select(`
 id, count_number, notes, created_at,
 counter:profiles!stock_counts_counted_by_fkey(full_name),
 items:stock_count_items(stock_item_id, system_quantity, counted_quantity, unit, production_date,
 stock_item:stock_items(name))
 `).eq('organization_id', profile.organization_id).eq('location_id', locationId).eq('status', 'PENDING')
 .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ counts: data ?? [] });
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (profile.role !== 'AREA_MANAGER') return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 const body = await request.json().catch(() => null);
 if (!isStockRecordId(body?.count_id) || !['APPROVE', 'REJECT'].includes(body.action)) {
 return NextResponse.json({ error: 'Kiraan dan keputusan yang sah diperlukan' }, { status: 400 });
 }
 const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
 if (body.action === 'REJECT' && (!reason || reason.length > 1000)) {
 return NextResponse.json({ error: 'Sebab penolakan diperlukan (maksimum 1000 aksara)' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data: count, error: lookupError } = await supabase.from('stock_counts').select('location_id')
 .eq('id', body.count_id).eq('organization_id', profile.organization_id).maybeSingle();
 if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
 if (!count) return NextResponse.json({ error: 'Kiraan stok di luar skop anda' }, { status: 403 });
 try {
 await assertAmStockKiosk(supabase, profile, count.location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'review_stock_count', {
 p_count_id: body.count_id,
 p_action: body.action,
 p_reason: body.action === 'REJECT' ? reason : null,
 });
 if (error) return NextResponse.json({ error: error.message }, { status: stockPostingErrorStatus(error.code) });
 return NextResponse.json({ result: data });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 try {
 await assertStockMutationAllowed(
 supabase,
 profile,
 'count',
 body.location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'submit_stock_count', {
 p_location_id: body.location_id,
 p_items: body.items,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
