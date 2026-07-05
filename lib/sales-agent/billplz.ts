import { createHmac } from 'crypto';
import type { InitiatePaymentInput } from './payment-gateway';

export type BillplzConfig = {
 apiKey: string;
 collectionId: string;
 xSignatureKey: string | null;
 apiBaseUrl: string;
};

export type BillplzBill = {
 id: string;
 url: string;
 state?: string;
 paid?: boolean;
};

export function getBillplzConfig(): BillplzConfig | null {
 const apiKey = process.env.BILLPLZ_API_KEY?.trim() || process.env.SALES_AGENT_PAYMENT_API_KEY?.trim();
 const collectionId =
 process.env.BILLPLZ_COLLECTION_ID?.trim() || process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim();
 const xSignatureKey =
 process.env.BILLPLZ_X_SIGNATURE_KEY?.trim() || process.env.SALES_AGENT_PAYMENT_WEBHOOK_SECRET?.trim() || null;
 if (!apiKey || !collectionId) return null;

 const apiBaseUrl =
 process.env.BILLPLZ_API_BASE_URL?.trim() ||
 process.env.SALES_AGENT_PAYMENT_GATEWAY_URL?.trim() ||
 'https://www.billplz.com/api/v3';

 return { apiKey, collectionId, xSignatureKey, apiBaseUrl: apiBaseUrl.replace(/\/$/, '') };
}

export async function createBillplzBill(input: InitiatePaymentInput & { appUrl: string }): Promise<BillplzBill> {
 const config = getBillplzConfig();
 if (!config) throw new Error('Billplz belum dikonfigurasi - set API key dan Collection ID');

 const amountSen = Math.round(input.amountRm * 100);
 const description = input.purpose === 'POS_SUBSCRIPTION'
 ? 'Langganan POS RKJ Distributor'
 : 'Order stok ejen RKJ Distributor';

 const payload = new URLSearchParams();
 payload.set('collection_id', config.collectionId);
 payload.set('email', input.payerEmail || 'rkjdistributor20@gmail.com');
 payload.set('name', input.payerName || 'Ejen RKJ');
 payload.set('amount', String(amountSen));
 payload.set('description', description);
 payload.set('callback_url', `${input.appUrl}/api/sales-agent/payments/webhook`);
 payload.set('redirect_url', input.returnUrl);
 payload.set('reference_1_label', 'RKJ Payment ID');
 payload.set('reference_1', input.paymentId);
 payload.set('reference_2_label', 'Tujuan');
 payload.set('reference_2', input.purpose);

 const res = await fetch(`${config.apiBaseUrl}/bills`, {
 method: 'POST',
 headers: {
 Authorization: `Basic ${Buffer.from(`${config.apiKey}:`).toString('base64')}`,
 'Content-Type': 'application/x-www-form-urlencoded',
 },
 body: payload,
 });

 const body = await res.json().catch(() => ({}));
 if (!res.ok) {
 const message = typeof body?.error?.message === 'string'
 ? body.error.message
 : typeof body?.message === 'string'
 ? body.message
 : 'Billplz gagal cipta bill';
 throw new Error(message);
 }

 if (!body?.id || !body?.url) throw new Error('Respons Billplz tidak lengkap');
 return { id: String(body.id), url: String(body.url), state: body.state, paid: Boolean(body.paid) };
}

export function verifyBillplzXSignature(body: Record<string, unknown>, xSignatureKey?: string | null): boolean {
 const key = xSignatureKey ?? getBillplzConfig()?.xSignatureKey;
 const received = String(body.x_signature ?? '');
 if (!key || !received) return false;

 const source = Object.entries(body).filter(([k]) => k !== 'x_signature').map(([k, v]) => `${k}${v == null ? '' : String(v)}`).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join('|');

 const expected = createHmac('sha256', key).update(source, 'utf8').digest('hex');
 return expected.toLowerCase() === received.toLowerCase();
}
