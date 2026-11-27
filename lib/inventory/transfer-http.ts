import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import type { TransferCreateInput } from '@/lib/inventory/types';

export function isTransferUuid(value: unknown): value is string {
 return typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTransferCreate(body: unknown): TransferCreateInput | null {
 if (!isObject(body)) return null;
 const { from_location_id, to_location_id, items, notes, driver_id, vehicle_id } = body;
 if (!isTransferUuid(from_location_id) || !isTransferUuid(to_location_id) ||
  from_location_id.toLowerCase() === to_location_id.toLowerCase() ||
  !Array.isArray(items) || items.length < 1 || items.length > 100 ||
  (notes != null && (typeof notes !== 'string' || notes.length > 2000)) ||
  (driver_id != null && !isTransferUuid(driver_id)) || (vehicle_id != null && !isTransferUuid(vehicle_id))) return null;

 const lines: TransferCreateInput['items'] = [];
 for (const item of items) {
  if (!isObject(item) || !isTransferUuid(item.stock_item_id) ||
   typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) ||
   item.quantity <= 0 || item.quantity >= 10_000_000_000 ||
   (item.unit != null && (typeof item.unit !== 'string' || item.unit.length > 8)) ||
   (item.production_date != null && (typeof item.production_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.production_date)))) return null;
  lines.push({
   stock_item_id: item.stock_item_id.toLowerCase(),
   quantity: item.quantity,
   unit: item.unit ?? undefined,
   production_date: item.production_date ?? undefined,
  });
 }
 return { from_location_id, to_location_id, items: lines, notes: notes ?? undefined, driver_id: driver_id ?? undefined, vehicle_id: vehicle_id ?? undefined };
}

export function transferRpcError(error: { code: string; message: string }) {
 const status = error.code === '42501' ? 403
  : ['PT409', '23505', '40001', '40P01'].includes(error.code) ? 409
   : ['22023', 'P0001'].includes(error.code) || error.code.startsWith('22') ? 400 : 500;
 const message = error.code === 'PT409' || error.code === '22023' || error.code === 'P0001'
  ? error.message
  : status === 403 ? 'Akses pindahan ditolak'
   : error.code === '23505' ? 'Kunci permintaan sudah digunakan atau nombor pindahan bertindih'
    : status === 409 ? 'Pindahan sedang dikemas kini. Sila cuba semula.'
     : status === 400 ? 'Butiran pindahan tidak sah' : 'Gagal memproses pindahan';
 return NextResponse.json({ error: message }, { status });
}

type TransferAction = 'dispatch_stock_transfer' | 'complete_stock_transfer' | 'cancel_stock_transfer';

export function transferAction(action: TransferAction) {
 return async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentProfile()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!isTransferUuid(id)) return NextResponse.json({ error: 'ID pindahan tidak sah' }, { status: 400 });
  const args: Record<string, unknown> = { p_transfer_id: id };
  if (action === 'cancel_stock_transfer') {
   const body: unknown = await request.json().catch(() => null);
   const reason = isObject(body) && typeof body.reason === 'string' ? body.reason.trim() : '';
   if (!reason || reason.length > 500) {
    return NextResponse.json({ error: 'Sebab pembatalan (1 hingga 500 aksara) diperlukan' }, { status: 400 });
   }
   args.p_reason = reason;
  }
  const { data, error } = await inventoryRpc(await createClient(), action, args);
  if (error) return transferRpcError(error);
  return NextResponse.json({ result: data });
 };
}
