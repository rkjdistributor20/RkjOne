import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
import {
 createFiuuDynamicQr,
 FIUU_CALLBACK_GRACE_MS,
 getFiuuOpaConfig,
 getPosQrPaymentMode,
 isFiuuReconciliationExpired,
} from '@/lib/pos/fiuu';
import {
 isSamePosPaymentIntent,
 isValidPosPaymentIdempotencyKey,
 type PosPaymentIntentIdentity,
} from '@/lib/pos/payment-idempotency';
import type { CreateSalePayload } from '@/lib/pos/types';
import type { Json } from '@/types/database';

type ExistingPayment = {
 id: string;
 amount_rm: number;
 branch_id: string;
 shift_id: string;
 created_by: string | null;
 provider: string;
 status: string;
 sale_payload: Json;
 gateway_ref: string | null;
 checkout_url: string | null;
 expires_at: string | null;
};

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

function existingPaymentResponse(
 payment: ExistingPayment,
 expected: PosPaymentIntentIdentity,
 environment: 'sandbox' | 'production',
 conflictMode: 'IDEMPOTENCY_KEY_REUSED' | 'FIUU_ACTIVE_ATTEMPT_EXISTS' = 'IDEMPOTENCY_KEY_REUSED',
) {
 const matches = payment.provider === 'fiuu' && isSamePosPaymentIntent({
  branchId: payment.branch_id,
  shiftId: payment.shift_id,
  createdBy: payment.created_by ?? '',
  amountRm: Number(payment.amount_rm),
  salePayload: payment.sale_payload,
 }, expected);
 if (!matches) {
  return NextResponse.json(
   {
    error: conflictMode === 'FIUU_ACTIVE_ATTEMPT_EXISTS'
     ? 'Selesaikan percubaan QR aktif sebelum memulakan jualan QR yang lain.'
     : 'Kunci percubaan QR telah digunakan untuk bayaran yang berbeza.',
    mode: conflictMode,
   },
   { status: 409 });
 }

 if (payment.status === 'PAID') {
  return NextResponse.json({
   payment: {
    id: payment.id,
    status: 'PAID',
    amount_rm: Number(payment.amount_rm),
    qr_image_url: null,
    gateway_ref: payment.gateway_ref,
    expires_at: payment.expires_at,
    environment,
    reused: true,
   },
  });
 }

 if (payment.status !== 'PENDING'
  || (payment.expires_at && isFiuuReconciliationExpired(payment.expires_at))) {
  return NextResponse.json(
   {
    error: 'Percubaan QR ini telah tamat. Jana percubaan baharu.',
    mode: 'FIUU_ATTEMPT_TERMINAL',
   },
   { status: 409 });
 }
 if (!payment.checkout_url || !payment.gateway_ref || !payment.expires_at) {
  return NextResponse.json(
   {
    error: 'Kod QR Fiuu masih dijana. Cuba semula sebentar lagi.',
    mode: 'FIUU_ATTEMPT_INITIALIZING',
   },
   { status: 409 });
 }

 return NextResponse.json({
  payment: {
   id: payment.id,
   status: 'PENDING',
   amount_rm: Number(payment.amount_rm),
   qr_image_url: `/api/pos/qr-payments/${encodeURIComponent(payment.id)}/image`,
   gateway_ref: payment.gateway_ref,
   expires_at: payment.expires_at,
   environment,
   reused: true,
  },
 });
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
 const idempotencyKey = Reflect.get(rawBody, 'idempotency_key');
 if (!isValidPosPaymentIdempotencyKey(idempotencyKey)) {
  return NextResponse.json({ error: 'Kunci percubaan QR tidak sah' }, { status: 400 });
 }
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

 const { data: kioskLocation, error: locationError } = await supabase
  .from('inventory_locations')
  .select('id')
  .eq('organization_id', profile.organization_id)
  .eq('branch_id', body.branchId)
  .eq('location_type', 'BRANCH_KIOSK')
  .maybeSingle();
 if (locationError || !kioskLocation) {
  return NextResponse.json({ error: 'Lokasi stok kiosk belum disediakan untuk cawangan ini' }, { status: 400 });
 }
 const { error: stockError } = await supabase.rpc('validate_pos_sale_stock', {
  p_location_id: kioskLocation.id,
  p_items: normalizedItems,
 });
 if (stockError) {
  return NextResponse.json({ error: stockError.message }, { status: 409 });
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
 const admin = createAdminClient();
 const expectedIntent: PosPaymentIntentIdentity = {
  branchId: body.branchId,
  shiftId: body.shiftId,
  createdBy: profile.id,
  amountRm: qrAmount,
  salePayload,
 };
 const existingSelect = 'id, amount_rm, branch_id, shift_id, created_by, provider, status, sale_payload, gateway_ref, checkout_url, expires_at';

 // A provider success cannot be accepted after this bounded grace. Expire only
 // those stale rows before checking the server-side one-active-intent guard.
 const reconciliationCutoff = new Date(Date.now() - FIUU_CALLBACK_GRACE_MS).toISOString();
 const { error: expireError } = await admin
  .from('pos_online_payments')
  .update({ status: 'EXPIRED', failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  .eq('organization_id', profile.organization_id)
  .eq('branch_id', body.branchId)
  .eq('shift_id', body.shiftId)
  .eq('created_by', profile.id)
  .eq('provider', 'fiuu')
  .eq('status', 'PENDING')
  .lte('expires_at', reconciliationCutoff);
 if (expireError) {
  return NextResponse.json({ error: 'Status percubaan QR terdahulu tidak dapat disahkan' }, { status: 400 });
 }

 const { data: existingPayment, error: existingError } = await admin
  .from('pos_online_payments')
  .select(existingSelect)
  .eq('organization_id', profile.organization_id)
  .eq('idempotency_key', idempotencyKey)
  .maybeSingle();
 if (existingError) {
  return NextResponse.json({ error: 'Percubaan QR tidak dapat disahkan' }, { status: 400 });
 }
 if (existingPayment) {
  return existingPaymentResponse(existingPayment, expectedIntent, config.environment);
 }

 const { data: activePayment, error: activeError } = await admin
  .from('pos_online_payments')
  .select(existingSelect)
  .eq('organization_id', profile.organization_id)
  .eq('branch_id', body.branchId)
  .eq('shift_id', body.shiftId)
  .eq('created_by', profile.id)
  .eq('provider', 'fiuu')
  .eq('status', 'PENDING')
  .maybeSingle();
 if (activeError) {
  return NextResponse.json({ error: 'Percubaan QR aktif tidak dapat disahkan' }, { status: 400 });
 }
 if (activePayment) {
  return existingPaymentResponse(
   activePayment,
   expectedIntent,
   config.environment,
   'FIUU_ACTIVE_ATTEMPT_EXISTS',
  );
 }

 const { data: payment, error: insertError } = await admin
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
   idempotency_key: idempotencyKey,
  })
  .select('id')
 .single();
 if (insertError || !payment) {
  if (insertError?.code === '23505') {
   const { data: racedPayment } = await admin
    .from('pos_online_payments')
    .select(existingSelect)
    .eq('organization_id', profile.organization_id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
   if (racedPayment) {
    return existingPaymentResponse(racedPayment, expectedIntent, config.environment);
   }
   const { data: racedActivePayment } = await admin
    .from('pos_online_payments')
    .select(existingSelect)
    .eq('organization_id', profile.organization_id)
    .eq('branch_id', body.branchId)
    .eq('shift_id', body.shiftId)
    .eq('created_by', profile.id)
    .eq('provider', 'fiuu')
    .eq('status', 'PENDING')
    .maybeSingle();
   if (racedActivePayment) {
    return existingPaymentResponse(
     racedActivePayment,
     expectedIntent,
     config.environment,
     'FIUU_ACTIVE_ATTEMPT_EXISTS',
    );
   }
  }
  return NextResponse.json({ error: insertError?.message ?? 'Rekod QR gagal dicipta' }, { status: 400 });
 }

 try {
  const qr = await createFiuuDynamicQr({
   config,
   paymentId: payment.id,
   amountRm: qrAmount,
   description: `RKJ POS ${device.branchCode ?? 'Branch'}`,
  });
  const { error: updateError } = await admin
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
    reused: false,
   },
  });
 } catch (error) {
  await admin
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
