import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertStockMutationAllowed,
 stockGuardErrorMessage,
} from '@/lib/inventory/stock-guard';
import { canUsePosRejectStock } from '@/lib/auth/stock-access';

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 if (!canUsePosRejectStock(profile.role)) {
 return NextResponse.json(
 {
 error:
 'Reject stok POS hanya dibenarkan untuk staf cawangan dan pengurusan operasi yang diberi akses.',
 },
 { status: 403 });
 }

 const body = await request.json();
 const branchId = body.branch_id as string | undefined;
 const reason = (body.reason as string | undefined)?.trim();
 const items = body.items as
 | Array<{ stock_item_id: string; quantity: number; unit?: string; production_date?: string; note?: string }>
 | undefined;

 if (!branchId || !reason || !items?.length) {
 return NextResponse.json(
 { error: 'branch_id, reason, dan items diperlukan' },
 { status: 400 });
 }

 if (profile.branch_id && profile.branch_id !== branchId) {
 return NextResponse.json(
 { error: 'Reject stok hanya dibenarkan di cawangan anda' },
 { status: 403 });
 }

 const supabase = await createClient();

 const { data: location } = await supabase.from('inventory_locations').select('id').eq('branch_id', branchId).eq('location_type', 'BRANCH_KIOSK').limit(1).maybeSingle();

 const locationId = (location as { id: string } | null)?.id;
 if (!locationId) {
 return NextResponse.json(
 { error: 'Lokasi kiosk cawangan tidak dijumpai' },
 { status: 404 });
 }

 try {
 await assertStockMutationAllowed(
 supabase,
 profile,
 'write_off',
 locationId);
 } catch (err) {
 return NextResponse.json({ error: stockGuardErrorMessage(err) }, { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'submit_stock_write_off', {
 p_location_id: locationId,
 p_reason: `[POS Reject] ${reason}`,
 p_items: items,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
