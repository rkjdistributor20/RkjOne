import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { fulfillAgentPayment, rejectAgentPayment, verifyGatewayWebhookSignature } from '@/lib/sales-agent/payment-gateway';
import { verifyIPay88BackendSignature } from '@/lib/sales-agent/ipay88';
import { getBillplzConfig, verifyBillplzXSignature } from '@/lib/sales-agent/billplz';
import { enforceRateLimit } from '@/lib/security/rate-limit';

/**
 * Webhook gateway bayaran (Billplz callback / iPay88 BackendURL / manual JSON).
 */
export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'sales-agent-payment-webhook',
 limit: 180,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const contentType = request.headers.get('content-type') ?? '';
 const raw = await request.text();

 let body: Record<string, unknown> = {};
 if (contentType.includes('application/json')) {
 try {
 body = raw ? JSON.parse(raw) : {};
 } catch {
 return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
 }
 } else {
 body = Object.fromEntries(new URLSearchParams(raw));
 }

 const provider = process.env.SALES_AGENT_PAYMENT_PROVIDER?.trim().toLowerCase() ?? 'ipay88';
 const merchantKey = process.env.SALES_AGENT_PAYMENT_API_KEY?.trim();
 const merchantCode = process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim();

 let paymentId = body.payment_id as string | undefined;
 let gatewayRef = (body.gateway_ref as string) ?? (body.TransId as string) ?? `GW-${Date.now()}`;
 let status = body.status as string | undefined;

 if (provider === 'billplz' && body.id && body.collection_id) {
 const config = getBillplzConfig();
 if (!verifyBillplzXSignature(body, config?.xSignatureKey)) {
 return NextResponse.json({ error: 'Invalid Billplz signature' }, { status: 401 });
 }

 const service = await createServiceClient();
 gatewayRef = String(body.id);
 status = String(body.paid) === 'true' && String(body.state) === 'paid' ? 'PAID' : 'FAILED';
 paymentId = typeof body.reference_1 === 'string' && body.reference_1 ? body.reference_1 : undefined;

 if (!paymentId) {
 const { data: paymentRow } = await (service as SupabaseClient).from('agent_online_payments').select('id').eq('gateway_ref', gatewayRef).maybeSingle();
 paymentId = paymentRow?.id as string | undefined;
 }
 } else if (provider === 'ipay88' && body.RefNo && merchantKey && merchantCode) {
 const ipayStatus = String(body.Status ?? '');
 const signature = String(body.Signature ?? '');
 const valid = verifyIPay88BackendSignature({
 merchantKey,
 merchantCode,
 paymentId: String(body.PaymentId ?? ''),
 refNo: String(body.RefNo),
 amountSen: String(body.Amount ?? ''),
 currency: String(body.Currency ?? 'MYR'),
 status: ipayStatus,
 signature,
 });
 if (!valid) {
 return NextResponse.json({ error: 'Invalid iPay88 signature' }, { status: 401 });
 }
 status = ipayStatus === '1' ? 'PAID' : 'FAILED';
 gatewayRef = String(body.TransId ?? gatewayRef);
 paymentId = String(body.Remark ?? body.RefNo);
 } else {
 const signature = request.headers.get('x-rkj-payment-signature');
 if (!verifyGatewayWebhookSignature(raw, signature)) {
 return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
 }
 }

 if (!paymentId) {
 return NextResponse.json({ error: 'payment_id required' }, { status: 400 });
 }

 if (status !== 'PAID') {
 try {
 const service = await createServiceClient();
 await rejectAgentPayment(
 service as SupabaseClient,
 paymentId,
 gatewayRef,
 status ?? 'FAILED');
 return NextResponse.json({ ok: true, status: 'FAILED' });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Reject failed' },
 { status: 400 });
 }
 }

 try {
 const service = await createServiceClient();
 const result = await fulfillAgentPayment(service as SupabaseClient, paymentId, gatewayRef);
 return NextResponse.json({ ok: true, result });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Fulfill failed' },
 { status: 400 });
 }
}
