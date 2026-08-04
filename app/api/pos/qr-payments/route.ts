import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import {
 assertActivePosShiftMember,
 assertAreaManagerScheduledForPos,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { createFiuuDynamicQr, getFiuuOpaConfig, getPosQrPaymentMode } from '@/lib/pos/fiuu';
import type { CreateSalePayload } from '@/lib/pos/types';
import type { Json } from '@/types/database';

function isSalePayload(value: unknown): value is CreateSalePayload {
 if (!value || typeof value !== 'object') return false;
 const body = value as Partial<CreateSalePayload>;
 return typeof body.shiftId === 'string'
  && typeof body.branchId === 'string'
  && Array.isArray(body.items)
  && body.items.length > 0
  && (body.payment_method === 'QR' || body.payment_method === 'MIXED')
  && typeof body.cash_amount === 'number'
  && typeof body.qr_amount === 'number';
}

function errorMessage(error: unknown) {
 return error instanceof Error ? error.message : 'Fiuu tidak dapat menjana QR';
}

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'pos-qr-payment-create',
 limit: 60,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 if (getPosQrPaymentMode() !== 'fiuu') {
  return NextResponse.json(
   {
    error: 'POS QR online belum diaktifkan. Gunakan bayaran QR manual di POS dan sahkan di dashboard Kewangan.',
    mode: 'MANUAL_QR_ONLY',
   },
   { status: 409 });
 }

 const rawBody: unknown = await request.json().catch(() => null);
 if (!isSalePayload(rawBody)) {
  return NextResponse.json({ error: 'Payload jualan QR tidak sah' }, { status: 400 });
 }
 const body = rawBody;
 if (!Number.isFinite(body.qr_amount) || body.qr_amount <= 0
  || !Number.isFinite(body.cash_amount) || body.cash_amount < 0) {
  return NextResponse.json({ error: 'Amaun bayaran QR tidak sah' }, { status: 400 });
 }

 const supabase = await createClient();
 let device;
 try {
  await assertCanAccessPosBranch(supabase, profile, body.branchId);
  await assertAreaManagerScheduledForPos(supabase, profile, body.branchId);
  device = await assertOfficialPosDevice(profile, body.branchId);
  await assertActivePosShiftMember(supabase, profile, body.shiftId, body.branchId);
 } catch (error) {
  return NextResponse.json(
   { error: errorMessage(error) },
   { status: posAccessErrorStatus(error) });
 }

 const { data: sopStatus, error: sopError } = await inventoryRpc(supabase, 'pos_sop_status', {
  p_branch_id: body.branchId,
 });
 if (sopError) return NextResponse.json({ error: sopError.message }, { status: 400 });
 const status = sopStatus as {
  delivery_pending_count?: number;
  required_stock_check?: 'OPENING' | 'MID_SHIFT' | 'CLOSE_SHIFT' | null;
  active_leave?: { reason?: string } | null;
 } | null;
 if (profile.role !== 'SUPER_ADMIN' && (
  status?.active_leave
  || Number(status?.delivery_pending_count ?? 0) > 0
  || status?.required_stock_check === 'OPENING'
 )) {
  return NextResponse.json(
   { error: 'Selesaikan SOP stok, penerimaan dan kehadiran POS sebelum menjana QR.' },
   { status: 400 });
 }

 const normalizedItems = body.items.map((item) => ({
  product_id: item.product_id,
  quantity: Number(item.quantity),
 }));
 if (normalizedItems.some((item) => !item.product_id
  || !Number.isInteger(item.quantity)
  || item.quantity <= 0
  || item.quantity > 1000)) {
  return NextResponse.json({ error: 'Kuantiti produk tidak sah' }, { status: 400 });
 }

 const productIds = [...new Set(normalizedItems.map((item) => item.product_id))];
 const { data: products, error: productError } = await supabase
  .from('products')
  .select('id, price')
  .eq('organization_id', profile.organization_id)
  .eq('status', 'ACTIVE')
  .in('id', productIds);
 if (productError) return NextResponse.json({ error: productError.message }, { status: 400 });
 if (!products || products.length !== productIds.length) {
  return NextResponse.json({ error: 'Produk jualan tidak sah atau tidak aktif' }, { status: 400 });
 }
 const prices = new Map(products.map((product) => [product.id, Number(product.price)]));
 const subtotal = normalizedItems.reduce(
  (sum, item) => sum + (prices.get(item.product_id) ?? 0) * item.quantity,
  0,
 );
 const discount = Number(body.discount ?? 0);
 if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
  return NextResponse.json({ error: 'Diskaun jualan tidak sah' }, { status: 400 });
 }
 const total = Number((subtotal - discount).toFixed(2));
 const cashAmount = Number(body.cash_amount.toFixed(2));
 const qrAmount = Number(body.qr_amount.toFixed(2));
 if (total <= 0 || cashAmount + qrAmount < total || qrAmount > total) {
  return NextResponse.json({ error: 'Pecahan bayaran tidak sepadan dengan jumlah jualan' }, { status: 400 });
 }
 if (body.payment_method === 'QR' && cashAmount !== 0) {
  return NextResponse.json({ error: 'Bayaran QR penuh tidak boleh mengandungi tunai' }, { status: 400 });
 }
 if (body.payment_method === 'MIXED' && cashAmount <= 0) {
  return NextResponse.json({ error: 'Bayaran campur memerlukan amaun tunai' }, { status: 400 });
 }

 let config;
 try {
  config = getFiuuOpaConfig(device.branchCode ?? body.branchId, device.deviceCode);
 } catch (error) {
  console.error('[pos-fiuu] invalid_configuration', { reason: errorMessage(error) });
  return NextResponse.json({ error: 'Konfigurasi Fiuu POS tidak sah. Hubungi HQ.' }, { status: 503 });
 }
 if (!config) {
  return NextResponse.json(
   { error: 'Fiuu belum dikonfigurasi untuk cawangan ini.', mode: 'FIUU_CONFIGURATION_REQUIRED' },
   { status: 503 });
 }

 const salePayload = {
  shiftId: body.shiftId,
  branchId: body.branchId,
  items: normalizedItems,
  payment_method: body.payment_method,
  cash_amount: cashAmount,
  qr_amount: qrAmount,
  discount,
  ...(body.offline_id ? { offline_id: body.offline_id } : {}),
  ...(body.receipt_email ? { receipt_email: body.receipt_email } : {}),
  ...(body.receipt_phone ? { receipt_phone: body.receipt_phone } : {}),
  fiuu_branch_code: device.branchCode ?? body.branchId,
  fiuu_device_code: device.deviceCode,
 } satisfies Json;
 const expiresAt = new Date(Date.now() + config.validitySeconds * 1000).toISOString();
 const { data: payment, error: insertError } = await supabase
  .from('pos_online_payments')
  .insert({
   organization_id: profile.organization_id,
   branch_id: body.branchId,
   shift_id: body.shiftId,
   amount_rm: qrAmount,
   status: 'PENDING',
   provider: 'fiuu',
   sale_payload: salePayload,
   created_by: profile.id,
   expires_at: expiresAt,
  })
  .select('id')
  .single();
 if (insertError || !payment) {
  return NextResponse.json({ error: insertError?.message ?? 'Rekod QR gagal dicipta' }, { status: 400 });
 }

 try {
  const qr = await createFiuuDynamicQr({
   config,
   paymentId: payment.id,
   amountRm: qrAmount,
   description: `RKJ POS ${device.branchCode ?? 'Branch'}`,
  });
  const { error: updateError } = await supabase
   .from('pos_online_payments')
   .update({
    gateway_ref: qr.gatewayReference,
    checkout_url: qr.qrImageUrl,
    expires_at: qr.expiresAt,
    updated_at: new Date().toISOString(),
   })
   .eq('id', payment.id)
   .eq('status', 'PENDING');
  if (updateError) throw new Error(updateError.message);

  return NextResponse.json({
   payment: {
    id: payment.id,
    status: 'PENDING',
    amount_rm: qrAmount,
    qr_image_url: `/api/pos/qr-payments/${encodeURIComponent(payment.id)}/image`,
    gateway_ref: qr.gatewayReference,
    expires_at: qr.expiresAt,
    environment: config.environment,
   },
  });
 } catch (error) {
  await supabase
   .from('pos_online_payments')
   .update({ status: 'FAILED', failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
   .eq('id', payment.id)
   .eq('status', 'PENDING');
  console.error('[pos-fiuu] qr_create_failed', {
   paymentId: payment.id,
   reason: errorMessage(error).slice(0, 160),
  });
  return NextResponse.json({ error: 'Fiuu tidak dapat menjana QR. Cuba semula.' }, { status: 502 });
 }
}
