import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPosBillplzSignature } from '@/lib/pos/qr-gateway';
import { getFiuuOpaConfig, verifyFiuuOpaSignature } from '@/lib/pos/fiuu';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import type { Json } from '@/types/database';

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanProviderValue(value: unknown, maxLength = 200): string {
 return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parsePayload(raw: string, contentType: string): Record<string, unknown> | null {
 if (!contentType.includes('application/json')) {
  return Object.fromEntries(new URLSearchParams(raw));
 }
 try {
  const parsed: unknown = raw ? JSON.parse(raw) : {};
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
   ? parsed as Record<string, unknown>
   : null;
 } catch {
  return null;
 }
}

async function handleFiuuNotification(body: Record<string, unknown>) {
 const applicationCode = cleanProviderValue(body.applicationCode, 32);
 const referenceId = cleanProviderValue(body.referenceId, 40);
 if (!applicationCode || !referenceId || !cleanProviderValue(body.signature, 128)) {
  return NextResponse.json({ error: 'Invalid Fiuu notification' }, { status: 400 });
 }

 const admin = createAdminClient();
 const { data: payment, error: paymentError } = await admin
 .from('pos_online_payments')
  .select('id, status, provider, amount_rm, gateway_ref, sale_payload, transaction_id')
  .eq('id', referenceId)
  .eq('provider', 'fiuu')
  .maybeSingle();
 if (paymentError || !payment) {
  return NextResponse.json({ error: 'Fiuu POS payment tidak dijumpai' }, { status: 404 });
 }
 if (!isRecord(payment.sale_payload)) {
  return NextResponse.json({ error: 'Fiuu payment metadata tidak sah' }, { status: 400 });
 }

 const branchCode = cleanProviderValue(payment.sale_payload.fiuu_branch_code, 40);
 const deviceCode = cleanProviderValue(payment.sale_payload.fiuu_device_code, 40);
 let config;
 try {
  config = getFiuuOpaConfig(branchCode, deviceCode);
 } catch {
  return NextResponse.json({ error: 'Fiuu configuration invalid' }, { status: 503 });
 }
 if (!config || config.applicationCode !== applicationCode) {
  return NextResponse.json({ error: 'Fiuu application mismatch' }, { status: 401 });
 }
 if (!verifyFiuuOpaSignature(body, config.secretKey)) {
  return NextResponse.json({ error: 'Invalid Fiuu signature' }, { status: 401 });
 }

 const statusCode = cleanProviderValue(body.statusCode, 8);
 if (statusCode !== '00') {
  return NextResponse.json({ ok: true, ignored: true, status: statusCode || 'UNKNOWN' }, { status: 202 });
 }

 const gatewayRef = cleanProviderValue(body.molTransactionId, 40);
 const currency = cleanProviderValue(body.currencyCode, 3).toUpperCase();
 const channelId = cleanProviderValue(body.channelId, 4);
 const amount = Number(body.amount);
 if (!gatewayRef || gatewayRef !== payment.gateway_ref
  || currency !== 'MYR' || channelId !== config.channelId
  || !Number.isFinite(amount)
  || Number(amount.toFixed(2)) !== Number(Number(payment.amount_rm).toFixed(2))) {
  return NextResponse.json({ error: 'Fiuu payment details mismatch' }, { status: 400 });
 }

 const { data: result, error: fulfillError } = await admin.rpc('fulfill_pos_fiuu_payment', {
  p_payment_id: payment.id,
  p_gateway_ref: gatewayRef,
  p_amount: amount,
  p_currency: currency,
  p_channel_id: channelId,
 });
 if (fulfillError) {
  console.error('[pos-fiuu] payment_fulfillment_failed', {
   paymentId: payment.id,
   reason: fulfillError.message.slice(0, 160),
  });
  return NextResponse.json({ error: 'Fiuu payment fulfillment failed' }, { status: 409 });
 }
 return NextResponse.json({ ok: true, status: 'PAID', result });
}

async function handleBillplzNotification(body: Record<string, unknown>) {
 if (!body.id || !body.collection_id) {
  return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });
 }
 if (!verifyPosBillplzSignature(body)) {
  return NextResponse.json({ error: 'Invalid POS Billplz signature' }, { status: 401 });
 }

 const service = createAdminClient();
 const gatewayRef = String(body.id);
 const paymentIdFromReference = typeof body.reference_1 === 'string' ? body.reference_1 : null;
 const paid = String(body.paid) === 'true' && String(body.state) === 'paid';
 let query = service.from('pos_online_payments').select('id, status').eq('provider', 'billplz');
 query = paymentIdFromReference ? query.eq('id', paymentIdFromReference) : query.eq('gateway_ref', gatewayRef);
 const { data: payment } = await query.maybeSingle();
 if (!payment) return NextResponse.json({ error: 'POS QR payment tidak dijumpai' }, { status: 404 });

 await service.from('pos_online_payments').update({
  status: paid ? 'PAID' : 'FAILED',
  gateway_ref: gatewayRef,
  paid_at: paid ? new Date().toISOString() : null,
  failed_at: paid ? null : new Date().toISOString(),
  updated_at: new Date().toISOString(),
 }).eq('id', payment.id);
 return NextResponse.json({ ok: true, status: paid ? 'PAID' : 'FAILED' });
}

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
  key: 'pos-qr-webhook',
  limit: 180,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const raw = await request.text();
 const body = parsePayload(raw, request.headers.get('content-type') ?? '');
 if (!body) return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });

 if (body.applicationCode || body.referenceId) {
  return handleFiuuNotification(body);
 }
 return handleBillplzNotification(body);
}
