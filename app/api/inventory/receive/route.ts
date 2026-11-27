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
 if (!isStockRecordId(body?.location_id) || !Array.isArray(body.items) || body.items.length === 0) {
 return NextResponse.json({ error: 'Lokasi dan item stok diperlukan' }, { status: 400 });
 }
 const supabase = await createClient();

 if (profile.role === 'AREA_MANAGER') {
 try {
 await assertAmStockKiosk(supabase, profile, body.location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }
 if (typeof body.source !== 'string' || !body.source.trim() ||
 (body.document_reference != null && typeof body.document_reference !== 'string') ||
 (body.notes != null && typeof body.notes !== 'string')) {
 return NextResponse.json({ error: 'Nyatakan sumber luar dan dokumen rujukan yang sah' }, { status: 400 });
 }
 const { data, error } = await inventoryRpc(supabase, 'post_am_stock_receipt', {
 p_location_id: body.location_id,
 p_items: body.items,
 p_source: body.source,
 p_document_reference: body.document_reference ?? null,
 p_notes: body.notes ?? null,
 });
 if (error) {
 const message = error.code === '23505' && error.message.includes('stock_receives_manual_document_once')
 ? 'Dokumen sumber ini sudah digunakan untuk penerimaan di kiosk ini.' : error.message;
 return NextResponse.json({ error: message }, { status: stockPostingErrorStatus(error.code) });
 }
 return NextResponse.json({ result: data });
 }

 try {
 await assertStockMutationAllowed(
 supabase,
 profile,
 'receive',
 body.location_id);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'receive_stock', {
 p_location_id: body.location_id,
 p_items: body.items,
 p_source: body.source ?? 'FACTORY',
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
