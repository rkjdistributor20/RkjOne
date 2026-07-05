import { createHmac } from 'crypto';

export type PosBillplzConfig = {
 apiKey: string;
 collectionId: string;
 xSignatureKey: string | null;
 apiBaseUrl: string;
};

export function getPosBillplzConfig(): PosBillplzConfig | null {
 const apiKey = process.env.POS_BILLPLZ_API_KEY?.trim();
 const collectionId = process.env.POS_BILLPLZ_COLLECTION_ID?.trim();
 const xSignatureKey = process.env.POS_BILLPLZ_X_SIGNATURE_KEY?.trim() || null;
 if (!apiKey || !collectionId) return null;
 return {
 apiKey,
 collectionId,
 xSignatureKey,
 apiBaseUrl: (process.env.POS_BILLPLZ_API_BASE_URL?.trim() || 'https://www.billplz.com/api/v3').replace(/\/$/, ''),
 };
}

export async function createPosBillplzBill(input: {
 paymentId: string;
 amountRm: number;
 branchLabel: string;
 cashierName: string;
 appUrl: string;
}) {
 const config = getPosBillplzConfig();
 if (!config) throw new Error('POS Billplz belum dikonfigurasi untuk Roti Kaya Junus');

 const payload = new URLSearchParams();
 payload.set('collection_id', config.collectionId);
 payload.set('email', process.env.POS_BILLPLZ_CUSTOMER_EMAIL || 'rkjpos@rotikayajunus.com');
 payload.set('name', input.cashierName || 'Pelanggan Roti Kaya Junus');
 payload.set('amount', String(Math.round(input.amountRm * 100)));
 payload.set('description', `POS QR Roti Kaya Junus - ${input.branchLabel}`.slice(0, 200));
 payload.set('callback_url', `${input.appUrl}/api/pos/qr-payments/webhook`);
 payload.set('redirect_url', `${input.appUrl}/pos`);
 payload.set('reference_1_label', 'RKJ POS Payment ID');
 payload.set('reference_1', input.paymentId);
 payload.set('reference_2_label', 'Cawangan');
 payload.set('reference_2', input.branchLabel.slice(0, 120));

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
 const msg = typeof body?.error?.message === 'string'
 ? body.error.message
 : typeof body?.message === 'string'
 ? body.message
 : 'Billplz POS gagal cipta QR bill';
 throw new Error(msg);
 }

 return { id: String(body.id), url: String(body.url) };
}

export function verifyPosBillplzSignature(body: Record<string, unknown>): boolean {
 const key = getPosBillplzConfig()?.xSignatureKey;
 const received = String(body.x_signature ?? '');
 if (!key || !received) return false;

 const source = Object.entries(body).filter(([k]) => k !== 'x_signature').map(([k, v]) => `${k}${v == null ? '' : String(v)}`).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join('|');

 const expected = createHmac('sha256', key).update(source, 'utf8').digest('hex');
 return expected.toLowerCase() === received.toLowerCase();
}
