import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import type { OnlinePaymentMethod } from './types';
import { getIPay88Config } from './ipay88';
import { createBillplzBill, getBillplzConfig } from './billplz';
import { createStripeCheckoutSession, getStripeClient } from './stripe';

export type PaymentGatewayMode = 'simulate' | 'live';
export type PaymentGatewayProvider = 'simulate' | 'billplz' | 'ipay88' | 'stripe' | 'custom';

export type InitiatePaymentInput = {
 paymentId: string;
 amountRm: number;
 method: OnlinePaymentMethod;
 purpose: 'STOCK_ORDER' | 'POS_SUBSCRIPTION';
 payerEmail: string;
 payerName: string;
 returnUrl: string;
 cancelUrl?: string;
};

export type InitiatePaymentResult = {
 mode: PaymentGatewayMode;
 provider: PaymentGatewayProvider;
 payment_id: string;
 /** UAT/simulate: null - client panggil /payments/confirm */
 checkout_url: string | null;
 gateway_session_id: string | null;
};

export function getPaymentProvider(): string {
 return process.env.SALES_AGENT_PAYMENT_PROVIDER?.trim().toLowerCase() || 'ipay88';
}

export function isLivePaymentGatewayConfigured(): boolean {
 const provider = getPaymentProvider();
 if (provider === 'billplz') return Boolean(getBillplzConfig());
 if (provider === 'stripe') return Boolean(getStripeClient());
 return Boolean(
 process.env.SALES_AGENT_PAYMENT_API_KEY?.trim() &&
 process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim());
}

/** Env eksplisit - `simulate` atau `live`. */
export function getPaymentGatewayMode(): PaymentGatewayMode {
 const mode = process.env.SALES_AGENT_PAYMENT_MODE?.trim().toLowerCase();
 if (mode === 'simulate') return 'simulate';
 return 'live';
}

/**
 * Mod sebenar runtime: live hanya bila credential provider wujud.
 * Tanpa credential -> simulate sementara (UAT/pilot sebelum go-live FPX).
 */
export function getEffectivePaymentMode(): PaymentGatewayMode {
 if (getPaymentGatewayMode() === 'simulate') return 'simulate';
 if (!isLivePaymentGatewayConfigured()) return 'simulate';
 return 'live';
}

export function isSimulatePaymentAllowed(): boolean {
 return getEffectivePaymentMode() === 'simulate';
}

/**
 * Live mode - Billplz/iPay88 FPX/kad ke akaun merchant RKJ Distributor.
 * Pengesahan provider/webhook wajib sebelum order/langganan aktif.
 */
export async function initiateAgentPayment(
 input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
 const mode = getEffectivePaymentMode();

 if (mode === 'simulate') {
 return {
 mode: 'simulate',
 provider: 'simulate',
 payment_id: input.paymentId,
 checkout_url: null,
 gateway_session_id: null,
 };
 }

 const sessionId = `RKJ-LIVE-${input.paymentId.slice(0, 8)}-${Date.now()}`;
 const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rkj.one';
 const provider = getPaymentProvider();

 if (provider === 'billplz') {
 const bill = await createBillplzBill({...input, appUrl });
 return {
 mode: 'live',
 provider: 'billplz',
 payment_id: input.paymentId,
 checkout_url: bill.url,
 gateway_session_id: bill.id,
 };
 }

 if (provider === 'stripe') {
 const session = await createStripeCheckoutSession({...input, appUrl });
 return {
 mode: 'live',
 provider: 'stripe',
 payment_id: input.paymentId,
 checkout_url: session.url,
 gateway_session_id: session.id,
 };
 }

 if (provider === 'ipay88' && getIPay88Config(appUrl)) {
 return {
 mode: 'live',
 provider: 'ipay88',
 payment_id: input.paymentId,
 checkout_url: `${appUrl}/sales-agent/checkout?payment=${input.paymentId}`,
 gateway_session_id: sessionId,
 };
 }

 const baseUrl = process.env.SALES_AGENT_PAYMENT_GATEWAY_URL?.trim() ?? 'https://payment.rkjdistributor.com.my/checkout';
 const checkoutUrl = new URL(baseUrl);
 checkoutUrl.searchParams.set('session', sessionId);
 checkoutUrl.searchParams.set('amount', String(input.amountRm));
 checkoutUrl.searchParams.set('method', input.method);
 checkoutUrl.searchParams.set('return', input.returnUrl);

 return {
 mode: 'live',
 provider: 'custom',
 payment_id: input.paymentId,
 checkout_url: checkoutUrl.toString(),
 gateway_session_id: sessionId,
 };
}

export async function fulfillAgentPayment(
 service: SupabaseClient,
 paymentId: string,
 gatewayRef: string) {
 const { data, error } = await service.rpc('confirm_agent_payment_and_fulfill', {
 p_payment_id: paymentId,
 p_gateway_ref: gatewayRef,
 } as never);

 if (error) throw new Error(error.message);
 return data;
}

export async function rejectAgentPayment(
 service: SupabaseClient,
 paymentId: string,
 gatewayRef?: string,
 reason?: string) {
 const { data, error } = await service.rpc('fail_agent_payment', {
 p_payment_id: paymentId,
 p_gateway_ref: gatewayRef ?? null,
 p_reason: reason ?? null,
 } as never);

 if (error) throw new Error(error.message);
 return data;
}

export async function cancelAgentPayment(
 service: SupabaseClient,
 paymentId: string,
 gatewayRef?: string,
 reason?: string) {
 const { data, error } = await service.rpc('cancel_agent_payment', {
 p_payment_id: paymentId,
 p_gateway_ref: gatewayRef ?? null,
 p_reason: reason ?? null,
 } as never);

 if (error) throw new Error(error.message);
 return data;
}

export async function refundAgentPayment(
 service: SupabaseClient,
 paymentId: string,
 refundRef?: string,
 reason?: string,
 gatewayRef?: string) {
 const { data, error } = await service.rpc('refund_agent_payment', {
 p_payment_id: paymentId,
 p_refund_ref: refundRef ?? null,
 p_reason: reason ?? null,
 p_gateway_ref: gatewayRef ?? null,
 } as never);

 if (error) throw new Error(error.message);
 return data;
}

export async function expireAgentSubscriptions(
 service: SupabaseClient,
 organizationId?: string) {
 const { data, error } = await service.rpc('expire_agent_subscriptions', {
 p_org_id: organizationId ?? null,
 } as never);

 if (error) throw new Error(error.message);
 return Number(data ?? 0);
}

function secureStringEqual(left: string, right: string): boolean {
 const leftBuffer = Buffer.from(left);
 const rightBuffer = Buffer.from(right);
 return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyGatewayWebhookSignature(
 payload: string,
 signature: string | null): boolean {
 const secret = process.env.SALES_AGENT_PAYMENT_WEBHOOK_SECRET?.trim();
 const allowUnsignedDevWebhook =
 process.env.NODE_ENV !== 'production' &&
 process.env.ALLOW_UNSIGNED_PAYMENT_WEBHOOKS === 'true' &&
 getPaymentGatewayMode() === 'simulate';

 if (!secret) return allowUnsignedDevWebhook;
 if (!signature) return false;

 const incomingSignature = signature.trim();
 const expectedHmac = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
 const normalizedSignature = incomingSignature.startsWith('sha256=')
 ? incomingSignature.slice('sha256='.length)
 : incomingSignature;

 return (
 secureStringEqual(normalizedSignature, expectedHmac) ||
 secureStringEqual(incomingSignature, secret)
 );
}
