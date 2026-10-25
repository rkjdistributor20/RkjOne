import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const FIUU_CLOUDECR_API_VERSION = 'v1';
export const FIUU_CLOUDECR_DUITNOW_CHANNEL = 'duitNowQr';
export const FIUU_CLOUDECR_QR_PAYMENT_METHOD = 'qrCustScan';
export const FIUU_CLOUDECR_TRANSACTION_TIMEOUT_MS = 80_000;

// Fiuu recommends allowing the POS 80 seconds to receive the complete transfer
// response. Keep a small configurable margin for non-production diagnostics,
// while using the official recommendation by default.
const DEFAULT_TIMEOUT_MS = FIUU_CLOUDECR_TRANSACTION_TIMEOUT_MS;
const MAX_REQUEST_TIMEOUT_MS = 90_000;
const AUTH_AND_PREFLIGHT_TIMEOUT_MS = 15_000;
const AUTH_EXPIRY_SAFETY_MS = 30_000;
const REFERENCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const SIGNATURE_PATTERN = /^[a-fA-F0-9]{64}$/;
const PROVIDER_ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;

type Environment = Readonly<Record<string, string | undefined>>;
type JsonRecord = Record<string, unknown>;

export type FiuuCloudEcrFetch = (
 input: string | URL,
 init?: RequestInit,
) => Promise<Response>;

export type FiuuCloudEcrConfig = Readonly<{
 baseUrl: string;
 posId: string;
 password: string;
 merchantId: string;
 deviceId: string;
 terminalSn: string;
 secretKey: string;
 requestTimeoutMs: number;
}>;

export type FiuuCloudEcrToken = Readonly<{
 token: string;
 expiresAt: string;
}>;

export type FiuuCloudEcrTokens = Readonly<{
 access: FiuuCloudEcrToken;
 refresh: FiuuCloudEcrToken;
}>;

export type FiuuCloudEcrTerminal = Readonly<{
 terminalId: string;
 connected: boolean;
 isVT: boolean;
}>;

export type FiuuCloudEcrEwalletChannel = Readonly<{
 name: string;
 status: 0 | 1;
 currency: readonly string[];
 logoUrl3: string | null;
}>;

export class FiuuCloudEcrProviderError extends Error {
 readonly status: number;
 readonly code: string | null;
 readonly providerMessage: string | null;
 readonly operation: string;
 readonly retryAfterSeconds: number | null;

 constructor(input: {
  status: number;
  code: string | null;
  providerMessage: string | null;
  operation: string;
  retryAfterSeconds: number | null;
 }) {
  const detail = [
   `HTTP ${input.status}`,
   input.code ? `kod ${input.code}` : null,
  ].filter(Boolean).join(', ');
  super(
   `Permintaan ${input.operation} cloudECR ditolak (${detail})`
   + (input.providerMessage ? `: ${input.providerMessage}` : ''),
  );
  this.name = 'FiuuCloudEcrProviderError';
  this.status = input.status;
  this.code = input.code;
  this.providerMessage = input.providerMessage;
  this.operation = input.operation;
  this.retryAfterSeconds = input.retryAfterSeconds;
 }
}

export function isFiuuCloudEcrProviderError(
 error: unknown,
): error is FiuuCloudEcrProviderError {
 return error instanceof FiuuCloudEcrProviderError;
}

export type FiuuCloudEcrTransactionType = 'sale' | 'getLast';
export type FiuuCloudEcrStatusCode = '00' | '11' | '22';

export type FiuuCloudEcrRequest = Readonly<{
 transType: FiuuCloudEcrTransactionType;
 posId: string;
 merchantId: string;
 deviceId: string;
 referenceId: string;
 apiVersion: typeof FIUU_CLOUDECR_API_VERSION;
 datetime: string;
 transData?: Readonly<Record<string, string>>;
 signature: string;
}>;

export type FiuuCloudEcrResponseData = Readonly<{
 transId: string | null;
 paymentChannel: string | null;
 transAmt: string | null;
 transDateTime: string | null;
 currency: string | null;
 invNo: string | null;
 batchNo: string | null;
 tid: string | null;
 mid: string | null;
 metadata: string | null;
}>;

export type FiuuCloudEcrResponse = Readonly<{
 transType: FiuuCloudEcrTransactionType;
 posId: string;
 deviceId: string;
 referenceId: string;
 statusCode: FiuuCloudEcrStatusCode;
 responseCode: string;
 responseText: string | null;
 softwareVersion: string;
 terminalSn: string;
 apiVersion: typeof FIUU_CLOUDECR_API_VERSION;
 transData: FiuuCloudEcrResponseData | null;
 signature: string;
 /** Exact JSON object whose HMAC was verified, retained for forensic replay. */
 verifiedPayload: Readonly<JsonRecord>;
}>;

export type FiuuCloudEcrExpectedResponse = Readonly<{
 transType: FiuuCloudEcrTransactionType;
 posId: string;
 deviceId: string;
 referenceId: string;
 amountRm?: number;
 paymentChannel?: string;
 currency?: 'MYR';
 terminalSn?: string;
 metadata?: string;
 requireMetadata?: boolean;
}>;

function assertServerRuntime(): void {
 if (typeof window !== 'undefined') {
  throw new Error('Adapter Fiuu cloudECR hanya boleh digunakan pada server');
 }
}

function isRecord(value: unknown): value is JsonRecord {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredEnvironmentValue(
 env: Environment,
 key: string,
 label: string,
 maxLength: number,
): string {
 const value = env[key]?.trim() ?? '';
 if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
  throw new Error(`Konfigurasi cloudECR ${label} tidak sah`);
 }
 return value;
}

function validateBaseUrl(value: string): string {
 let url: URL;
 try {
  url = new URL(value);
 } catch {
  throw new Error('Konfigurasi cloudECR Base URL tidak sah');
 }
 if (url.protocol !== 'https:'
  || url.username
  || url.password
  || url.search
  || url.hash
  || (url.pathname !== '/' && url.pathname !== '')) {
  throw new Error('Konfigurasi cloudECR Base URL mesti origin HTTPS tanpa path atau kelayakan');
 }
 if (url.hostname.toLowerCase() !== 'cloudecr.fiuu.com' || url.port) {
  throw new Error('Konfigurasi cloudECR Base URL mesti menggunakan hos rasmi Fiuu');
 }
 return url.origin;
}

function parseTimeout(value: string | undefined): number {
 if (!value?.trim()) return DEFAULT_TIMEOUT_MS;
 const timeoutMs = Number(value);
 if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_REQUEST_TIMEOUT_MS) {
  throw new Error('Konfigurasi cloudECR timeout mesti antara 1000 dan 90000 ms');
 }
 return timeoutMs;
}

/**
 * Reads the server-only cloudECR credentials. There is deliberately no default
 * endpoint or credential, so importing this adapter cannot contact Fiuu by
 * itself and a missing UAT configuration fails closed.
 */
export function getFiuuCloudEcrConfig(
 env: Environment = process.env,
): FiuuCloudEcrConfig {
 assertServerRuntime();
 return {
  baseUrl: validateBaseUrl(requiredEnvironmentValue(
   env,
   'POS_FIUU_CLOUDECR_BASE_URL',
   'Base URL',
   500,
  )),
  posId: requiredEnvironmentValue(env, 'POS_FIUU_CLOUDECR_POS_ID', 'POS ID', 24),
  password: requiredEnvironmentValue(env, 'POS_FIUU_CLOUDECR_PASSWORD', 'kata laluan', 256),
  merchantId: requiredEnvironmentValue(
   env,
   'POS_FIUU_CLOUDECR_MERCHANT_ID',
   'Merchant ID',
   100,
  ),
  deviceId: requiredEnvironmentValue(env, 'POS_FIUU_CLOUDECR_DEVICE_ID', 'Device ID', 100),
  terminalSn: requiredEnvironmentValue(env, 'POS_FIUU_CLOUDECR_TERMINAL_SN', 'Terminal SN', 40),
  secretKey: requiredEnvironmentValue(env, 'POS_FIUU_CLOUDECR_SECRET_KEY', 'Secret Key', 40),
  requestTimeoutMs: parseTimeout(env.POS_FIUU_CLOUDECR_TIMEOUT_MS),
 };
}

/** Formats a Date as the 14-digit UTC timestamp used in cloudECR examples. */
export function formatFiuuCloudEcrUtcTimestamp(date = new Date()): string {
 const time = date.getTime();
 if (!Number.isFinite(time)) throw new Error('Tarikh cloudECR tidak sah');
 return date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
}

/**
 * Produces a deterministic, non-reversible, 20-character reference. This keeps
 * UUID-based RKJ payment identifiers within cloudECR's maximum length.
 */
export function buildFiuuCloudEcrReferenceId(sourceId: string): string {
 const normalized = sourceId.trim();
 if (!normalized || normalized.length > 500) {
  throw new Error('Sumber Reference ID cloudECR tidak sah');
 }
 const digest = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 17);
 return `RKJ${digest}`.toUpperCase();
}

function validateReferenceId(referenceId: string): string {
 const value = referenceId.trim();
 if (!REFERENCE_ID_PATTERN.test(value)) {
  throw new Error('Reference ID cloudECR mesti 1 hingga 20 aksara selamat');
 }
 return value;
}

function collectFlattenedValues(value: unknown, values: string[]): void {
 if (value === null || value === undefined || value === '') return;
 if (typeof value === 'string' || typeof value === 'boolean') {
  values.push(String(value));
  return;
 }
 if (typeof value === 'number') {
  if (!Number.isFinite(value)) throw new Error('Nilai nombor cloudECR tidak sah');
  values.push(String(value));
  return;
 }
 if (Array.isArray(value)) {
  for (const entry of value) collectFlattenedValues(entry, values);
  return;
 }
 if (isRecord(value)) {
  for (const [key, entry] of Object.entries(value)) {
   if (key === 'signature') continue;
   collectFlattenedValues(entry, values);
  }
  return;
 }
 throw new Error('Jenis nilai cloudECR tidak disokong untuk tandatangan');
}

/** Recursively flattens non-empty values, excludes signature, then sorts them. */
export function flattenFiuuCloudEcrValues(payload: unknown): string[] {
 const values: string[] = [];
 collectFlattenedValues(payload, values);
 return values.sort();
}

export function buildFiuuCloudEcrSignature(
 payload: unknown,
 secretKey: string,
): string {
 if (!secretKey || secretKey.length > 40) throw new Error('Secret Key cloudECR tidak sah');
 const source = flattenFiuuCloudEcrValues(payload).join('');
 return createHmac('sha256', secretKey).update(source, 'utf8').digest('hex');
}

export function verifyFiuuCloudEcrSignature(
 payload: unknown,
 secretKey: string,
): boolean {
 if (!isRecord(payload) || typeof payload.signature !== 'string') return false;
 const received = payload.signature.trim();
 if (!SIGNATURE_PATTERN.test(received)) return false;
 let expected: string;
 try {
  expected = buildFiuuCloudEcrSignature(payload, secretKey);
 } catch {
  return false;
 }
 const receivedBuffer = Buffer.from(received, 'hex');
 const expectedBuffer = Buffer.from(expected, 'hex');
 return receivedBuffer.length === expectedBuffer.length
  && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function requiredResponseString(value: unknown, label: string, maxLength: number): string {
 if (typeof value !== 'string') throw new Error(`Respons cloudECR tiada ${label}`);
 const normalized = value.trim();
 if (!normalized || normalized.length > maxLength) {
  throw new Error(`Respons cloudECR ${label} tidak sah`);
 }
 return normalized;
}

function optionalScalarString(
 value: unknown,
 label: string,
 maxLength: number,
): string | null {
 if (value === undefined || value === null || value === '') return null;
 if (typeof value !== 'string' && typeof value !== 'number') {
  throw new Error(`Respons cloudECR ${label} tidak sah`);
 }
 const normalized = String(value).trim();
 if (!normalized || normalized.length > maxLength) {
  throw new Error(`Respons cloudECR ${label} tidak sah`);
 }
 return normalized;
}

function normalizeExpiry(value: unknown, label: string): string {
 let milliseconds: number;
 if (typeof value === 'number' && Number.isFinite(value)) {
  milliseconds = value < 1_000_000_000_000 ? value * 1_000 : value;
 } else if (typeof value === 'string' && value.trim()) {
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
   const numeric = Number(normalized);
   milliseconds = numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric;
  } else {
   milliseconds = Date.parse(normalized);
  }
 } else {
  milliseconds = Number.NaN;
 }
 if (!Number.isFinite(milliseconds)) {
  throw new Error(`Respons auth cloudECR ${label} tidak sah`);
 }
 return new Date(milliseconds).toISOString();
}

function parseToken(value: unknown, label: string): FiuuCloudEcrToken {
 if (!isRecord(value)) throw new Error(`Respons auth cloudECR tiada token ${label}`);
 return {
  token: requiredResponseString(value.token, `token ${label}`, 8_192),
  expiresAt: normalizeExpiry(value.expiresAt, `tarikh luput ${label}`),
 };
}

export function parseFiuuCloudEcrAuthResponse(value: unknown): FiuuCloudEcrTokens {
 if (!isRecord(value)) throw new Error('Respons auth cloudECR tidak sah');
 return {
  access: parseToken(value.access, 'access'),
  refresh: parseToken(value.refresh, 'refresh'),
 };
}

type FiuuCloudEcrRequestPath =
 | '/auth/login'
 | '/auth/refresh'
 | '/auth/logout'
 | '/api/transfer'
 | '/api/terminals'
 | '/api/ewallet-channels';

function normalizeProviderErrorCode(value: unknown): string | null {
 if (typeof value !== 'string' && typeof value !== 'number') return null;
 const normalized = String(value).trim();
 return PROVIDER_ERROR_CODE_PATTERN.test(normalized) ? normalized : null;
}

function sanitizeProviderMessage(
 value: unknown,
 config: FiuuCloudEcrConfig,
 authorization: string | undefined,
): string | null {
 if (typeof value !== 'string' && typeof value !== 'number') return null;
 let normalized = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
 if (!normalized) return null;
 for (const secret of [config.password, config.secretKey, authorization]) {
  if (secret && secret.length >= 4) normalized = normalized.split(secret).join('[REDACTED]');
 }
 normalized = normalized
  .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
 return normalized.slice(0, 300);
}

function parseProviderErrorPayload(
 rawBody: string,
 config: FiuuCloudEcrConfig,
 authorization: string | undefined,
): Readonly<{ code: string | null; message: string | null }> {
 let parsed: unknown;
 try {
  parsed = JSON.parse(rawBody);
 } catch {
  return { code: null, message: null };
 }
 if (!isRecord(parsed)) return { code: null, message: null };

 const nestedError = isRecord(parsed.error) ? parsed.error : null;
 const records = nestedError ? [parsed, nestedError] : [parsed];
 let code: string | null = null;
 let message: string | null = null;
 for (const record of records) {
  code ??= normalizeProviderErrorCode(
   record.code ?? record.errorCode ?? record.statusCode,
  );
  message ??= sanitizeProviderMessage(
   record.message ?? record.errorMessage ?? record.responseText ?? record.detail,
   config,
   authorization,
  );
 }
 if (!message && typeof parsed.error === 'string') {
  message = sanitizeProviderMessage(parsed.error, config, authorization);
 }
 return { code, message };
}

function parseRetryAfterSeconds(value: string | null): number | null {
 if (!value) return null;
 const seconds = Number(value);
 if (Number.isInteger(seconds) && seconds >= 0) return seconds;
 const retryAt = Date.parse(value);
 if (!Number.isFinite(retryAt)) return null;
 return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

async function requestJson(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 path: FiuuCloudEcrRequestPath;
 operation: string;
 method: 'GET' | 'POST';
 authorization?: string;
 body?: unknown;
 query?: Readonly<Record<string, string>>;
 timeoutMs?: number;
 discardSuccessBody?: boolean;
}): Promise<unknown> {
 assertServerRuntime();
 const headers: Record<string, string> = { Accept: 'application/json' };
 if (input.authorization) headers.Authorization = `Bearer ${input.authorization}`;
 if (input.body !== undefined) headers['Content-Type'] = 'application/json';

 const url = new URL(input.path, `${input.config.baseUrl}/`);
 for (const [key, value] of Object.entries(input.query ?? {})) {
  url.searchParams.set(key, value);
 }

 const controller = new AbortController();
 const timeoutMs = input.timeoutMs
  ?? Math.min(input.config.requestTimeoutMs, AUTH_AND_PREFLIGHT_TIMEOUT_MS);
 const timer = setTimeout(() => controller.abort(), timeoutMs);
 try {
  let response: Response;
  try {
   response = await input.fetcher(url.toString(), {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    cache: 'no-store',
    signal: controller.signal,
   });
  } catch {
   throw new Error(controller.signal.aborted
    ? `Permintaan ${input.operation} cloudECR melebihi had masa`
    : `Permintaan ${input.operation} cloudECR gagal`);
  }

  let rawBody: string;
  try {
   rawBody = await response.text();
  } catch {
   throw new Error(controller.signal.aborted
    ? `Permintaan ${input.operation} cloudECR melebihi had masa`
    : `Respons ${input.operation} cloudECR tidak dapat dibaca`);
  }

  if (!response.ok) {
   const provider = parseProviderErrorPayload(
    rawBody,
    input.config,
    input.authorization,
   );
   throw new FiuuCloudEcrProviderError({
    status: response.status,
    code: provider.code,
    providerMessage: provider.message,
    operation: input.operation,
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('Retry-After')),
   });
  }
  if (input.discardSuccessBody) return null;
  try {
   return JSON.parse(rawBody);
  } catch {
   throw new Error(`Respons ${input.operation} cloudECR bukan JSON yang sah`);
  }
 } finally {
  // Keep the deadline active until the complete response body is consumed.
  clearTimeout(timer);
 }
}

export async function loginFiuuCloudEcr(
 config: FiuuCloudEcrConfig,
 fetcher: FiuuCloudEcrFetch,
): Promise<FiuuCloudEcrTokens> {
 const body = await requestJson({
  config,
  fetcher,
  path: '/auth/login',
  operation: 'login',
 method: 'POST',
  body: { posId: config.posId, password: config.password },
 });
 return parseFiuuCloudEcrAuthResponse(body);
}

export async function refreshFiuuCloudEcr(
 config: FiuuCloudEcrConfig,
 refreshToken: string,
 fetcher: FiuuCloudEcrFetch,
): Promise<FiuuCloudEcrTokens> {
 const token = requiredResponseString(refreshToken, 'refresh token', 8_192);
 const body = await requestJson({
  config,
  fetcher,
  path: '/auth/refresh',
  operation: 'refresh token',
 method: 'POST',
  authorization: token,
 });
 return parseFiuuCloudEcrAuthResponse(body);
}

export async function logoutFiuuCloudEcr(
 config: FiuuCloudEcrConfig,
 accessToken: string,
 fetcher: FiuuCloudEcrFetch,
): Promise<void> {
 const token = requiredResponseString(accessToken, 'access token', 8_192);
 await requestJson({
  config,
  fetcher,
  path: '/auth/logout',
  operation: 'logout',
  method: 'POST',
  authorization: token,
  discardSuccessBody: true,
 });
}

function tokenIsUsable(token: FiuuCloudEcrToken | undefined, nowMs: number): boolean {
 if (!token?.token || token.token.length > 8_192) return false;
 const expiresAt = Date.parse(token.expiresAt);
 return Number.isFinite(expiresAt) && expiresAt > nowMs + AUTH_EXPIRY_SAFETY_MS;
}

/** Reuses access, refreshes it, or logs in, in that order. */
export async function ensureFiuuCloudEcrAuth(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 current?: FiuuCloudEcrTokens | null;
 now?: Date;
}): Promise<FiuuCloudEcrTokens> {
 const now = input.now ?? new Date();
 const nowMs = now.getTime();
 if (!Number.isFinite(nowMs)) throw new Error('Masa semakan token cloudECR tidak sah');
 if (input.current && tokenIsUsable(input.current.access, nowMs)) return input.current;
 if (input.current && tokenIsUsable(input.current.refresh, nowMs)) {
  return refreshFiuuCloudEcr(input.config, input.current.refresh.token, input.fetcher);
 }
 return loginFiuuCloudEcr(input.config, input.fetcher);
}

function responseDataArray(value: unknown, label: string): unknown[] {
 if (!isRecord(value) || !Array.isArray(value.data)) {
  throw new Error(`Respons cloudECR ${label} tidak sah`);
 }
 return value.data;
}

function requiredResponseBoolean(value: unknown, label: string): boolean {
 if (typeof value !== 'boolean') throw new Error(`Respons cloudECR ${label} tidak sah`);
 return value;
}

export async function listFiuuCloudEcrTerminals(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 accessToken: string;
}): Promise<readonly FiuuCloudEcrTerminal[]> {
 const body = await requestJson({
  config: input.config,
  fetcher: input.fetcher,
  path: '/api/terminals',
  operation: 'senarai terminal',
  method: 'GET',
  authorization: validateAccessToken(input.accessToken),
 });
 return responseDataArray(body, 'senarai terminal').map((entry) => {
  if (!isRecord(entry)) throw new Error('Respons cloudECR terminal tidak sah');
  return {
   terminalId: requiredResponseString(entry.terminalId, 'Terminal ID', 100),
   connected: requiredResponseBoolean(entry.connected, 'status sambungan terminal'),
   isVT: requiredResponseBoolean(entry.isVT, 'jenis terminal'),
  };
 });
}

export async function listFiuuCloudEcrEwalletChannels(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 accessToken: string;
 currency?: 'MYR';
}): Promise<readonly FiuuCloudEcrEwalletChannel[]> {
 const currency = input.currency ?? 'MYR';
 const body = await requestJson({
  config: input.config,
  fetcher: input.fetcher,
  path: '/api/ewallet-channels',
  operation: 'senarai saluran e-wallet',
  method: 'GET',
  authorization: validateAccessToken(input.accessToken),
  query: { currency },
 });
 return responseDataArray(body, 'senarai saluran e-wallet').map((entry) => {
  if (!isRecord(entry)) throw new Error('Respons cloudECR saluran e-wallet tidak sah');
  const rawStatus = optionalScalarString(entry.status, 'status saluran', 1);
  if (rawStatus !== '0' && rawStatus !== '1') {
   throw new Error('Respons cloudECR status saluran tidak sah');
  }
  if (!Array.isArray(entry.currency)) {
   throw new Error('Respons cloudECR mata wang saluran tidak sah');
  }
  const currencies = entry.currency.map((value) => (
   requiredResponseString(value, 'mata wang saluran', 8).toUpperCase()
  ));
  return {
   name: requiredResponseString(entry.name, 'nama saluran', 100),
   status: rawStatus === '1' ? 1 : 0,
   currency: currencies,
   logoUrl3: optionalScalarString(entry.logoUrl3, 'URL logo saluran', 2_048),
  };
 });
}

function normalizeAmount(amountRm: number): string {
 if (!Number.isFinite(amountRm) || amountRm <= 0 || amountRm > 999_999.99) {
  throw new Error('Amaun cloudECR tidak sah');
 }
 const cents = Math.round(amountRm * 100);
 if (Math.abs(amountRm * 100 - cents) > 1e-7) {
  throw new Error('Amaun cloudECR hanya boleh mempunyai dua tempat perpuluhan');
 }
 return (cents / 100).toFixed(2);
}

function validateAccessToken(value: string): string {
 const token = value.trim();
 if (!token || token.length > 8_192 || /[\r\n]/.test(token)) {
  throw new Error('Access token cloudECR tidak sah');
 }
 return token;
}

function buildTransferRequest(input: {
 config: FiuuCloudEcrConfig;
 transType: FiuuCloudEcrTransactionType;
 referenceId: string;
 now?: Date;
 transData?: Readonly<Record<string, string>>;
}): FiuuCloudEcrRequest {
 const unsigned: Omit<FiuuCloudEcrRequest, 'signature'> = {
  transType: input.transType,
  posId: input.config.posId,
  merchantId: input.config.merchantId,
  deviceId: input.config.deviceId,
  referenceId: validateReferenceId(input.referenceId),
  apiVersion: FIUU_CLOUDECR_API_VERSION,
  datetime: formatFiuuCloudEcrUtcTimestamp(input.now),
  ...(input.transData ? { transData: input.transData } : {}),
 };
 return {
  ...unsigned,
  signature: buildFiuuCloudEcrSignature(unsigned, input.config.secretKey),
 };
}

function parseResponseAmount(value: unknown): string | null {
 const raw = optionalScalarString(value, 'amaun transaksi', 30);
 if (raw === null) return null;
 if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
  throw new Error('Respons cloudECR amaun transaksi tidak sah');
 }
 return normalizeAmount(Number(raw));
}

function parseResponseData(value: unknown): FiuuCloudEcrResponseData | null {
 if (value === undefined || value === null) return null;
 if (!isRecord(value)) throw new Error('Respons cloudECR transData tidak sah');
 const currency = optionalScalarString(value.currency, 'mata wang', 8);
 const transId = optionalScalarString(value.transId, 'Transaction ID', 10);
 if (transId !== null && !/^\d{1,10}$/.test(transId)) {
  throw new Error('Respons cloudECR Transaction ID tidak sah');
 }
 return {
  transId,
  paymentChannel: optionalScalarString(value.paymentChannel, 'saluran bayaran', 100),
  transAmt: parseResponseAmount(value.transAmt),
  transDateTime: optionalScalarString(value.transDateTime, 'masa transaksi', 40),
  currency: currency?.toUpperCase() ?? null,
  invNo: optionalScalarString(value.invNo, 'nombor invois', 100),
  batchNo: optionalScalarString(value.batchNo, 'nombor batch', 100),
  tid: optionalScalarString(value.tid, 'TID', 100),
  mid: optionalScalarString(value.mid, 'MID', 100),
  metadata: optionalScalarString(value.metadata, 'metadata', 128),
 };
}

export function parseFiuuCloudEcrResponse(
 value: unknown,
 secretKey: string,
): FiuuCloudEcrResponse {
 if (!isRecord(value)) throw new Error('Respons cloudECR tidak sah');
 if (!verifyFiuuCloudEcrSignature(value, secretKey)) {
  throw new Error('Tandatangan respons cloudECR tidak sah');
 }

 const transType = requiredResponseString(value.transType, 'jenis transaksi', 20);
 if (transType !== 'sale' && transType !== 'getLast') {
  throw new Error('Respons cloudECR jenis transaksi tidak disokong');
 }
 const statusCode = requiredResponseString(value.statusCode, 'status', 2);
 if (statusCode !== '00' && statusCode !== '11' && statusCode !== '22') {
  throw new Error('Respons cloudECR status tidak dikenali');
 }
 const apiVersion = requiredResponseString(value.apiVersion, 'versi API', 10);
 if (apiVersion !== FIUU_CLOUDECR_API_VERSION) {
  throw new Error('Respons cloudECR versi API tidak disokong');
 }

 return {
  transType,
  posId: requiredResponseString(value.posId, 'POS ID', 24),
  deviceId: requiredResponseString(value.deviceId, 'Device ID', 100),
  referenceId: validateReferenceId(requiredResponseString(value.referenceId, 'Reference ID', 20)),
  statusCode,
  responseCode: requiredResponseString(value.responseCode, 'Response Code', 32),
  responseText: optionalScalarString(value.responseText, 'teks respons', 500),
  softwareVersion: requiredResponseString(value.softwareVersion, 'versi terminal', 40),
  terminalSn: requiredResponseString(value.terminalSn, 'nombor siri terminal', 40),
  apiVersion,
  transData: parseResponseData(value.transData),
  signature: requiredResponseString(value.signature, 'tandatangan', 64).toLowerCase(),
  verifiedPayload: { ...value },
 };
}

/** Throws on any request/response identity or approved-payment mismatch. */
export function matchFiuuCloudEcrResponse(
 response: FiuuCloudEcrResponse,
 expected: FiuuCloudEcrExpectedResponse,
): FiuuCloudEcrResponse {
 if (response.transType !== expected.transType
  || response.posId !== expected.posId
  || response.deviceId !== expected.deviceId
  || response.referenceId !== validateReferenceId(expected.referenceId)) {
  throw new Error('Respons cloudECR tidak sepadan dengan permintaan POS');
 }

 if (expected.terminalSn && response.terminalSn !== expected.terminalSn) {
  throw new Error('Terminal respons cloudECR tidak sepadan');
 }

 const data = response.transData;
 if (response.statusCode === '00' && !data) {
  throw new Error('Respons berjaya cloudECR tiada butiran transaksi');
 }
 if (response.statusCode === '00' && !data?.transId) {
  throw new Error('Respons berjaya cloudECR tiada Transaction ID');
 }
 if (expected.amountRm !== undefined && (response.statusCode === '00' || data?.transAmt)) {
  if (data?.transAmt !== normalizeAmount(expected.amountRm)) {
   throw new Error('Amaun respons cloudECR tidak sepadan');
  }
 }
 if (expected.paymentChannel && (response.statusCode === '00' || data?.paymentChannel)) {
  if (data?.paymentChannel !== expected.paymentChannel) {
   throw new Error('Saluran respons cloudECR tidak sepadan');
  }
 }
 if (expected.currency && (response.statusCode === '00' || data?.currency)) {
  if (data?.currency !== expected.currency) {
   throw new Error('Mata wang respons cloudECR tidak sepadan');
  }
 }
 if (expected.metadata
  && ((expected.requireMetadata && response.statusCode === '00') || data?.metadata)) {
  if (data?.metadata !== expected.metadata) {
   throw new Error('Metadata respons cloudECR tidak sepadan');
  }
 }
 return response;
}

async function executeTransfer(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 accessToken: string;
 request: FiuuCloudEcrRequest;
 expected: FiuuCloudEcrExpectedResponse;
}): Promise<FiuuCloudEcrResponse> {
 const body = await requestJson({
  config: input.config,
  fetcher: input.fetcher,
  path: '/api/transfer',
  operation: input.request.transType,
  method: 'POST',
  authorization: validateAccessToken(input.accessToken),
  body: input.request,
  timeoutMs: input.config.requestTimeoutMs,
 });
 return matchFiuuCloudEcrResponse(
  parseFiuuCloudEcrResponse(body, input.config.secretKey),
  input.expected,
 );
}

export async function createFiuuCloudEcrSale(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 accessToken: string;
 referenceId: string;
 amountRm: number;
 note?: string;
 now?: Date;
}): Promise<FiuuCloudEcrResponse> {
 const amount = normalizeAmount(input.amountRm);
 const note = input.note?.trim();
 if (note && note.length > 128) throw new Error('Nota cloudECR melebihi 128 aksara');
 const transData = {
  transAmt: amount,
  paymentMethod: FIUU_CLOUDECR_QR_PAYMENT_METHOD,
  paymentChannel: FIUU_CLOUDECR_DUITNOW_CHANNEL,
  metadata: validateReferenceId(input.referenceId),
  ...(note ? { note } : {}),
 };
 const request = buildTransferRequest({
  config: input.config,
  transType: 'sale',
  referenceId: input.referenceId,
  now: input.now,
  transData,
 });
 return executeTransfer({
  config: input.config,
  fetcher: input.fetcher,
  accessToken: input.accessToken,
  request,
  expected: {
   transType: 'sale',
   posId: input.config.posId,
   deviceId: input.config.deviceId,
   referenceId: request.referenceId,
   amountRm: input.amountRm,
   paymentChannel: FIUU_CLOUDECR_DUITNOW_CHANNEL,
   currency: 'MYR',
   terminalSn: input.config.terminalSn,
   metadata: request.referenceId,
  },
 });
}

export async function getFiuuCloudEcrLast(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 accessToken: string;
 queryReferenceId: string;
 originalReferenceId: string;
 expectedAmountRm?: number;
 now?: Date;
}): Promise<FiuuCloudEcrResponse> {
 const request = buildTransferRequest({
  config: input.config,
  transType: 'getLast',
  referenceId: input.queryReferenceId,
  now: input.now,
 });
 return executeTransfer({
  config: input.config,
  fetcher: input.fetcher,
  accessToken: input.accessToken,
  request,
  expected: {
   transType: 'getLast',
   posId: input.config.posId,
   deviceId: input.config.deviceId,
   referenceId: request.referenceId,
   amountRm: input.expectedAmountRm,
   paymentChannel: FIUU_CLOUDECR_DUITNOW_CHANNEL,
   currency: 'MYR',
   terminalSn: input.config.terminalSn,
   metadata: validateReferenceId(input.originalReferenceId),
   requireMetadata: true,
  },
 });
}
