export const FIUU_VT_PACKAGE = 'com.rms.mobile.razervt';
export const FIUU_VT_SCHEME = 'razervt';
export const FIUU_VT_HOST = 'merchant.razer.com';
export const RKJ_FIUU_CALLBACK_SCHEME = 'com.rkjone.staff';
export const RKJ_FIUU_CALLBACK_HOST = 'fiuu-vt.rkj.one';
export const FIUU_VT_DUITNOW_CHANNEL = 'RPP_DuitNowQR-Offline';

export const FIUU_VT_PENDING_STATUSES = ['22', '33', '45'] as const;
export const FIUU_VT_TERMINAL_STATUSES = ['00', '11', '44', '55'] as const;

export type FiuuVtOperation = 'SALE' | 'STATUS';
export type FiuuVtStatusCode = '00' | '11' | '22' | '33' | '44' | '45' | '55';

export type FiuuVtResult = {
 opType: FiuuVtOperation;
 orderId: string;
 transactionId: string;
 status: FiuuVtStatusCode;
 amountRm: number;
 currency: 'MYR';
 channel: typeof FIUU_VT_DUITNOW_CHANNEL;
 payDate: string | null;
};

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PAY_DATE_PATTERN = /^[0-9T:+.\-/ ]{6,40}$/;
const STATUS_CODES = new Set<FiuuVtStatusCode>([
 '00', '11', '22', '33', '44', '45', '55',
]);

function recordValue(input: Record<string, unknown>, ...keys: string[]): unknown {
 for (const key of keys) {
  if (Object.prototype.hasOwnProperty.call(input, key)) return input[key];
 }
 return undefined;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
 if (typeof value !== 'string') throw new Error(`Keputusan Fiuu VT tiada ${label}`);
 const normalized = value.trim();
 if (!normalized || normalized.length > maxLength) {
  throw new Error(`Keputusan Fiuu VT ${label} tidak sah`);
 }
 return normalized;
}

export function normalizeFiuuVtAmount(value: number): string {
 if (!Number.isFinite(value) || value <= 0 || value > 999_999.99) {
  throw new Error('Amaun Fiuu VT tidak sah');
 }
 return value.toFixed(2);
}

export function buildFiuuVtOrderId(paymentId: string): string {
 const normalized = paymentId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
 const orderId = `RKJ_${normalized}`.slice(0, 64);
 if (!ORDER_ID_PATTERN.test(orderId)) throw new Error('ID pesanan Fiuu VT tidak sah');
 return orderId;
}

export function buildFiuuVtRequestUrl(input: {
 opType: FiuuVtOperation;
 orderId: string;
 amountRm?: number;
 callbackScheme?: string;
}): string {
 if (!ORDER_ID_PATTERN.test(input.orderId)) throw new Error('ID pesanan Fiuu VT tidak sah');
 const url = new URL(`${FIUU_VT_SCHEME}://${FIUU_VT_HOST}`);
 url.searchParams.set('merchantUrlScheme', input.callbackScheme ?? RKJ_FIUU_CALLBACK_SCHEME);
 url.searchParams.set('merchantHost', RKJ_FIUU_CALLBACK_HOST);
 url.searchParams.set('opType', input.opType);
 url.searchParams.set('orderId', input.orderId);
 if (input.opType === 'SALE') {
  if (input.amountRm === undefined) throw new Error('Amaun SALE Fiuu VT diperlukan');
  url.searchParams.set('currency', 'MYR');
  url.searchParams.set('amount', normalizeFiuuVtAmount(input.amountRm));
  url.searchParams.set('channel', FIUU_VT_DUITNOW_CHANNEL);
  url.searchParams.set('payType', '2');
 }
 return url.toString();
}

export function parseFiuuVtResult(input: unknown): FiuuVtResult {
 if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('Keputusan Fiuu VT tidak sah');
 }
 const value = input as Record<string, unknown>;
 const opType = requiredString(recordValue(value, 'opType', 'optype'), 'operasi', 16).toUpperCase();
 if (opType !== 'SALE' && opType !== 'STATUS') throw new Error('Operasi Fiuu VT tidak disokong');

 const orderId = requiredString(recordValue(value, 'orderId', 'orderid'), 'Order ID', 64);
 if (!ORDER_ID_PATTERN.test(orderId)) throw new Error('Order ID Fiuu VT tidak sah');

 const status = requiredString(recordValue(value, 'status'), 'status', 2) as FiuuVtStatusCode;
 if (!STATUS_CODES.has(status)) throw new Error('Status Fiuu VT tidak dikenali');

 const rawAmount = recordValue(value, 'amount', 'amountRm');
 const amountText = typeof rawAmount === 'number'
  ? rawAmount.toString()
  : requiredString(rawAmount, 'amaun', 20);
 if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) throw new Error('Amaun Fiuu VT tidak sah');
 const amountRm = Number(amountText);
 if (!Number.isFinite(amountRm) || amountRm <= 0) throw new Error('Amaun Fiuu VT tidak sah');

 const currency = requiredString(recordValue(value, 'currency'), 'mata wang', 8).toUpperCase();
 if (currency !== 'MYR') throw new Error('Mata wang Fiuu VT tidak sah');
 const channel = requiredString(recordValue(value, 'channel'), 'saluran', 64);
 if (channel !== FIUU_VT_DUITNOW_CHANNEL) throw new Error('Saluran Fiuu VT tidak sah');

 const transactionId = requiredString(recordValue(value, 'tranID', 'tranId', 'transactionId'), 'Transaction ID', 80);
 if (!TRANSACTION_ID_PATTERN.test(transactionId)) throw new Error('Transaction ID Fiuu VT tidak sah');

 const rawPayDate = recordValue(value, 'payDate', 'paydate');
 const payDate = rawPayDate === undefined || rawPayDate === null || rawPayDate === ''
  ? null
  : requiredString(rawPayDate, 'tarikh bayaran', 40);
 if (payDate && !PAY_DATE_PATTERN.test(payDate)) throw new Error('Tarikh bayaran Fiuu VT tidak sah');

 return {
  opType,
  orderId,
  transactionId,
  status,
  amountRm: Number(amountRm.toFixed(2)),
  currency: 'MYR',
  channel: FIUU_VT_DUITNOW_CHANNEL,
  payDate,
 };
}

export function isFiuuVtPendingStatus(status: FiuuVtStatusCode): boolean {
 return (FIUU_VT_PENDING_STATUSES as readonly string[]).includes(status);
}
