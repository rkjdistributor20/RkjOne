import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { fulfillAgentPayment, rejectAgentPayment } from '@/lib/sales-agent/payment-gateway';
import { getFiuuAgentConfig, parseFiuuCallback, verifyFiuuCallback } from '@/lib/sales-agent/fiuu';
import { enforceRateLimit } from '@/lib/security/rate-limit';

function amountInCents(value: string): number | null {
 if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
 const amount = Number(value);
 if (!Number.isFinite(amount) || amount <= 0) return null;
 return Math.round(amount * 100);
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown>> {
 const contentType = request.headers.get('content-type') ?? '';
 const raw = await request.text();
 if (contentType.includes('application/json')) {
 return raw ? JSON.parse(raw) as Record<string, unknown> : {};
 }
 return Object.fromEntries(new URLSearchParams(raw));
}

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'sales-agent-fiuu-webhook',
 limit: 180,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const config = getFiuuAgentConfig();
 if (!config) return new NextResponse('Not configured', { status: 503 });

 let body: Record<string, unknown>;
 try {
 body = await parseRequestBody(request);
 } catch {
 return new NextResponse('Invalid request', { status: 400 });
 }
 const callback = parseFiuuCallback(body);
 if (!verifyFiuuCallback(callback, config)) {
 console.warn('[sales-agent-fiuu] callback rejected', {
 source: 'fiuu',
 reason: 'signature_or_merchant_mismatch',
 });
 return new NextResponse('Invalid signature', { status: 401 });
 }
 if (!callback.orderId || callback.currency !== 'MYR') {
 return new NextResponse('Invalid payment identity', { status: 400 });
 }

 const service = await createServiceClient();
 const { data: payment, error } = await (service as SupabaseClient)
 .from('agent_online_payments')
 .select('id, amount_rm, status, provider, gateway_session_id, gateway_ref')
 .eq('provider', 'fiuu')
 .eq('gateway_session_id', callback.orderId)
 .maybeSingle();
 if (error || !payment) {
 console.warn('[sales-agent-fiuu] callback rejected', {
 source: 'fiuu',
 reason: 'payment_not_found',
 });
 return new NextResponse('Payment not found', { status: 404 });
 }

 const callbackCents = amountInCents(callback.amount);
 const expectedCents = Math.round(Number(payment.amount_rm) * 100);
 if (callbackCents === null || callbackCents !== expectedCents) {
 console.warn('[sales-agent-fiuu] callback rejected', {
 source: 'fiuu',
 reason: 'amount_mismatch',
 payment_id: payment.id,
 });
 return new NextResponse('Amount mismatch', { status: 409 });
 }

 if (callback.status === '22') {
 return new NextResponse('OK', { status: 200 });
 }

 if (callback.status !== '00') {
 try {
 await rejectAgentPayment(
 service as SupabaseClient,
 String(payment.id),
 callback.transactionId || undefined,
 `FIUU_STATUS_${callback.status || 'UNKNOWN'}`,
 );
 } catch (failureError) {
 console.error('[sales-agent-fiuu] failure update failed', {
 source: 'fiuu',
 payment_id: payment.id,
 error: failureError instanceof Error ? failureError.message : 'unknown_error',
 });
 return new NextResponse('Update failed', { status: 500 });
 }
 return new NextResponse('OK', { status: 200 });
 }

 if (!callback.transactionId) {
 return new NextResponse('Transaction reference required', { status: 400 });
 }
 if (payment.gateway_ref && payment.gateway_ref !== callback.transactionId) {
 return new NextResponse('Transaction reference mismatch', { status: 409 });
 }

 try {
 await fulfillAgentPayment(
 service as SupabaseClient,
 String(payment.id),
 callback.transactionId,
 );
 return new NextResponse('OK', { status: 200 });
 } catch (fulfillError) {
 console.error('[sales-agent-fiuu] fulfillment failed', {
 source: 'fiuu',
 payment_id: payment.id,
 error: fulfillError instanceof Error ? fulfillError.message : 'unknown_error',
 });
 return new NextResponse('Fulfillment failed', { status: 500 });
 }
}

