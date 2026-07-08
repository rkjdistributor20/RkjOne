import Stripe from 'stripe';
import type { InitiatePaymentInput } from './payment-gateway';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
 const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
 if (!secretKey) return null;
 if (!stripeClient) {
 stripeClient = new Stripe(secretKey, { typescript: true });
 }
 return stripeClient;
}

export function getStripeWebhookSecret() {
 return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export async function createStripeCheckoutSession(
 input: InitiatePaymentInput & { appUrl: string }) {
 const stripe = getStripeClient();
 if (!stripe) throw new Error('Stripe belum dikonfigurasi - set STRIPE_SECRET_KEY');

 const amountSen = Math.round(input.amountRm * 100);
 const description =
 input.purpose === 'POS_SUBSCRIPTION'
 ? 'Langganan POS RKJ Distributor'
 : 'Order stok ejen RKJ Distributor';
 const paymentMethodTypes =
 input.method === 'FPX'
 ? (['fpx'] satisfies Stripe.Checkout.SessionCreateParams.PaymentMethodType[])
 : (['card'] satisfies Stripe.Checkout.SessionCreateParams.PaymentMethodType[]);

 const session = await stripe.checkout.sessions.create({
 mode: 'payment',
 payment_method_types: paymentMethodTypes,
 client_reference_id: input.paymentId,
 line_items: [
 {
 price_data: {
 currency: 'myr',
 unit_amount: amountSen,
 product_data: {
 name: description,
 metadata: {
 payment_id: input.paymentId,
 purpose: input.purpose,
 },
 },
 },
 quantity: 1,
 },
 ],
 metadata: {
 payment_id: input.paymentId,
 purpose: input.purpose,
 },
 payment_intent_data: {
 metadata: {
 payment_id: input.paymentId,
 purpose: input.purpose,
 },
 },
 success_url: input.returnUrl,
 cancel_url: input.cancelUrl ?? `${input.appUrl}/sales-agent/payment-return?payment=${input.paymentId}`,
 });

 if (!session.url) throw new Error('Stripe session tidak pulangkan checkout URL');

 return {
 id: session.id,
 url: session.url,
 paymentIntentId:
 typeof session.payment_intent === 'string'
 ? session.payment_intent
 : session.payment_intent?.id ?? null,
 };
}
