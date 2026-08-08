import { createHmac, timingSafeEqual } from 'node:crypto';

const FIUU_DUITNOW_QR_CHANNEL_ID = '24';
const FIUU_SANDBOX_PRECREATE_URL = 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php';
const FIUU_PRODUCTION_PRECREATE_URL = 'https://opa.fiuu.com/RMS/API/MOLOPA/precreate.php';

type FiuuEnvironment = 'sandbox' | 'production';

type FiuuApplicationEntry = {
  applicationCode: string;
  secretKey: string;
  storeId?: string;
};

export type FiuuOpaConfig = {
  applicationCode: string;
  secretKey: string;
  storeId: string;
  terminalId: string;
  channelId: '24';
  environment: FiuuEnvironment;
  precreateUrl: string;
  validitySeconds: number;
};

export type FiuuDynamicQrResult = {
  gatewayReference: string;
  qrImageUrl: string;
  authorizationCode: string;
  expiresAt: string;
};

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
    if (!applicationCode || applicationCode.length > 32 || !secretKey) {
      throw new Error(`Application Code atau Secret Key Fiuu ${branchCode} tidak lengkap`);
    }
    result[branchCode.toUpperCase()] = { applicationCode, secretKey, storeId };
  }

  return result;
}

function parseValiditySeconds(): number {
  const value = Number(process.env.POS_FIUU_QR_VALIDITY_SECONDS ?? 600);
  if (!Number.isInteger(value) || value < 60 || value > 999) return 600;
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

export function getPosQrPaymentMode(): 'manual' | 'fiuu' {
  return process.env.POS_QR_PAYMENT_MODE?.trim().toLowerCase() === 'fiuu' ? 'fiuu' : 'manual';
}

export function getFiuuOpaConfig(branchCode: string, deviceCode: string): FiuuOpaConfig | null {
  if (getPosQrPaymentMode() !== 'fiuu') return null;

  const applications = parseApplications();
  const mapped = applications[branchCode.toUpperCase()];
  const applicationCode = mapped?.applicationCode
    ?? process.env.POS_FIUU_APPLICATION_CODE?.trim()
    ?? '';
  const secretKey = mapped?.secretKey
    ?? process.env.POS_FIUU_SECRET_KEY?.trim()
    ?? '';

  if (!applicationCode || !secretKey) return null;
  if (applicationCode.length > 32) throw new Error('Application Code Fiuu melebihi 32 aksara');

  const environment: FiuuEnvironment = process.env.POS_FIUU_ENVIRONMENT?.trim().toLowerCase() === 'production'
    ? 'production'
    : 'sandbox';
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
      undefined,
      normalizeIdentifier(deviceCode, 'RKJ'),
      'Terminal ID',
    ),
    channelId: FIUU_DUITNOW_QR_CHANNEL_ID,
    environment,
    precreateUrl: validatePrecreateUrl(
      process.env.POS_FIUU_PRECREATE_URL?.trim() || defaultUrl,
      environment,
    ),
    validitySeconds: parseValiditySeconds(),
  };
}
function signatureValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value) || Array.isArray(value)) return JSON.stringify(value);
  return '';
}

export function buildFiuuOpaSignature(
  parameters: Record<string, unknown>,
  secretKey: string,
): string {
  const source = Object.keys(parameters)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => signatureValue(parameters[key]))
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

  const response = await fetch(input.config.precreateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(body)) {
    throw new Error(`Fiuu gagal menjana QR (${response.status})`);
  }
  const result: FiuuResponse = body;

  if (!verifyFiuuOpaSignature(result, input.config.secretKey)) {
    throw new Error('Tandatangan respons Fiuu tidak sah');
  }
  if (String(result.applicationCode ?? '') !== input.config.applicationCode
    || String(result.referenceId ?? '') !== input.paymentId
    || Number(result.amount) !== Number(amount)
    || String(result.currencyCode ?? '') !== 'MYR'
    || String(result.channelId ?? '') !== input.config.channelId) {
    throw new Error('Respons Fiuu tidak sepadan dengan permintaan POS');
  }
  if (String(result.statusCode ?? '') !== '00') {
    const errorCode = String(result.errorCode ?? 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    throw new Error(`Fiuu menolak permintaan QR (${errorCode})`);
  }

  const imageUrl = requiredString(
    result.customImageURL ?? result.ImageUrlBig ?? result.ImageUrl,
    'URL imej QR',
    500,
  );
  if (new URL(imageUrl).protocol !== 'https:') throw new Error('URL imej QR Fiuu tidak selamat');

  return {
    gatewayReference: requiredString(result.molTransactionId, 'Transaction ID', 40),
    authorizationCode: requiredString(result.authorizationCode, 'Authorization Code', 500),
    qrImageUrl: imageUrl,
    expiresAt: new Date(Date.now() + input.config.validitySeconds * 1000).toISOString(),
  };
}
