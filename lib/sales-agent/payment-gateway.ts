import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnlinePaymentMethod } from './types';

export type PaymentGatewayMode = 'simulate' | 'live';

export type InitiatePaymentInput = {
  paymentId: string;
  amountRm: number;
  method: OnlinePaymentMethod;
  purpose: 'STOCK_ORDER' | 'POS_SUBSCRIPTION';
  payerEmail: string;
  payerName: string;
  returnUrl: string;
};

export type InitiatePaymentResult = {
  mode: PaymentGatewayMode;
  payment_id: string;
  /** UAT/simulate: null — client panggil /payments/confirm */
  checkout_url: string | null;
  gateway_session_id: string | null;
};

export function getPaymentGatewayMode(): PaymentGatewayMode {
  const mode = process.env.SALES_AGENT_PAYMENT_MODE?.trim().toLowerCase();
  return mode === 'live' ? 'live' : 'simulate';
}

export function isLivePaymentGatewayConfigured(): boolean {
  return Boolean(
    process.env.SALES_AGENT_PAYMENT_API_KEY?.trim() &&
      process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim()
  );
}

/**
 * Live mode — sambung iPay88 / Stripe / Billplz di sini.
 * Set SALES_AGENT_PAYMENT_MODE=live + merchant keys dalam Vercel.
 */
export async function initiateAgentPayment(
  input: InitiatePaymentInput
): Promise<InitiatePaymentResult> {
  const mode = getPaymentGatewayMode();

  if (mode === 'simulate' || !isLivePaymentGatewayConfigured()) {
    return {
      mode: 'simulate',
      payment_id: input.paymentId,
      checkout_url: null,
      gateway_session_id: null,
    };
  }

  const sessionId = `RKJ-LIVE-${input.paymentId.slice(0, 8)}-${Date.now()}`;
  const baseUrl = process.env.SALES_AGENT_PAYMENT_GATEWAY_URL?.trim() ?? 'https://payment.rkjdistributor.com.my/checkout';
  const checkoutUrl = new URL(baseUrl);
  checkoutUrl.searchParams.set('session', sessionId);
  checkoutUrl.searchParams.set('amount', String(input.amountRm));
  checkoutUrl.searchParams.set('method', input.method);
  checkoutUrl.searchParams.set('return', input.returnUrl);

  return {
    mode: 'live',
    payment_id: input.paymentId,
    checkout_url: checkoutUrl.toString(),
    gateway_session_id: sessionId,
  };
}

export async function fulfillAgentPayment(
  service: SupabaseClient,
  paymentId: string,
  gatewayRef: string
) {
  const { data, error } = await service.rpc('confirm_agent_payment_and_fulfill', {
    p_payment_id: paymentId,
    p_gateway_ref: gatewayRef,
  } as never);

  if (error) throw new Error(error.message);
  return data;
}

export function verifyGatewayWebhookSignature(
  _payload: string,
  signature: string | null
): boolean {
  const secret = process.env.SALES_AGENT_PAYMENT_WEBHOOK_SECRET?.trim();
  if (!secret) return getPaymentGatewayMode() === 'simulate';
  if (!signature) return false;
  return signature === secret;
}
