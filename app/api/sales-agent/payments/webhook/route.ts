import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import {
 cancelAgentPayment,
 fulfillAgentPayment,
 refundAgentPayment,
 rejectAgentPayment,
 verifyGatewayWebhookSignature,
} from '@/lib/sales-agent/payment-gateway';
import { verifyIPay88BackendSignature } from '@/lib/sales-agent/ipay88';
import { getBillplzConfig, verifyBillplzXSignature } from '@/lib/sales-agent/billplz';
import { getStripeClient, getStripeWebhookSecret } from '@/lib/sales-agent/stripe';
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
 const stripeSignature = request.headers.get('stripe-signature');

 if (stripeSignature) {
 const stripe = getStripeClient();
 const webhookSecret = getStripeWebhookSecret();
 if (!stripe || !webhookSecret) {
 return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 503 });
 }

 let event;
 try {
 event = stripe.webhooks.constructEvent(raw, stripeSignature, webhookSecret);
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Invalid Stripe signature' },
 { status: 400 });
 }

 const object = event.data.object as {
 id?: string;
 payment_intent?: string | { id?: string } | null;
 metadata?: Record<string, string>;
 client_reference_id?: string | null;
 };
 const paymentId = object.metadata?.payment_id ?? object.client_reference_id ?? null;
 const paymentIntentId =
 typeof object.payment_intent === 'string'
 ? object.payment_intent
 : object.payment_intent?.id ?? object.id ?? undefined;

 if (!paymentId) {
 return NextResponse.json({ error: 'Stripe payment_id metadata missing' }, { status: 400 });
 }

 try {
 const service = await createServiceClient();
 if (event.type === 'checkout.session.completed') {
 const result = await fulfillAgentPayment(
 service as SupabaseClient,
 paymentId,
 paymentIntentId ?? object.id ?? `STRIPE-${Date.now()}`);
 return NextResponse.json({ ok: true, status: 'PAID', result });
 }

 if (event.type === 'checkout.session.expired') {
 await cancelAgentPayment(
 service as SupabaseClient,
 paymentId,
 object.id,
 'Stripe checkout session expired');
 return NextResponse.json({ ok: true, status: 'CANCELLED' });
 }

 if (event.type === 'payment_intent.payment_failed') {
 await rejectAgentPayment(
 service as SupabaseClient,
 paymentId,
 object.id,
 'STRIPE_PAYMENT_FAILED');
 return NextResponse.json({ ok: true, status: 'FAILED' });
 }
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Stripe webhook update failed' },
 { status: 400 });
 }

 return NextResponse.json({ ok: true, ignored: event.type });
 }

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

 const normalizedStatus = String(status ?? 'FAILED').trim().toUpperCase();

 if (normalizedStatus === 'CANCELLED' || normalizedStatus === 'CANCELED') {
 try {
 const service = await createServiceClient();
 await cancelAgentPayment(
 service as SupabaseClient,
 paymentId,
 gatewayRef,
 'Gateway cancelled payment');
 return NextResponse.json({ ok: true, status: 'CANCELLED' });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Cancel failed' },
 { status: 400 });
 }
 }

 if (normalizedStatus === 'REFUNDED') {
 try {
 const service = await createServiceClient();
 await refundAgentPayment(
 service as SupabaseClient,
 paymentId,
 (body.refund_ref as string | undefined) ?? gatewayRef,
 'Gateway refund callback',
 gatewayRef);
 return NextResponse.json({ ok: true, status: 'REFUNDED' });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Refund update failed' },
 { status: 400 });
 }
 }

 if (normalizedStatus !== 'PAID') {
 try {
 const service = await createServiceClient();
 await rejectAgentPayment(
 service as SupabaseClient,
 paymentId,
 gatewayRef,
 normalizedStatus);
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
