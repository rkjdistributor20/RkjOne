import { randomUUID } from 'node:crypto';
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
 getFiuuEnvironment,
 getFiuuOpaConfig,
 getPosQrPaymentMode,
  isFiuuOpaApplicationUnavailable,
 isFiuuOpaDefinitiveRejection,
 isFiuuReconciliationExpired,
 malaysiaBusinessDate,
} from '@/lib/pos/fiuu';
import { isFiuuOpaEnabledForBranch } from '@/lib/pos/fiuu-opa-server';
import {
 buildFiuuCloudEcrReferenceId,
 getFiuuCloudEcrConfig,
 type FiuuCloudEcrConfig,
 type FiuuCloudEcrResponse,
} from '@/lib/pos/fiuu-cloudecr';
import { sendFiuuCloudEcrSale } from '@/lib/pos/fiuu-cloudecr-runtime';
import {
 getFiuuCloudEcrValiditySeconds,
 isFiuuCloudEcrEnabledForBranch,
} from '@/lib/pos/fiuu-cloudecr-server';
import { buildFiuuVtOrderId } from '@/lib/pos/fiuu-vt';
import {
 getFiuuVtValiditySeconds,
 isFiuuVtEnabledForBranch,
} from '@/lib/pos/fiuu-vt-server';
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
 provider_order_id: string | null;
};

type FiuuPaymentTransport = {
 provider: 'fiuu' | 'fiuu_vt' | 'fiuu_cloudecr';
 integration: 'opa' | 'vt_app' | 'cloudecr';
 environment: 'sandbox' | 'production';
};

export const maxDuration = 100;

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

function sanitizedCloudEcrResult(result: FiuuCloudEcrResponse): Json {
 return {
  transType: result.transType,
  posId: result.posId,
  deviceId: result.deviceId,
  referenceId: result.referenceId,
  statusCode: result.statusCode,
  responseCode: result.responseCode,
  responseText: result.responseText,
  softwareVersion: result.softwareVersion,
  terminalSn: result.terminalSn,
  apiVersion: result.apiVersion,
  transData: result.transData ? { ...result.transData } : null,
  signature: result.signature,
  verified_payload: result.verifiedPayload as unknown as Json,
 };
}

function existingPaymentResponse(
 payment: ExistingPayment,
 expected: PosPaymentIntentIdentity,
 transport: FiuuPaymentTransport,
 conflictMode: 'IDEMPOTENCY_KEY_REUSED' | 'FIUU_ACTIVE_ATTEMPT_EXISTS' = 'IDEMPOTENCY_KEY_REUSED',
) {
 const matches = payment.provider === transport.provider && isSamePosPaymentIntent({
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
    environment: transport.environment,
    integration: transport.integration,
    provider_order_id: payment.provider_order_id,
    reused: true,
   },
  });
 }

 if (payment.status === 'REPORTED') {
  return NextResponse.json({
   payment: {
    id: payment.id,
    status: 'REPORTED',
    amount_rm: Number(payment.amount_rm),
    qr_image_url: null,
    gateway_ref: payment.gateway_ref,
    expires_at: payment.expires_at,
    environment: transport.environment,
    integration: transport.integration,
    provider_order_id: payment.provider_order_id,
    reused: true,
   },
   next_action: 'AUTO_CONFIRMATION',
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
 if (!payment.expires_at
  || (transport.integration === 'opa' && (!payment.checkout_url || !payment.gateway_ref))
  || ((transport.integration === 'vt_app' || transport.integration === 'cloudecr')
   && !payment.provider_order_id)) {
  return NextResponse.json(
   {
    error: transport.integration === 'vt_app' || transport.integration === 'cloudecr'
     ? 'Percubaan Fiuu masih disediakan. Cuba semula sebentar lagi.'
     : 'Kod QR Fiuu masih dijana. Cuba semula sebentar lagi.',
    mode: 'FIUU_ATTEMPT_INITIALIZING',
   },
   { status: 409 });
 }

 return NextResponse.json({
  payment: {
   id: payment.id,
   status: 'PENDING',
   amount_rm: Number(payment.amount_rm),
   qr_image_url: transport.integration === 'opa'
    ? `/api/pos/qr-payments/${encodeURIComponent(payment.id)}/image`
    : null,
   gateway_ref: payment.gateway_ref,
   expires_at: payment.expires_at,
   environment: transport.environment,
   integration: transport.integration,
   provider_order_id: payment.provider_order_id,
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

 const paymentMode = getPosQrPaymentMode();
 if (paymentMode === 'manual') {
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

 const branchCode = device.branchCode?.trim().toUpperCase() ?? '';
 if (paymentMode === 'fiuu') {
  try {
   if (!branchCode || !isFiuuOpaEnabledForBranch(branchCode)) {
    return NextResponse.json(
     { error: 'Fiuu OPA belum dibenarkan untuk cawangan ini.', mode: 'FIUU_OPA_BRANCH_NOT_ENABLED' },
     { status: 409 },
    );
   }
  } catch (error) {
   console.error('[pos-fiuu-opa] invalid_branch_configuration', { reason: errorMessage(error) });
   return NextResponse.json(
    { error: 'Konfigurasi pilot Fiuu OPA tidak sah. Hubungi HQ.' },
    { status: 503 },
   );
  }
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
 if (productIds.length !== normalizedItems.length) {
  return NextResponse.json({ error: 'Produk jualan tidak boleh berulang dalam satu transaksi' }, { status: 400 });
 }
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
 const subtotal = Number(normalizedItems.reduce(
  (sum, item) => sum + (prices.get(item.product_id) ?? 0) * item.quantity,
  0,
 ).toFixed(2));
 const pricingSnapshot = normalizedItems.map((item) => {
  const unitPrice = Number((prices.get(item.product_id) ?? 0).toFixed(2));
  return {
   product_id: item.product_id,
   quantity: item.quantity,
   unit_price: unitPrice,
   line_total: Number((unitPrice * item.quantity).toFixed(2)),
  };
 });
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
 if (body.payment_method === 'MIXED'
  && Math.round((cashAmount + qrAmount) * 100) !== Math.round(total * 100)) {
  return NextResponse.json(
   { error: 'Bayaran campur Fiuu memerlukan amaun tunai tepat tanpa baki. Laraskan tunai atau QR.' },
   { status: 400 },
  );
 }

 let config: ReturnType<typeof getFiuuOpaConfig> = null;
 let cloudEcrConfig: FiuuCloudEcrConfig | null = null;
 let transport: FiuuPaymentTransport;
 let validitySeconds: number;
 if (paymentMode === 'fiuu_cloudecr') {
  try {
   if (!branchCode || !isFiuuCloudEcrEnabledForBranch(branchCode)) {
    return NextResponse.json(
     { error: 'Fiuu VT+ cloudECR belum dibenarkan untuk cawangan ini.', mode: 'FIUU_CLOUDECR_BRANCH_NOT_ENABLED' },
     { status: 409 },
    );
   }
   cloudEcrConfig = getFiuuCloudEcrConfig();
  } catch (error) {
   console.error('[pos-fiuu-cloudecr] invalid_configuration', { reason: errorMessage(error) });
   return NextResponse.json(
    { error: 'Konfigurasi pilot Fiuu VT+ cloudECR tidak lengkap. Hubungi HQ.' },
    { status: 503 },
   );
  }
  transport = {
   provider: 'fiuu_cloudecr',
   integration: 'cloudecr',
   environment: 'production',
  };
  validitySeconds = getFiuuCloudEcrValiditySeconds();
 } else if (paymentMode === 'fiuu_vt') {
  let vtEnvironment: FiuuPaymentTransport['environment'] = 'sandbox';
  try {
   if (!branchCode || !isFiuuVtEnabledForBranch(branchCode)) {
    return NextResponse.json(
     { error: 'Fiuu VT belum dibenarkan untuk cawangan ini.', mode: 'FIUU_VT_BRANCH_NOT_ENABLED' },
     { status: 409 });
   }
   vtEnvironment = getFiuuEnvironment();
  } catch (error) {
   console.error('[pos-fiuu-vt] invalid_configuration', { reason: errorMessage(error) });
   return NextResponse.json({ error: 'Konfigurasi pilot Fiuu VT tidak sah. Hubungi HQ.' }, { status: 503 });
  }
   transport = {
    provider: 'fiuu_vt',
    integration: 'vt_app',
    environment: vtEnvironment,
   };
  validitySeconds = getFiuuVtValiditySeconds();
 } else {
  try {
   config = getFiuuOpaConfig(branchCode, device.deviceCode);
  } catch (error) {
   console.error('[pos-fiuu] invalid_configuration', { reason: errorMessage(error) });
   return NextResponse.json({ error: 'Konfigurasi Fiuu POS tidak sah. Hubungi HQ.' }, { status: 503 });
  }
  if (!config) {
   return NextResponse.json(
    { error: 'Fiuu belum dikonfigurasi untuk cawangan ini.', mode: 'FIUU_CONFIGURATION_REQUIRED' },
    { status: 503 });
  }
  transport = { provider: 'fiuu', integration: 'opa', environment: config.environment };
  validitySeconds = config.validitySeconds;
 }

 const salePayload = {
  shiftId: body.shiftId,
  branchId: body.branchId,
  items: normalizedItems,
  payment_method: body.payment_method,
  cash_amount: cashAmount,
  qr_amount: qrAmount,
  discount,
  subtotal,
  total,
  pricing_snapshot: pricingSnapshot,
  ...(body.offline_id ? { offline_id: body.offline_id } : {}),
  ...(body.receipt_email ? { receipt_email: body.receipt_email } : {}),
  ...(body.receipt_phone ? { receipt_phone: body.receipt_phone } : {}),
  fiuu_branch_code: branchCode || body.branchId,
  fiuu_device_code: device.deviceCode,
  ...(config ? {
   fiuu_application_code: config.applicationCode,
   fiuu_store_id: config.storeId,
   fiuu_terminal_id: config.terminalId,
   fiuu_business_date: malaysiaBusinessDate(),
  } : {}),
  ...(cloudEcrConfig ? {
   fiuu_cloudecr_pos_id: cloudEcrConfig.posId,
   fiuu_cloudecr_device_id: cloudEcrConfig.deviceId,
   fiuu_cloudecr_terminal_sn: cloudEcrConfig.terminalSn,
  } : {}),
 } satisfies Json;
 const expiresAt = new Date(Date.now() + validitySeconds * 1000).toISOString();
 const admin = createAdminClient();
 const expectedIntent: PosPaymentIntentIdentity = {
  branchId: body.branchId,
  shiftId: body.shiftId,
  createdBy: profile.id,
  amountRm: qrAmount,
  salePayload,
 };
 const existingSelect = 'id, amount_rm, branch_id, shift_id, created_by, provider, status, sale_payload, gateway_ref, checkout_url, expires_at, provider_order_id';

 // A provider success cannot be accepted after this bounded grace. Expire only
 // those stale rows before checking the server-side one-active-intent guard.
 const reconciliationCutoff = new Date(Date.now() - FIUU_CALLBACK_GRACE_MS).toISOString();
 const { error: expireError } = await admin
  .from('pos_online_payments')
  .update({ status: 'EXPIRED', failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  .eq('organization_id', profile.organization_id)
  .eq('branch_id', body.branchId)
  .eq('shift_id', body.shiftId)
 .in('provider', ['fiuu_vt', 'fiuu_cloudecr'])
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
  return existingPaymentResponse(existingPayment, expectedIntent, transport);
 }

 const { data: activePayment, error: activeError } = await admin
  .from('pos_online_payments')
  .select(existingSelect)
  .eq('organization_id', profile.organization_id)
  .eq('branch_id', body.branchId)
  .eq('shift_id', body.shiftId)
  .eq('created_by', profile.id)
  .in('provider', ['fiuu', 'fiuu_vt', 'fiuu_cloudecr'])
  .in('status', ['PENDING', 'REPORTED'])
  .maybeSingle();
 if (activeError) {
  return NextResponse.json({ error: 'Percubaan QR aktif tidak dapat disahkan' }, { status: 400 });
 }
 if (activePayment) {
  return existingPaymentResponse(
   activePayment,
   expectedIntent,
   transport,
   'FIUU_ACTIVE_ATTEMPT_EXISTS',
  );
 }

 const activeEndpointQuery = () => {
  const base = admin
   .from('pos_online_payments')
   .select(existingSelect)
   .eq('organization_id', profile.organization_id)
   .eq('provider', transport.provider)
   .in('status', ['PENDING', 'REPORTED']);
  if (transport.integration === 'cloudecr' && cloudEcrConfig) {
   return base.contains('sale_payload', {
    fiuu_cloudecr_pos_id: cloudEcrConfig.posId,
    fiuu_cloudecr_device_id: cloudEcrConfig.deviceId,
    fiuu_cloudecr_terminal_sn: cloudEcrConfig.terminalSn,
   });
  }
  return base
   .eq('branch_id', body.branchId)
   .eq('shift_id', body.shiftId)
   .contains('sale_payload', { fiuu_device_code: device.deviceCode });
 };
 const { data: activeDevicePayment, error: activeDeviceError } = await activeEndpointQuery()
  .maybeSingle();
 if (activeDeviceError) {
  return NextResponse.json({ error: 'Percubaan QR aktif terminal tidak dapat disahkan' }, { status: 400 });
 }
 if (activeDevicePayment) {
  return existingPaymentResponse(
   activeDevicePayment,
   expectedIntent,
   transport,
   'FIUU_ACTIVE_ATTEMPT_EXISTS',
  );
 }

 const paymentId = randomUUID();
 const providerOrderId = transport.integration === 'vt_app'
  ? buildFiuuVtOrderId(paymentId)
  : transport.integration === 'cloudecr'
   ? buildFiuuCloudEcrReferenceId(paymentId)
   : null;
 const { data: payment, error: insertError } = await admin
  .from('pos_online_payments')
  .insert({
   id: paymentId,
   organization_id: profile.organization_id,
   branch_id: body.branchId,
   shift_id: body.shiftId,
   amount_rm: qrAmount,
   status: 'PENDING',
   provider: transport.provider,
   provider_order_id: providerOrderId,
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
    return existingPaymentResponse(racedPayment, expectedIntent, transport);
   }
   const { data: racedActivePayment } = await admin
    .from('pos_online_payments')
    .select(existingSelect)
    .eq('organization_id', profile.organization_id)
    .eq('branch_id', body.branchId)
    .eq('shift_id', body.shiftId)
    .eq('created_by', profile.id)
     .in('provider', ['fiuu', 'fiuu_vt', 'fiuu_cloudecr'])
    .in('status', ['PENDING', 'REPORTED'])
    .maybeSingle();
   if (racedActivePayment) {
    return existingPaymentResponse(
     racedActivePayment,
     expectedIntent,
      transport,
     'FIUU_ACTIVE_ATTEMPT_EXISTS',
    );
   }
    const { data: racedDevicePayment } = await activeEndpointQuery().maybeSingle();
    if (racedDevicePayment) {
     return existingPaymentResponse(
      racedDevicePayment,
      expectedIntent,
      transport,
      'FIUU_ACTIVE_ATTEMPT_EXISTS',
     );
    }
  }
   return NextResponse.json({ error: 'Rekod QR gagal dicipta' }, { status: 400 });
 }

 if (transport.integration === 'cloudecr') {
  const pendingPayment = {
   id: payment.id,
   status: 'PENDING' as const,
   amount_rm: qrAmount,
   qr_image_url: null,
   gateway_ref: null,
   provider_order_id: providerOrderId,
   expires_at: expiresAt,
   environment: transport.environment,
   integration: transport.integration,
   reused: false,
  };
  try {
   const providerResult = await sendFiuuCloudEcrSale({
    referenceId: providerOrderId!,
    amountRm: qrAmount,
    note: `RKJ ${branchCode}`,
   });
   const safeResult = sanitizedCloudEcrResult(providerResult);
   const checkedAt = new Date().toISOString();
   if (providerResult.statusCode === '00' && providerResult.responseCode === '00') {
    const providerTransactionId = providerResult.transData?.transId;
    if (!providerTransactionId) {
     const { error: evidenceError } = await admin.from('pos_online_payments').update({
      provider_result: safeResult,
      provider_status_checked_at: checkedAt,
      updated_at: checkedAt,
     }).eq('id', payment.id).eq('status', 'PENDING');
     if (evidenceError) {
      console.error('[pos-fiuu-cloudecr] invalid_success_evidence_failed', {
       paymentId: payment.id,
       reason: evidenceError.message.slice(0, 160),
      });
     }
     return NextResponse.json({
      payment: pendingPayment,
      warning: 'Fiuu melaporkan kejayaan tanpa Transaction ID. Percubaan dikunci untuk rekonsiliasi.',
     }, { status: 202 });
    }
    const { error: reportError } = await admin.rpc(
     'report_pos_fiuu_cloudecr_payment',
     { p_payment_id: payment.id, p_provider_result: safeResult },
    );
    if (reportError) {
     console.error('[pos-fiuu-cloudecr] success_report_failed', {
      paymentId: payment.id,
      reason: reportError.message.slice(0, 160),
     });
     return NextResponse.json({
      payment: pendingPayment,
      warning: 'Fiuu melaporkan kejayaan tetapi bukti belum dapat dikunci. Jangan cuba jualan semula; RKJ One akan rekonsiliasi.',
     }, { status: 202 });
    }
    const reportedPayment = {
     ...pendingPayment,
     status: 'REPORTED' as const,
     gateway_ref: providerTransactionId,
    };
    const { data: receipt, error: fulfillError } = await admin.rpc(
     'fulfill_pos_fiuu_cloudecr_payment',
     { p_payment_id: payment.id },
    );
    if (fulfillError) {
     console.error('[pos-fiuu-cloudecr] fulfillment_failed', {
      paymentId: payment.id,
      reason: fulfillError.message.slice(0, 160),
     });
     return NextResponse.json({
      payment: reportedPayment,
      warning: 'Bayaran dilaporkan berjaya tetapi resit belum dapat dimuktamadkan. Jangan cuba jualan semula.',
     }, { status: 202 });
    }
    return NextResponse.json({
     payment: {
      ...pendingPayment,
      status: 'PAID',
      gateway_ref: providerTransactionId,
     },
     result: receipt,
    });
   }

   if (providerResult.statusCode === '11') {
    const { data: declinedPayment, error: declineUpdateError } = await admin.from('pos_online_payments').update({
     status: 'FAILED',
     provider_result: safeResult,
     provider_status_checked_at: checkedAt,
     failed_at: checkedAt,
     updated_at: checkedAt,
    }).eq('id', payment.id).eq('provider', 'fiuu_cloudecr').eq('status', 'PENDING')
     .select('id').maybeSingle();
    if (declineUpdateError || !declinedPayment) {
     console.error('[pos-fiuu-cloudecr] decline_update_failed', {
      paymentId: payment.id,
      reason: declineUpdateError?.message.slice(0, 160) ?? 'conditional update changed no row',
     });
     return NextResponse.json({
      payment: pendingPayment,
      warning: 'Fiuu menolak transaksi tetapi status tempatan belum dapat dikunci. Jangan hantar SALE baharu; semak status semula.',
     }, { status: 202 });
    }
    return NextResponse.json(
     {
      error: providerResult.responseText || 'Fiuu VT+ menolak transaksi.',
      mode: 'FIUU_CLOUDECR_DECLINED',
     },
     { status: 409 },
    );
   }

   const { data: pendingPaymentUpdate, error: pendingUpdateError } = await admin.from('pos_online_payments').update({
    provider_result: safeResult,
    provider_status_checked_at: checkedAt,
    updated_at: checkedAt,
   }).eq('id', payment.id).eq('provider', 'fiuu_cloudecr').eq('status', 'PENDING')
    .select('id').maybeSingle();
   if (pendingUpdateError || !pendingPaymentUpdate) {
    console.error('[pos-fiuu-cloudecr] pending_update_failed', {
     paymentId: payment.id,
     reason: pendingUpdateError?.message.slice(0, 160) ?? 'conditional update changed no row',
    });
   }
   return NextResponse.json({ payment: pendingPayment }, { status: 202 });
  } catch (error) {
   // The request may already have reached Fiuu. Keep the intent locked and use
   // getLast instead of sending another SALE that could charge twice.
   console.error('[pos-fiuu-cloudecr] sale_result_unknown', {
    paymentId: payment.id,
    reason: errorMessage(error).slice(0, 160),
   });
   return NextResponse.json({
    payment: pendingPayment,
    warning: 'Keputusan Fiuu belum diketahui. RKJ One akan menyemak semula tanpa menghantar SALE kedua.',
   }, { status: 202 });
  }
 }

 if (transport.integration === 'vt_app') {
  return NextResponse.json({
   payment: {
    id: payment.id,
    status: 'PENDING',
    amount_rm: qrAmount,
    qr_image_url: null,
    gateway_ref: null,
    provider_order_id: providerOrderId,
    expires_at: expiresAt,
    environment: transport.environment,
    integration: transport.integration,
    reused: false,
   },
  });
 }

 let generatedQr: Awaited<ReturnType<typeof createFiuuDynamicQr>> | null = null;
 try {
  generatedQr = await createFiuuDynamicQr({
   config: config!,
   paymentId: payment.id,
   amountRm: qrAmount,
   description: `RKJ POS ${branchCode || 'Branch'}`,
  });
  const { error: updateError } = await admin
   .from('pos_online_payments')
   .update({
    gateway_ref: generatedQr.gatewayReference,
    checkout_url: generatedQr.qrImageUrl,
    expires_at: generatedQr.expiresAt,
   fiuu_opa_reconcile_state: 'WAITING_FOR_EXPIRY',
   fiuu_opa_reconcile_next_at: new Date(
    new Date(generatedQr.expiresAt).getTime() + 10_000,
   ).toISOString(),
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
    gateway_ref: generatedQr.gatewayReference,
    expires_at: generatedQr.expiresAt,
    environment: transport.environment,
    integration: transport.integration,
    provider_order_id: null,
    reused: false,
   },
  });
 } catch (error) {
  const checkedAt = new Date().toISOString();
  if (isFiuuOpaDefinitiveRejection(error)) {
   await admin
    .from('pos_online_payments')
    .update({ status: 'FAILED', failed_at: checkedAt, updated_at: checkedAt })
    .eq('id', payment.id)
    .eq('status', 'PENDING');
   console.error('[pos-fiuu] qr_create_rejected', {
    paymentId: payment.id,
    reason: errorMessage(error).slice(0, 160),
   });
    if (isFiuuOpaApplicationUnavailable(error)) {
     return NextResponse.json({
      error: 'Fiuu belum mengaktifkan Application Code OPA untuk cawangan ini. Tiada caj atau jualan dibuat; jangan cuba QR semula sehingga HQ mengesahkan UAT.',
      code: 'FIUU_OPA_APPLICATION_NOT_PROVISIONED',
      retryable: false,
     }, { status: 503 });
    }
   return NextResponse.json({ error: 'Fiuu tidak dapat menjana QR. Cuba semula.' }, { status: 502 });
  }

  const uncertainUpdate = generatedQr ? {
   gateway_ref: generatedQr.gatewayReference,
   checkout_url: generatedQr.qrImageUrl,
   expires_at: generatedQr.expiresAt,
   fiuu_opa_reconcile_state: 'WAITING_FOR_EXPIRY',
   fiuu_opa_reconcile_next_at: new Date(
    new Date(generatedQr.expiresAt).getTime() + 10_000,
   ).toISOString(),
   provider_status_checked_at: checkedAt,
   updated_at: checkedAt,
  } : {
   fiuu_opa_reconcile_state: 'WAITING_FOR_EXPIRY',
   fiuu_opa_reconcile_next_at: new Date(
    new Date(expiresAt).getTime() + 10_000,
   ).toISOString(),
   provider_status_checked_at: checkedAt,
   updated_at: checkedAt,
  };
  const { error: uncertainUpdateError } = await admin
   .from('pos_online_payments')
   .update(uncertainUpdate)
   .eq('id', payment.id)
   .eq('status', 'PENDING');
  const recoverableQr = generatedQr && !uncertainUpdateError ? generatedQr : null;
  console.error('[pos-fiuu] qr_create_failed', {
   paymentId: payment.id,
   reason: errorMessage(error).slice(0, 160),
   state: 'WAITING_FOR_EXPIRY',
   recording: uncertainUpdateError?.message.slice(0, 160) ?? 'recorded',
  });
  return NextResponse.json({
   payment: {
    id: payment.id,
    status: 'PENDING',
    amount_rm: qrAmount,
    qr_image_url: recoverableQr
     ? `/api/pos/qr-payments/${encodeURIComponent(payment.id)}/image`
     : null,
    gateway_ref: recoverableQr?.gatewayReference ?? null,
    expires_at: recoverableQr?.expiresAt ?? expiresAt,
    environment: transport.environment,
    integration: transport.integration,
    provider_order_id: null,
    reused: false,
   },
   warning: recoverableQr
    ? 'QR dijana tetapi simpanan awal terganggu. RKJ One akan menyemak status tanpa menghantar permintaan QR kedua.'
    : 'Keputusan Fiuu belum diketahui. RKJ One akan menyemak menggunakan rujukan asal tanpa menghantar permintaan QR kedua.',
  }, { status: 202 });
 }
}
