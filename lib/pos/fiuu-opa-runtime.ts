import {
 buildFiuuOpaSignature,
 malaysiaBusinessDate,
 normalizeFiuuAmount,
 parseVerifiedFiuuOpaJson,
 type FiuuOpaConfig,
} from './fiuu';

const FIUU_OPA_REQUEST_TIMEOUT_MS = 15_000;
// Inquiry/reversal HMAC and error-field fixes are explicitly defined in v2.
// Pre-create remains v4 because RKJ sends metadata there.
const FIUU_OPA_VERSION = 'v2';
const FIUU_OPA_HASH_TYPE = 'hmac-sha256';
const FIUU_OPA_STATUS_CODES = new Set(['00', '01', '11', '99']);

type JsonRecord = Record<string, unknown>;

export type FiuuOpaFetch = (
 input: string | URL,
 init?: RequestInit,
) => Promise<Response>;

export type FiuuOpaInquiryResult = Readonly<{
 statusCode: '00' | '01' | '11' | '99';
 referenceId: string;
 gatewayReference: string;
 amount: string;
 currencyCode: string;
 channelId: string;
 providerResult: JsonRecord;
 verifiedRawResponse: string;
}>;

export type FiuuOpaReversalResult = Readonly<{
 statusCode: '00' | '01' | '11' | '99';
 referenceId: string;
 paymentReferenceId: string;
 gatewayReference: string | null;
 channelId: string | null;
 providerResult: JsonRecord;
 verifiedRawResponse: string;
}>;

function cleanString(value: unknown, maxLength: number): string {
 return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requireStatusCode(value: unknown): '00' | '01' | '11' | '99' {
 const statusCode = cleanString(value, 2);
 if (!FIUU_OPA_STATUS_CODES.has(statusCode)) {
  throw new Error('Respons status OPA Fiuu tidak sah');
 }
 return statusCode as '00' | '01' | '11' | '99';
}

async function readVerifiedResponse(input: {
 response: Response;
 config: FiuuOpaConfig;
 operation: 'inquiry' | 'reversal';
}): Promise<{ body: JsonRecord; rawBody: string }> {
 const rawBody = await input.response.text();
 if (!input.response.ok) {
  throw new Error(`Fiuu ${input.operation} gagal (HTTP ${input.response.status})`);
 }
 const body = parseVerifiedFiuuOpaJson(rawBody, input.config.secretKey);
 if (cleanString(body.applicationCode, 32) !== input.config.applicationCode) {
  throw new Error(`Application Code respons Fiuu ${input.operation} tidak sepadan`);
 }
 if (cleanString(body.version, 3).toLowerCase() !== FIUU_OPA_VERSION) {
  throw new Error(`Versi respons Fiuu ${input.operation} tidak sepadan`);
 }
 return { body, rawBody };
}

function validateReferenceId(value: string, label: string): string {
 const normalized = value.trim();
 if (!/^[A-Za-z0-9_-]{1,40}$/.test(normalized)) {
  throw new Error(`${label} OPA Fiuu tidak sah`);
 }
 return normalized;
}

export async function inquireFiuuOpaPayment(input: {
 config: FiuuOpaConfig;
 referenceId: string;
 expectedGatewayReference?: string | null;
 expectedAmountRm: number;
 fetcher?: FiuuOpaFetch;
}): Promise<FiuuOpaInquiryResult> {
 const referenceId = validateReferenceId(input.referenceId, 'Reference ID');
 const expectedGatewayReference = input.expectedGatewayReference?.trim() ?? '';
 if (expectedGatewayReference.length > 40) {
  throw new Error('Transaction ID OPA Fiuu tidak sah');
 }
 if (!Number.isFinite(input.expectedAmountRm) || input.expectedAmountRm <= 0) {
  throw new Error('Amaun OPA Fiuu tidak sah');
 }

 const parameters: Record<string, string> = {
  applicationCode: input.config.applicationCode,
  version: FIUU_OPA_VERSION,
  referenceId,
  hashType: FIUU_OPA_HASH_TYPE,
 };
 parameters.signature = buildFiuuOpaSignature(parameters, input.config.secretKey);
 const url = new URL(input.config.inquiryUrl);
 url.search = new URLSearchParams(parameters).toString();

 const response = await (input.fetcher ?? fetch)(url, {
  method: 'GET',
  cache: 'no-store',
  signal: AbortSignal.timeout(FIUU_OPA_REQUEST_TIMEOUT_MS),
 });
 const { body, rawBody } = await readVerifiedResponse({
  response,
  config: input.config,
  operation: 'inquiry',
 });
 const statusCode = requireStatusCode(body.statusCode);
 if (cleanString(body.referenceId, 40) !== referenceId) {
  throw new Error('Reference ID respons Fiuu inquiry tidak sepadan');
 }

 const gatewayReference = cleanString(body.molTransactionId, 40) || null;
 const amount = normalizeFiuuAmount(body.amount) || null;
 const currencyCode = cleanString(body.currencyCode, 3).toUpperCase() || null;
 const channelId = cleanString(body.channelId, 4) || null;
 if (gatewayReference && expectedGatewayReference
  && gatewayReference !== expectedGatewayReference) {
  throw new Error('Transaction ID respons Fiuu inquiry tidak sepadan');
 }
 if (amount && amount !== input.expectedAmountRm.toFixed(2)) {
  throw new Error('Amaun respons Fiuu inquiry tidak sepadan');
 }
 if (currencyCode && currencyCode !== 'MYR') {
  throw new Error('Mata wang respons Fiuu inquiry tidak sepadan');
 }
 if (channelId && channelId !== input.config.channelId) {
  throw new Error('Saluran respons Fiuu inquiry tidak sepadan');
 }
 if (!gatewayReference || !amount || !currencyCode || !channelId) {
  throw new Error('Respons Fiuu inquiry tidak lengkap untuk pengesahan selamat');
 }

 return {
  statusCode,
  referenceId,
  gatewayReference,
  amount,
  currencyCode,
  channelId,
  providerResult: body,
  verifiedRawResponse: rawBody,
 };
}

export async function reverseFiuuOpaPayment(input: {
 config: FiuuOpaConfig;
 reversalReferenceId: string;
 paymentReferenceId: string;
 businessDate?: string;
 fetcher?: FiuuOpaFetch;
}): Promise<FiuuOpaReversalResult> {
 const referenceId = validateReferenceId(input.reversalReferenceId, 'Reversal Reference ID');
 const paymentReferenceId = validateReferenceId(
  input.paymentReferenceId,
  'Payment Reference ID',
 );
 const parameters: Record<string, string> = {
  applicationCode: input.config.applicationCode,
  version: FIUU_OPA_VERSION,
  referenceId,
  paymentReferenceId,
  businessDate: input.businessDate ?? malaysiaBusinessDate(),
  hashType: FIUU_OPA_HASH_TYPE,
 };
 parameters.signature = buildFiuuOpaSignature(parameters, input.config.secretKey);

 const response = await (input.fetcher ?? fetch)(input.config.reversalUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(parameters),
  cache: 'no-store',
  signal: AbortSignal.timeout(FIUU_OPA_REQUEST_TIMEOUT_MS),
 });
 const { body, rawBody } = await readVerifiedResponse({
  response,
  config: input.config,
  operation: 'reversal',
 });
 const statusCode = requireStatusCode(body.statusCode);
 if (cleanString(body.referenceId, 40) !== referenceId
  || cleanString(body.paymentReferenceId, 40) !== paymentReferenceId) {
  throw new Error('Rujukan respons Fiuu reversal tidak sepadan');
 }
 const channelId = cleanString(body.channelId, 4) || null;
 if (channelId && channelId !== input.config.channelId) {
  throw new Error('Saluran respons Fiuu reversal tidak sepadan');
 }

 return {
  statusCode,
  referenceId,
  paymentReferenceId,
  gatewayReference: cleanString(body.molTransactionId, 40) || null,
  channelId,
  providerResult: body,
  verifiedRawResponse: rawBody,
 };
}
