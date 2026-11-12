export const FIUU_VT_PACKAGE = 'com.rms.mobile.razervt';
export const FIUU_VT_SCHEME = 'razervt';
export const FIUU_VT_HOST = 'merchant.razer.com';
export const RKJ_FIUU_CALLBACK_SCHEME = 'com.rkjone.staff';
export const RKJ_FIUU_CALLBACK_HOST = 'fiuu-vt.rkj.one';
export const RKJ_FIUU_CALLBACK_HOST_SUFFIX = '.fiuu-vt.rkj.one';
export const FIUU_VT_DUITNOW_CHANNEL = 'RPP_DuitNowQR-Offline';

export const FIUU_VT_PENDING_STATUSES = ['22', '33', '45'] as const;
export const FIUU_VT_TERMINAL_STATUSES = ['00', '11', '44', '55'] as const;

export type FiuuVtOperation = 'SALE' | 'STATUS' | 'VOID';
export type FiuuVtStatusCode = '00' | '11' | '22' | '33' | '44' | '45' | '55';

export type FiuuVtCallbackAttempt = {
 callbackAttemptId: string;
 callbackHost: string;
};

export type FiuuVtResult = FiuuVtCallbackAttempt & {
 opType: FiuuVtOperation;
 orderId: string;
 transactionId: string;
 status: FiuuVtStatusCode;
 amountRm: number;
 currency: 'MYR';
 channel: typeof FIUU_VT_DUITNOW_CHANNEL;
 payDate: string | null;
};

export type FiuuVtErrorResult = FiuuVtCallbackAttempt & {
 kind: 'ERROR';
 opType: FiuuVtOperation;
 orderId: string;
 errorCode: string;
 errorMessage: string;
};

export type FiuuVtCallbackResult = FiuuVtResult | FiuuVtErrorResult;

export type FiuuVtStatusDisposition = 'REPORTED' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
export type FiuuVtVoidDisposition = 'PENDING' | 'CANCELLED' | 'EXPIRED';
export type FiuuVtRecoveredPaymentStatus =
 | 'PENDING'
 | 'REPORTED'
 | 'PAID'
 | 'FAILED'
 | 'EXPIRED'
 | 'CANCELLED';

export function canFinalizeFiuuVtPayment(
 callbackDrainInProgress: boolean,
 reviewRequired: boolean,
): boolean {
 // A server-side REPORTED value is not sufficient while Android may still
 // hold a later, contradictory callback. Finalisation is allowed only after
 // that durable queue is empty and the transaction is not quarantined.
 return !callbackDrainInProgress && !reviewRequired;
}

export function canReleaseFiuuVtCallbackDrain(
 queueReadProvedEmpty: boolean,
 queueReadsInProgress: number,
 callbacksProcessing: number,
): boolean {
 return queueReadProvedEmpty
  && queueReadsInProgress === 0
  && callbacksProcessing === 0;
}

export function getRecoveredFiuuVtLocalStatus(
 serverStatus: FiuuVtRecoveredPaymentStatus,
): FiuuVtRecoveredPaymentStatus {
 // A recovered server snapshot can be older than a callback still queued in
 // Android. Keep successful-looking states pollable until a fresh native
 // queue read proves that no contradictory callback remains.
 return serverStatus === 'REPORTED' || serverStatus === 'PAID'
  ? 'PENDING'
  : serverStatus;
}

export function shouldLaunchFiuuVtStatusAfterReconcile(
 serverStatus: 'PENDING' | 'REPORTED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | null,
): boolean {
 // STATUS may only follow an authoritative RKJ PENDING response. A failed RKJ
 // request is ambiguous (auth, ownership and terminal-state failures all reach
 // the client as errors), so fail closed instead of switching the native
 // operation away from a possibly unconsumed SALE callback.
 return serverStatus === 'PENDING';
}

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const CALLBACK_ATTEMPT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CALLBACK_HOST_PATTERN = /^a-([a-f0-9]{32})\.fiuu-vt\.rkj\.one$/;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PAY_DATE_PATTERN = /^[0-9T:+.\-/ ]{6,40}$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
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

export function paymentIdFromFiuuVtOrderId(orderId: string): string | null {
 const match = /^RKJ_([A-F0-9]{32})$/.exec(orderId.trim().toUpperCase());
 if (!match) return null;
 const value = match[1];
 return [
  value.slice(0, 8),
  value.slice(8, 12),
  value.slice(12, 16),
  value.slice(16, 20),
  value.slice(20),
 ].join('-').toLowerCase();
}

export function buildFiuuVtCallbackHost(callbackAttemptId: string): string {
 const normalizedAttemptId = callbackAttemptId.trim().toLowerCase();
 if (!CALLBACK_ATTEMPT_ID_PATTERN.test(normalizedAttemptId)) {
  throw new Error('ID percubaan callback Fiuu VT tidak sah');
 }
 return `a-${normalizedAttemptId.replaceAll('-', '')}${RKJ_FIUU_CALLBACK_HOST_SUFFIX}`;
}

export function validateFiuuVtCallbackAttempt(
 callbackAttemptId: string,
 callbackHost: string,
): FiuuVtCallbackAttempt {
 const normalizedAttemptId = callbackAttemptId.trim().toLowerCase();
 const normalizedHost = callbackHost.trim().toLowerCase();
 if (!CALLBACK_ATTEMPT_ID_PATTERN.test(normalizedAttemptId)
  || !CALLBACK_HOST_PATTERN.test(normalizedHost)
  || buildFiuuVtCallbackHost(normalizedAttemptId) !== normalizedHost) {
  throw new Error('Identiti callback Fiuu VT tidak sah');
 }
 return {
  callbackAttemptId: normalizedAttemptId,
  callbackHost: normalizedHost,
 };
}

export function buildFiuuVtRequestUrl(input: {
 opType: FiuuVtOperation;
 orderId: string;
 amountRm?: number;
 callbackScheme?: string;
 callbackHost: string;
}): string {
 if (!ORDER_ID_PATTERN.test(input.orderId)) throw new Error('ID pesanan Fiuu VT tidak sah');
 if (!CALLBACK_HOST_PATTERN.test(input.callbackHost.trim().toLowerCase())) {
  throw new Error('Host callback Fiuu VT tidak sah');
 }
 const url = new URL(`${FIUU_VT_SCHEME}://${FIUU_VT_HOST}`);
 url.searchParams.set('merchantUrlScheme', input.callbackScheme ?? RKJ_FIUU_CALLBACK_SCHEME);
 url.searchParams.set('merchantHost', input.callbackHost.trim().toLowerCase());
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
 const callbackAttempt = validateFiuuVtCallbackAttempt(
  requiredString(recordValue(value, 'callbackAttemptId'), 'ID percubaan callback', 64),
  requiredString(recordValue(value, 'callbackHost'), 'host callback', 96),
 );
 const opType = requiredString(recordValue(value, 'opType', 'optype'), 'operasi', 16).toUpperCase();
 if (opType !== 'SALE' && opType !== 'STATUS' && opType !== 'VOID') {
  throw new Error('Operasi Fiuu VT tidak disokong');
 }

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
  ...callbackAttempt,
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

export function parseFiuuVtCallbackResult(input: unknown): FiuuVtCallbackResult {
 if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('Keputusan Fiuu VT tidak sah');
 }
 const value = input as Record<string, unknown>;
 const hasErrorResponse = Object.prototype.hasOwnProperty.call(value, 'errorCode')
  || Object.prototype.hasOwnProperty.call(value, 'errorMsg')
  || Object.prototype.hasOwnProperty.call(value, 'errorMessage');
 if (!hasErrorResponse) return parseFiuuVtResult(input);
 const hasTransactionResponse = [
  'status', 'tranID', 'tranId', 'transactionId', 'amount', 'amountRm',
  'currency', 'channel', 'payDate', 'paydate',
 ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
 if (hasTransactionResponse) throw new Error('Respons Fiuu VT bercampur tidak sah');

 const opType = requiredString(recordValue(value, 'opType', 'optype'), 'operasi', 16).toUpperCase();
 if (opType !== 'SALE' && opType !== 'STATUS' && opType !== 'VOID') {
  throw new Error('Operasi Fiuu VT tidak disokong');
 }

 const orderId = requiredString(recordValue(value, 'orderId', 'orderid'), 'Order ID', 64);
 if (!ORDER_ID_PATTERN.test(orderId)) throw new Error('Order ID Fiuu VT tidak sah');

 const callbackAttempt = validateFiuuVtCallbackAttempt(
  requiredString(recordValue(value, 'callbackAttemptId'), 'ID percubaan callback', 64),
  requiredString(recordValue(value, 'callbackHost'), 'host callback', 96),
 );

 const errorCode = requiredString(recordValue(value, 'errorCode'), 'kod ralat', 32);
 if (!ERROR_CODE_PATTERN.test(errorCode)) throw new Error('Kod ralat Fiuu VT tidak sah');

 const errorMessage = requiredString(
  recordValue(value, 'errorMsg', 'errorMessage'),
  'mesej ralat',
  160,
 );
 if (CONTROL_CHARACTER_PATTERN.test(errorMessage)) {
  throw new Error('Mesej ralat Fiuu VT tidak sah');
 }

 return {
  ...callbackAttempt,
  kind: 'ERROR',
  opType,
  orderId,
  errorCode,
  errorMessage,
 };
}

export function isFiuuVtErrorResult(
 result: FiuuVtCallbackResult,
): result is FiuuVtErrorResult {
 return 'kind' in result && result.kind === 'ERROR';
}

export function isFiuuVtPendingStatus(status: FiuuVtStatusCode): boolean {
 return (FIUU_VT_PENDING_STATUSES as readonly string[]).includes(status);
}

export function getFiuuVtStatusDisposition(
 status: FiuuVtStatusCode,
): FiuuVtStatusDisposition {
 if (status === '00') return 'REPORTED';
 if (status === '11') return 'FAILED';
 if (status === '44') return 'CANCELLED';
 // Fiuu VT App-to-App v1.2 defines 55 as "QR expired". Treating it as
 // pending leaves the cashier locked even though the provider has already
 // closed the QR and no longer accepts a payment for it.
 if (status === '55') return 'EXPIRED';
 return 'PENDING';
}

/**
 * VOID responses are cancellation evidence, never payment-success evidence.
 * Fiuu App-to-App v1.2 reports 44 after a completed cancellation and 55 when
 * the QR has already expired. Every other response must be reconciled with a
 * fresh STATUS request so an ambiguous VOID can never mark a sale as paid.
 */
export function getFiuuVtVoidDisposition(
 status: FiuuVtStatusCode,
): FiuuVtVoidDisposition {
 if (status === '44') return 'CANCELLED';
 if (status === '55') return 'EXPIRED';
 return 'PENDING';
}
