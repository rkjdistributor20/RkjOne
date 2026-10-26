import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPosBillplzSignature } from '@/lib/pos/qr-gateway';
import {
 getFiuuOpaConfig,
 normalizeFiuuAmount,
 parseVerifiedFiuuOpaJson,
 verifyFiuuOpaSignature,
} from '@/lib/pos/fiuu';
import { FIUU_OPA_PILOT_BRANCH } from '@/lib/pos/fiuu-opa-server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import type { Json } from '@/types/database';

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readBoundedBody(request: Request): Promise<string> {
 const declaredLength = Number(request.headers.get('content-length') ?? 0);
 if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
  throw new Error('PAYLOAD_TOO_LARGE');
 }
 if (!request.body) return '';

 const reader = request.body.getReader();
 const decoder = new TextDecoder();
 let bytesRead = 0;
 let raw = '';
 while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  bytesRead += value.byteLength;
  if (bytesRead > MAX_WEBHOOK_BODY_BYTES) {
   await reader.cancel();
   throw new Error('PAYLOAD_TOO_LARGE');
  }
  raw += decoder.decode(value, { stream: true });
 }
 return raw + decoder.decode();
}

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

async function handleFiuuNotification(input: {
 body: Record<string, unknown>;
 raw: string;
 contentType: string;
 request: Request;
}) {
 const applicationCode = cleanProviderValue(input.body.applicationCode, 32);
 const referenceId = cleanProviderValue(input.body.referenceId, 40);
 if (!applicationCode || !UUID_PATTERN.test(referenceId)
  || !cleanProviderValue(input.body.signature, 128)) {
  return NextResponse.json({ error: 'Invalid Fiuu notification' }, { status: 400 });
 }

 const admin = createAdminClient();
 const { data: payment, error: paymentError } = await admin
 .from('pos_online_payments')
  .select('id, branch_id, status, provider, amount_rm, gateway_ref, sale_payload, transaction_id')
  .eq('id', referenceId)
  .eq('provider', 'fiuu')
  .maybeSingle();
 if (paymentError || !payment) {
  return NextResponse.json({ error: 'Fiuu POS payment tidak dijumpai' }, { status: 404 });
 }
 if (!isRecord(payment.sale_payload)) {
  return NextResponse.json({ error: 'Fiuu payment metadata tidak sah' }, { status: 400 });
 }

 const branchCode = cleanProviderValue(payment.sale_payload.fiuu_branch_code, 40).toUpperCase();
 const saleBranchId = cleanProviderValue(payment.sale_payload.branchId, 40).toLowerCase();
 if (branchCode !== FIUU_OPA_PILOT_BRANCH
  || saleBranchId !== payment.branch_id.toLowerCase()) {
  return NextResponse.json({ error: 'Fiuu OPA pilot branch mismatch' }, { status: 403 });
 }
 const deviceCode = cleanProviderValue(payment.sale_payload.fiuu_device_code, 40);
 let config;
 try {
  config = getFiuuOpaConfig(branchCode, deviceCode, { requireActiveMode: false });
 } catch {
  return NextResponse.json({ error: 'Fiuu configuration invalid' }, { status: 503 });
 }
 if (!config || config.applicationCode !== applicationCode) {
  return NextResponse.json({ error: 'Fiuu application mismatch' }, { status: 401 });
 }
 const applicationLimited = enforceRateLimit(input.request, {
  key: 'pos-fiuu-webhook-application',
  identity: config.applicationCode,
  limit: 600,
  windowMs: 60 * 1000,
 });
 if (applicationLimited) return applicationLimited;

 let body: Record<string, unknown>;
 try {
  body = input.contentType.includes('application/json')
   ? parseVerifiedFiuuOpaJson(input.raw, config.secretKey)
   : input.body;
 } catch {
  return NextResponse.json({ error: 'Invalid Fiuu signature' }, { status: 401 });
 }
 if (!input.contentType.includes('application/json')
  && !verifyFiuuOpaSignature(body, config.secretKey)) {
  return NextResponse.json({ error: 'Invalid Fiuu signature' }, { status: 401 });
 }
 if (cleanProviderValue(body.applicationCode, 32) !== applicationCode
  || cleanProviderValue(body.referenceId, 40) !== referenceId) {
  return NextResponse.json({ error: 'Fiuu notification mismatch' }, { status: 401 });
 }

 const statusCode = cleanProviderValue(body.statusCode, 8);
 if (statusCode !== '00') {
  return NextResponse.json({ ok: true, ignored: true, status: statusCode || 'UNKNOWN' }, { status: 202 });
 }

 const gatewayRef = cleanProviderValue(body.molTransactionId, 40);
	const storedGatewayRef = cleanProviderValue(payment.gateway_ref, 40);
 const currency = cleanProviderValue(body.currencyCode, 3).toUpperCase();
 const channelId = cleanProviderValue(body.channelId, 4);
 const rawAmount = normalizeFiuuAmount(body.amount);
 const amount = Number(rawAmount);
	if (!gatewayRef || (storedGatewayRef && gatewayRef !== storedGatewayRef)
  || currency !== 'MYR' || channelId !== config.channelId
  || !/^(?:0|[1-9]\d*)\.\d{2}$/.test(rawAmount)
  || !Number.isFinite(amount)
  || amount !== Number(payment.amount_rm)) {
  return NextResponse.json({ error: 'Fiuu payment details mismatch' }, { status: 400 });
 }

 const providerResult: Json = {
  applicationCode,
  referenceId: referenceId.toLowerCase(),
  molTransactionId: gatewayRef,
  amount: rawAmount,
  currencyCode: currency,
  channelId,
  statusCode,
  signature: cleanProviderValue(body.signature, 64).toLowerCase(),
 };
 const { data: reportResult, error: reportError } = await admin.rpc('report_pos_fiuu_payment_with_evidence', {
  p_payment_id: payment.id,
  p_gateway_ref: gatewayRef,
  p_amount: amount,
  p_currency: currency,
  p_channel_id: channelId,
  p_status_code: statusCode,
  p_provider_result: providerResult,
  p_signed_response_raw: input.raw,
 });
 if (reportError) {
  console.error('[pos-fiuu] payment_report_failed', {
   paymentId: payment.id,
   reason: reportError.message.slice(0, 160),
  });
  return NextResponse.json({ error: 'Fiuu payment report failed' }, { status: 409 });
 }

 const reportStatus = isRecord(reportResult) ? reportResult.status : null;
 if (reportStatus === 'PAID') {
  return NextResponse.json({ ok: true, status: 'PAID', replay: true, result: reportResult });
 }
 if (reportStatus !== 'REPORTED') {
  return NextResponse.json({ error: 'Fiuu payment report state invalid' }, { status: 409 });
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
  return NextResponse.json({
   error: 'Fiuu payment fulfillment failed',
   status: 'REPORTED',
  }, { status: 409 });
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
 let raw: string;
 try {
  raw = await readBoundedBody(request);
 } catch (error) {
  if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
   return NextResponse.json({ error: 'Payment payload too large' }, { status: 413 });
  }
  return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });
 }
 const contentType = request.headers.get('content-type') ?? '';
 const body = parsePayload(raw, contentType);
 if (!body) return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });

 if (body.applicationCode || body.referenceId) {
  const providerIpLimited = enforceRateLimit(request, {
   key: 'pos-fiuu-webhook-provider-ip',
   limit: 3000,
   windowMs: 60 * 1000,
  });
  if (providerIpLimited) return providerIpLimited;
  return handleFiuuNotification({ body, raw, contentType, request });
 }
 const limited = enforceRateLimit(request, {
  key: 'pos-qr-webhook-billplz',
  limit: 180,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;
 return handleBillplzNotification(body);
}
