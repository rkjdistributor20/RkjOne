import { createHmac, timingSafeEqual } from 'node:crypto';

const FIUU_DUITNOW_QR_CHANNEL_ID = '24';
const FIUU_SANDBOX_PRECREATE_URL = 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php';
const FIUU_PRODUCTION_PRECREATE_URL = 'https://opa.fiuu.com/RMS/API/MOLOPA/precreate.php';
const FIUU_SANDBOX_INQUIRY_URL = 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/inquiry.php';
const FIUU_PRODUCTION_INQUIRY_URL = 'https://api.fiuu.com/RMS/API/MOLOPA/inquiry.php';
const FIUU_SANDBOX_REVERSAL_URL = 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/reversal.php';
const FIUU_PRODUCTION_REVERSAL_URL = 'https://api.fiuu.com/RMS/API/MOLOPA/reversal.php';
export const FIUU_CALLBACK_GRACE_MS = 20 * 60 * 1000;

export function isFiuuReconciliationExpired(expiresAt: string, nowMs = Date.now()): boolean {
  const expiryMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiryMs) && expiryMs + FIUU_CALLBACK_GRACE_MS <= nowMs;
}

type FiuuEnvironment = 'sandbox' | 'production';

type FiuuApplicationEntry = {
  applicationCode: string;
  secretKey: string;
  storeId?: string;
  terminalId?: string;
};

export type FiuuOpaConfig = {
  applicationCode: string;
  secretKey: string;
  storeId: string;
  terminalId: string;
  channelId: '24';
  environment: FiuuEnvironment;
  precreateUrl: string;
  inquiryUrl: string;
  reversalUrl: string;
  validitySeconds: number;
};

export type FiuuDynamicQrResult = {
  gatewayReference: string;
  qrImageUrl: string;
  authorizationCode: string;
  expiresAt: string;
};

export class FiuuOpaPrecreateError extends Error {
  readonly definitiveRejection: boolean;
  readonly httpStatus: number | null;

  constructor(
    message: string,
    definitiveRejection: boolean,
    httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'FiuuOpaPrecreateError';
    this.definitiveRejection = definitiveRejection;
    this.httpStatus = httpStatus;
  }
}

export function isFiuuOpaDefinitiveRejection(error: unknown): boolean {
  return error instanceof FiuuOpaPrecreateError && error.definitiveRejection;
}

export function isFiuuOpaApplicationUnavailable(error: unknown): boolean {
  return error instanceof FiuuOpaPrecreateError && error.httpStatus === 404;
}

type FiuuResponse = Record<string, unknown> & {
  applicationCode?: unknown;
  referenceId?: unknown;
  amount?: unknown;
  currencyCode?: unknown;
  channelId?: unknown;
  molTransactionId?: unknown;
  authorizationCode?: unknown;
  ImageUrl?: unknown;
  ImageUrlBig?: unknown;
  customImageURL?: unknown;
  statusCode?: unknown;
  errorCode?: unknown;
  signature?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`Respons Fiuu tiada ${label}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`Respons Fiuu ${label} tidak sah`);
  }
  return normalized;
}

function normalizeIdentifier(value: string, prefix: string): string {
  const cleaned = `${prefix}${value}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  return cleaned.padEnd(4, '0');
}

function validateIdentifier(value: string | undefined, fallback: string, label: string): string {
  const normalized = (value?.trim() || fallback).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  if (normalized.length < 4) throw new Error(`${label} Fiuu mesti sekurang-kurangnya 4 aksara`);
  return normalized;
}

function parseApplications(): Record<string, FiuuApplicationEntry> {
  const raw = process.env.POS_FIUU_APPLICATIONS_JSON?.trim();
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('POS_FIUU_APPLICATIONS_JSON bukan JSON yang sah');
  }

  if (!isRecord(parsed)) throw new Error('POS_FIUU_APPLICATIONS_JSON mesti objek');
  const result: Record<string, FiuuApplicationEntry> = {};

  for (const [branchCode, value] of Object.entries(parsed)) {
    if (!isRecord(value)) throw new Error(`Konfigurasi Fiuu ${branchCode} tidak sah`);
    const applicationCode = typeof value.applicationCode === 'string' ? value.applicationCode.trim() : '';
    const secretKey = typeof value.secretKey === 'string' ? value.secretKey.trim() : '';
    const storeId = typeof value.storeId === 'string' ? value.storeId.trim() : undefined;
    const terminalId = typeof value.terminalId === 'string' ? value.terminalId.trim() : undefined;
    if (!applicationCode || applicationCode.length > 32 || !secretKey) {
      throw new Error(`Application Code atau Secret Key Fiuu ${branchCode} tidak lengkap`);
    }
    result[branchCode.toUpperCase()] = { applicationCode, secretKey, storeId, terminalId };
  }

  return result;
}

function parseValiditySeconds(): number {
  const value = Number(process.env.POS_FIUU_QR_VALIDITY_SECONDS ?? 180);
  if (!Number.isInteger(value) || value < 60 || value > 180) return 180;
  return value;
}

function validatePrecreateUrl(value: string, environment: FiuuEnvironment): string {
  const url = new URL(value);
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new Error('Endpoint Fiuu mesti menggunakan HTTPS');
  }
  const approvedHostname = environment === 'production'
    ? new URL(FIUU_PRODUCTION_PRECREATE_URL).hostname
    : new URL(FIUU_SANDBOX_PRECREATE_URL).hostname;
  if (!localDevelopment && url.hostname !== approvedHostname) {
    throw new Error(`Endpoint Fiuu ${environment} tidak berada pada hos yang diluluskan`);
  }
  return url.toString();
}

export type PosQrPaymentMode = 'manual' | 'fiuu' | 'fiuu_vt' | 'fiuu_cloudecr';

export function getPosQrPaymentMode(): PosQrPaymentMode {
  const mode = process.env.POS_QR_PAYMENT_MODE?.trim().toLowerCase();
  if (mode === 'fiuu' || mode === 'fiuu_vt' || mode === 'fiuu_cloudecr') return mode;
  return 'manual';
}

export function getFiuuEnvironment(): FiuuEnvironment {
  const environment = process.env.POS_FIUU_ENVIRONMENT?.trim().toLowerCase();
  if (!environment || environment === 'sandbox') return 'sandbox';
  if (environment === 'production') return 'production';
  throw new Error('Persekitaran Fiuu mesti sandbox atau production');
}

export function getFiuuOpaConfig(
  branchCode: string,
  deviceCode: string,
  options: { requireActiveMode?: boolean } = {},
): FiuuOpaConfig | null {
  if (options.requireActiveMode !== false && getPosQrPaymentMode() !== 'fiuu') return null;

  const applications = parseApplications();
  const mapped = applications[branchCode.toUpperCase()];
  const environment = getFiuuEnvironment();
  if (environment === 'production' && (!mapped || !mapped.storeId || !mapped.terminalId)) return null;

  const applicationCode = mapped?.applicationCode
    ?? process.env.POS_FIUU_APPLICATION_CODE?.trim()
    ?? '';
  const secretKey = mapped?.secretKey
    ?? process.env.POS_FIUU_SECRET_KEY?.trim()
    ?? '';

  if (!applicationCode || !secretKey) return null;
  if (applicationCode.length > 32) throw new Error('Application Code Fiuu melebihi 32 aksara');

  const defaultUrl = environment === 'production'
    ? FIUU_PRODUCTION_PRECREATE_URL
    : FIUU_SANDBOX_PRECREATE_URL;
  const configuredChannel = process.env.POS_FIUU_CHANNEL_ID?.trim() || FIUU_DUITNOW_QR_CHANNEL_ID;
  if (configuredChannel !== FIUU_DUITNOW_QR_CHANNEL_ID) {
    throw new Error('RKJ One hanya membenarkan saluran DuitNow QR Fiuu (24) untuk POS');
  }

  return {
    applicationCode,
    secretKey,
    storeId: validateIdentifier(
      mapped?.storeId ?? process.env.POS_FIUU_STORE_ID,
      normalizeIdentifier(branchCode, 'RKJ'),
      'Store ID',
    ),
    terminalId: validateIdentifier(
      mapped?.terminalId ?? process.env.POS_FIUU_TERMINAL_ID,
      normalizeIdentifier(deviceCode, 'RKJ'),
      'Terminal ID',
    ),
    channelId: FIUU_DUITNOW_QR_CHANNEL_ID,
    environment,
    precreateUrl: validatePrecreateUrl(
      process.env.POS_FIUU_PRECREATE_URL?.trim() || defaultUrl,
      environment,
    ),
    inquiryUrl: environment === 'production'
      ? FIUU_PRODUCTION_INQUIRY_URL
      : FIUU_SANDBOX_INQUIRY_URL,
    reversalUrl: environment === 'production'
      ? FIUU_PRODUCTION_REVERSAL_URL
      : FIUU_SANDBOX_REVERSAL_URL,
    validitySeconds: parseValiditySeconds(),
  };
}
const FIUU_TWO_DECIMAL_SIGNATURE_FIELDS = new Set(['amount', 'baseAmount']);

function signatureValue(key: string, value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    if (FIUU_TWO_DECIMAL_SIGNATURE_FIELDS.has(key) && Number.isFinite(value)) {
      return value.toFixed(2);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (isRecord(value) || Array.isArray(value)) return JSON.stringify(value);
  return '';
}

export function normalizeFiuuAmount(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  return '';
}

export function buildFiuuOpaSignature(
  parameters: Record<string, unknown>,
  secretKey: string,
): string {
  const source = Object.keys(parameters)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => signatureValue(key, parameters[key]))
    .filter((value) => value !== '')
    .join('');
  return createHmac('sha256', secretKey).update(source, 'utf8').digest('hex');
}

export function verifyFiuuOpaSignature(
  parameters: Record<string, unknown>,
  secretKey: string,
): boolean {
  const received = typeof parameters.signature === 'string'
    ? parameters.signature.trim().toLowerCase()
    : '';
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = buildFiuuOpaSignature(parameters, secretKey).toLowerCase();
  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function jsonWhitespace(character: string | undefined): boolean {
 return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function skipJsonWhitespace(raw: string, start: number): number {
 let index = start;
 while (jsonWhitespace(raw[index])) index += 1;
 return index;
}

function jsonStringEnd(raw: string, start: number): number {
 if (raw[start] !== '"') throw new Error('Respons JSON Fiuu tidak sah');
 let escaped = false;
 for (let index = start + 1; index < raw.length; index += 1) {
  const character = raw[index];
  if (escaped) {
   escaped = false;
  } else if (character === '\\') {
   escaped = true;
  } else if (character === '"') {
   return index + 1;
  }
 }
 throw new Error('Respons JSON Fiuu tidak sah');
}

function jsonValueEnd(raw: string, start: number): number {
 const first = raw[start];
 if (first === '"') return jsonStringEnd(raw, start);
 if (first === '{' || first === '[') {
  const stack = [first];
  let inString = false;
  let escaped = false;
  for (let index = start + 1; index < raw.length; index += 1) {
   const character = raw[index];
   if (inString) {
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === '"') inString = false;
    continue;
   }
   if (character === '"') {
    inString = true;
   } else if (character === '{' || character === '[') {
    stack.push(character);
   } else if (character === '}' || character === ']') {
    const expected = character === '}' ? '{' : '[';
    if (stack.pop() !== expected) throw new Error('Respons JSON Fiuu tidak sah');
    if (stack.length === 0) return index + 1;
   }
  }
  throw new Error('Respons JSON Fiuu tidak sah');
 }

 let index = start;
 while (index < raw.length && raw[index] !== ',' && raw[index] !== '}') index += 1;
 return index;
}

function rawSignatureValue(token: string): string {
 const normalized = token.trim();
 if (normalized.startsWith('"')) {
  const value: unknown = JSON.parse(normalized);
  return typeof value === 'string' ? value.trim() : '';
 }
 if (normalized === 'null') return '';
 return normalized;
}

function parseTopLevelJsonSignatureValues(raw: string): {
 body: Record<string, unknown>;
 values: Record<string, string>;
} {
 const parsed: unknown = JSON.parse(raw);
 if (!isRecord(parsed)) throw new Error('Respons JSON Fiuu mesti objek');

 const values: Record<string, string> = Object.create(null) as Record<string, string>;
 let index = skipJsonWhitespace(raw, 0);
 if (raw[index] !== '{') throw new Error('Respons JSON Fiuu mesti objek');
 index = skipJsonWhitespace(raw, index + 1);
 if (raw[index] === '}') return { body: parsed, values };

 while (index < raw.length) {
  const keyEnd = jsonStringEnd(raw, index);
  const key: unknown = JSON.parse(raw.slice(index, keyEnd));
  if (typeof key !== 'string' || Object.hasOwn(values, key)) {
   throw new Error('Respons JSON Fiuu mempunyai parameter berulang');
  }
  index = skipJsonWhitespace(raw, keyEnd);
  if (raw[index] !== ':') throw new Error('Respons JSON Fiuu tidak sah');
  index = skipJsonWhitespace(raw, index + 1);
  const valueEnd = jsonValueEnd(raw, index);
  values[key] = rawSignatureValue(raw.slice(index, valueEnd));
  index = skipJsonWhitespace(raw, valueEnd);
  if (raw[index] === '}') {
   index = skipJsonWhitespace(raw, index + 1);
   if (index !== raw.length) throw new Error('Respons JSON Fiuu tidak sah');
   return { body: parsed, values };
  }
  if (raw[index] !== ',') throw new Error('Respons JSON Fiuu tidak sah');
  index = skipJsonWhitespace(raw, index + 1);
 }
 throw new Error('Respons JSON Fiuu tidak sah');
}

/**
 * Verifies a Fiuu JSON response without losing decimal zeroes or reserializing
 * nested values before HMAC calculation. The returned body is parsed only
 * after the exact top-level lexical values have been retained for signing.
 */
export function parseVerifiedFiuuOpaJson(
 raw: string,
 secretKey: string,
): Record<string, unknown> {
 if (!raw || raw.length > 64 * 1024) throw new Error('Respons JSON Fiuu tidak sah');
 const { body, values } = parseTopLevelJsonSignatureValues(raw);
 const received = typeof body.signature === 'string'
  ? body.signature.trim().toLowerCase()
  : '';
 if (!/^[a-f0-9]{64}$/.test(received)) {
  throw new Error('Tandatangan respons Fiuu tidak sah');
 }
 const source = Object.keys(values)
  .filter((key) => key !== 'signature')
  .sort()
  .map((key) => values[key])
  .filter((value) => value !== '')
  .join('');
 const expected = createHmac('sha256', secretKey).update(source, 'utf8').digest('hex');
 const receivedBuffer = Buffer.from(received, 'hex');
 const expectedBuffer = Buffer.from(expected, 'hex');
 if (receivedBuffer.length !== expectedBuffer.length
  || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
  throw new Error('Tandatangan respons Fiuu tidak sah');
 }
 return body;
}

export function malaysiaBusinessDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function createFiuuDynamicQr(input: {
  config: FiuuOpaConfig;
  paymentId: string;
  amountRm: number;
  description: string;
}): Promise<FiuuDynamicQrResult> {
  const amount = input.amountRm.toFixed(2);
  const metadata = JSON.stringify({ paymentId: input.paymentId });
  const parameters: Record<string, string> = {
    applicationCode: input.config.applicationCode,
    version: 'v4',
    referenceId: input.paymentId,
    channelId: input.config.channelId,
    currencyCode: 'MYR',
    amount,
    description: input.description.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 50) || 'RKJ POS DuitNow QR',
    storeId: input.config.storeId,
    terminalId: input.config.terminalId,
    imageFormat: 'png',
    imageSize: '600x600',
    businessDate: malaysiaBusinessDate(),
    validityDuration: String(input.config.validitySeconds),
    hashType: 'hmac-sha256',
    metadata,
  };
  parameters.signature = buildFiuuOpaSignature(parameters, input.config.secretKey);

  let response: Response;
  try {
    response = await fetch(input.config.precreateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FiuuOpaPrecreateError(
      'Keputusan permintaan QR Fiuu tidak dapat disahkan',
      false,
    );
  }

  const rawBody = await response.text();
  if (!response.ok) {
    const ambiguousHttpStatus = [408, 409, 425, 429].includes(response.status);
    throw new FiuuOpaPrecreateError(
      `Fiuu gagal menjana QR (${response.status})`,
      response.status >= 400 && response.status < 500 && !ambiguousHttpStatus,
      response.status,
    );
  }
  let result: FiuuResponse;
  try {
    result = parseVerifiedFiuuOpaJson(
      rawBody,
      input.config.secretKey,
    ) as FiuuResponse;
  } catch {
    throw new FiuuOpaPrecreateError(
      'Keputusan respons QR Fiuu tidak dapat disahkan',
      false,
    );
  }
  if (String(result.applicationCode ?? '') !== input.config.applicationCode
    || String(result.referenceId ?? '') !== input.paymentId
    || Number(result.amount) !== Number(amount)
    || String(result.currencyCode ?? '') !== 'MYR'
    || String(result.channelId ?? '') !== input.config.channelId) {
    throw new FiuuOpaPrecreateError(
      'Respons Fiuu tidak sepadan dengan permintaan POS',
      false,
    );
  }
  if (String(result.statusCode ?? '') !== '00') {
    const errorCode = String(result.errorCode ?? 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    throw new FiuuOpaPrecreateError(
      `Fiuu menolak permintaan QR (${errorCode})`,
      true,
    );
  }

  let imageUrl: string;
  let gatewayReference: string;
  let authorizationCode: string;
  try {
    imageUrl = requiredString(
      result.customImageURL ?? result.ImageUrlBig ?? result.ImageUrl,
      'URL imej QR',
      500,
    );
    if (new URL(imageUrl).protocol !== 'https:') {
      throw new Error('URL imej QR Fiuu tidak selamat');
    }
    gatewayReference = requiredString(result.molTransactionId, 'Transaction ID', 40);
    authorizationCode = requiredString(result.authorizationCode, 'Authorization Code', 500);
  } catch {
    throw new FiuuOpaPrecreateError(
      'Respons kejayaan QR Fiuu tidak lengkap',
      false,
    );
  }

  return {
    gatewayReference,
    authorizationCode,
    qrImageUrl: imageUrl,
    expiresAt: new Date(Date.now() + input.config.validitySeconds * 1000).toISOString(),
  };
}
