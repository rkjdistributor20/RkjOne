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

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!isStockRecordId(body?.location_id) || !Array.isArray(body.items) || body.items.length === 0 ||
 typeof body.reason !== 'string' || !body.reason.trim()) {
 return NextResponse.json({ error: 'Lokasi, item stok dan sebab pelarasan diperlukan' }, { status: 400 });
 }
 const supabase = await createClient();

 if (profile.role === 'AREA_MANAGER') {
 try {
 await assertAmStockKiosk(supabase, profile, body.location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }
 const { data, error } = await inventoryRpc(supabase, 'post_am_stock_adjustment', {
 p_location_id: body.location_id,
 p_reason: body.reason,
 p_items: body.items,
 });
 if (error) return NextResponse.json({ error: error.message }, { status: stockPostingErrorStatus(error.code) });
 return NextResponse.json({ result: data });
 }

 try {
 await assertStockMutationAllowed(
 supabase,
 profile,
 'adjustment',
 body.location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'submit_stock_adjustment', {
 p_location_id: body.location_id,
 p_reason: body.reason,
 p_items: body.items,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
