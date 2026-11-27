import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { isTransferUuid, parseTransferCreate, transferRpcError } from '@/lib/inventory/transfer-http';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const search = new URL(request.url).searchParams;
 const locationId = search.get('location_id');
 const options = search.get('options');
 if ((locationId !== null && !isTransferUuid(locationId)) ||
  (options !== null && (options !== 'kiosk' || locationId !== null))) {
  return NextResponse.json({ error: 'Penapis pindahan tidak sah' }, { status: 400 });
 }
 const supabase = await createClient();

 const { data, error } = options === 'kiosk'
  ? await inventoryRpc(supabase, 'stock_transfer_kiosk_options', {})
  : await inventoryRpc(supabase, 'list_stock_transfers', { p_location_id: locationId });
 if (error) return transferRpcError(error);
 return NextResponse.json(options === 'kiosk' ? data : { transfers: data ?? [] }, {
  headers: { 'Cache-Control': 'private, no-store' },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const requestId = request.headers.get('Idempotency-Key');
 if (!isTransferUuid(requestId)) {
  return NextResponse.json({ error: 'Idempotency-Key UUID diperlukan' }, { status: 400 });
 }
 const body = parseTransferCreate(await request.json().catch(() => null));
 if (!body) return NextResponse.json({ error: 'Butiran pindahan tidak sah' }, { status: 400 });
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'create_stock_transfer', {
 p_from_location_id: body.from_location_id,
 p_to_location_id: body.to_location_id,
 p_items: body.items,
 p_request_id: requestId,
 p_driver_id: body.driver_id ?? null,
 p_vehicle_id: body.vehicle_id ?? null,
 p_notes: body.notes ?? null,
 });

 if (error) return transferRpcError(error);
 return NextResponse.json({ result: data });
}
