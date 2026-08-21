import { createHash, timingSafeEqual } from 'crypto';
import type { InitiatePaymentInput } from './payment-gateway';

export type FiuuEnvironment = 'sandbox' | 'production';

export type FiuuAgentConfig = {
 environment: FiuuEnvironment;
 merchantId: string;
 verifyKey: string;
 secretKey: string;
 paymentUrl: string;
};

export type FiuuCallback = {
 amount: string;
 applicationCode: string;
 currency: string;
 merchantId: string;
 orderId: string;
 payDate: string;
 signature: string;
 status: string;
 transactionId: string;
};

function md5(value: string): string {
 return createHash('md5').update(value, 'utf8').digest('hex');
}

function secureEqual(left: string, right: string): boolean {
 const leftBuffer = Buffer.from(left.toLowerCase(), 'utf8');
 const rightBuffer = Buffer.from(right.toLowerCase(), 'utf8');
 return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizedBaseUrl(value: string): string {
 return value.replace(/\/+$/, '');
}

export function getFiuuAgentConfig(): FiuuAgentConfig | null {
 const merchantId = process.env.SALES_AGENT_FIUU_MERCHANT_ID?.trim();
 const verifyKey = process.env.SALES_AGENT_FIUU_VERIFY_KEY?.trim();
 const secretKey = process.env.SALES_AGENT_FIUU_SECRET_KEY?.trim();
 if (!merchantId || !verifyKey || !secretKey) return null;

 const environment: FiuuEnvironment =
 process.env.SALES_AGENT_FIUU_ENVIRONMENT?.trim().toLowerCase() === 'production'
 ? 'production'
 : 'sandbox';
 const defaultBase = environment === 'production'
 ? 'https://pay.fiuu.com/RMS/pay'
 : 'https://sandbox-payment.fiuu.com/RMS/pay';
 const configuredBase = process.env.SALES_AGENT_FIUU_PAYMENT_URL?.trim();
 const paymentBase = normalizedBaseUrl(configuredBase || defaultBase);
 const parsed = new URL(paymentBase);
 const permittedHost = environment === 'production' ? 'pay.fiuu.com' : 'sandbox-payment.fiuu.com';
 if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== permittedHost) {
 throw new Error('Host Hosted Payment Page Fiuu tidak dibenarkan untuk environment ini');
 }

 return {
 environment,
 merchantId,
 verifyKey,
 secretKey,
 paymentUrl: `${paymentBase}/${encodeURIComponent(merchantId)}`,
 };
}

export function buildFiuuOrderId(paymentId: string): string {
 return `RKJA${paymentId.replace(/-/g, '').slice(0, 28)}`;
}

export function buildFiuuRequestVerificationCode(input: {
 amount: string;
 currency: string;
 merchantId: string;
 orderId: string;
 verifyKey: string;
}): string {
 return md5(`${input.amount}${input.merchantId}${input.orderId}${input.verifyKey}${input.currency}`);
}

export function buildFiuuCallbackSignature(input: Omit<FiuuCallback, 'signature'> & {
 secretKey: string;
}): string {
 const preSignature = md5(
 `${input.transactionId}${input.orderId}${input.status}${input.merchantId}${input.amount}${input.currency}`,
 );
 return md5(
 `${input.payDate}${input.merchantId}${preSignature}${input.applicationCode}${input.secretKey}`,
 );
}

export function verifyFiuuCallback(
 callback: FiuuCallback,
 config: FiuuAgentConfig,
): boolean {
 if (
 callback.merchantId !== config.merchantId ||
 !callback.applicationCode ||
 !callback.signature
 ) {
 return false;
 }
 const expected = buildFiuuCallbackSignature({
 ...callback,
 secretKey: config.secretKey,
 });
 return secureEqual(callback.signature, expected);
}

function readField(body: Record<string, unknown>, ...names: string[]): string {
 for (const name of names) {
 const value = body[name];
 if (typeof value === 'string' && value.trim()) return value.trim();
 if (typeof value === 'number') return String(value);
 }
 return '';
}

export function parseFiuuCallback(body: Record<string, unknown>): FiuuCallback {
 return {
 amount: readField(body, 'amount', 'Amount'),
 applicationCode: readField(body, 'appcode', 'AppCode', 'application_code'),
 currency: readField(body, 'currency', 'Currency').toUpperCase(),
 merchantId: readField(body, 'domain', 'merchantID', 'MerchantID', 'merchant_id'),
 orderId: readField(body, 'orderid', 'orderID', 'OrderID'),
 payDate: readField(body, 'paydate', 'PayDate'),
 signature: readField(body, 'skey', 'SKey', 'signature'),
 status: readField(body, 'status', 'Status'),
 transactionId: readField(body, 'tranID', 'TranID', 'transaction_id'),
 };
}

export function buildFiuuHostedPaymentForm(
 input: InitiatePaymentInput & { appUrl: string; config: FiuuAgentConfig },
) {
 const amount = input.amountRm.toFixed(2);
 const currency = 'MYR';
 const orderId = buildFiuuOrderId(input.paymentId);
 const callbackUrl = `${input.appUrl}/api/sales-agent/payments/fiuu/webhook`;
 const returnUrl = `${input.appUrl}/api/sales-agent/payments/fiuu/return`;
 const description = input.purpose === 'POS_SUBSCRIPTION'
 ? 'Langganan POS RKJ Distributor'
 : 'Order stok ejen RKJ Distributor';

 return {
 action: input.config.paymentUrl,
 orderId,
 fields: {
 amount,
 orderid: orderId,
 bill_name: input.payerName.slice(0, 100),
 bill_email: input.payerEmail.slice(0, 100),
 bill_mobile: '',
 bill_desc: description.slice(0, 200),
 country: 'MY',
 currency,
 returnurl: returnUrl,
 callbackurl: callbackUrl,
 cancelurl: input.cancelUrl ?? input.returnUrl,
 vcode: buildFiuuRequestVerificationCode({
 amount,
 currency,
 merchantId: input.config.merchantId,
 orderId,
 verifyKey: input.config.verifyKey,
 }),
 },
 };
}
