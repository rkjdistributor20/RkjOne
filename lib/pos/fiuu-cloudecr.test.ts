import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
 buildFiuuCloudEcrReferenceId,
 buildFiuuCloudEcrSignature,
 createFiuuCloudEcrSale,
 ensureFiuuCloudEcrAuth,
 FIUU_CLOUDECR_DUITNOW_CHANNEL,
 flattenFiuuCloudEcrValues,
 formatFiuuCloudEcrUtcTimestamp,
 getFiuuCloudEcrConfig,
 getFiuuCloudEcrLast,
 loginFiuuCloudEcr,
 matchFiuuCloudEcrResponse,
 parseFiuuCloudEcrResponse,
 refreshFiuuCloudEcr,
 verifyFiuuCloudEcrSignature,
 type FiuuCloudEcrConfig,
 type FiuuCloudEcrFetch,
 type FiuuCloudEcrTokens,
} from './fiuu-cloudecr';

const TEST_ENV = {
 POS_FIUU_CLOUDECR_BASE_URL: 'https://cloudecr.fiuu.com',
 POS_FIUU_CLOUDECR_POS_ID: 'POS-BR001',
 POS_FIUU_CLOUDECR_PASSWORD: 'test-password-not-real',
 POS_FIUU_CLOUDECR_MERCHANT_ID: 'MERCHANT-TEST',
 POS_FIUU_CLOUDECR_DEVICE_ID: 'DEVICE-BR001',
 POS_FIUU_CLOUDECR_TERMINAL_SN: 'VT-TEST-001',
 POS_FIUU_CLOUDECR_SECRET_KEY: 'test-secret-not-real',
 POS_FIUU_CLOUDECR_TIMEOUT_MS: '5000',
} as const;

function config(): FiuuCloudEcrConfig {
 return getFiuuCloudEcrConfig(TEST_ENV);
}

function jsonResponse(body: unknown, status = 200): Response {
 return new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
 });
}

function tokenResponse(): FiuuCloudEcrTokens {
 return {
  access: { token: 'access-token-for-test', expiresAt: '2030-01-02T04:00:00.000Z' },
  refresh: { token: 'refresh-token-for-test', expiresAt: '2030-01-02T23:59:00.000Z' },
 };
}

function signedTransferResponse(
 configuration: FiuuCloudEcrConfig,
 overrides: Record<string, unknown> = {},
): Record<string, unknown> {
 const base = {
  transType: 'sale',
  posId: configuration.posId,
  deviceId: configuration.deviceId,
  referenceId: 'RKJ12345678901234567',
  statusCode: '00',
  responseCode: '00',
  responseText: 'Approved',
  softwareVersion: 'Version 3.4.17',
  terminalSn: configuration.terminalSn,
  apiVersion: 'v1',
  transData: {
   transId: '1516809',
   paymentChannel: FIUU_CLOUDECR_DUITNOW_CHANNEL,
   transAmt: '12.50',
   transDateTime: '20300102030405',
   currency: 'MYR',
   invNo: 'INV-1001',
   batchNo: 'B001',
   tid: 'TID001',
   mid: 'MID001',
   metadata: 'RKJ12345678901234567',
  },
  ...overrides,
 };
 return {
  ...base,
  signature: buildFiuuCloudEcrSignature(base, configuration.secretKey),
 };
}

describe('cloudECR configuration and identifiers', () => {
 it('loads a complete server config without a default endpoint', () => {
  expect(config()).toEqual({
   baseUrl: 'https://cloudecr.fiuu.com',
   posId: 'POS-BR001',
   password: 'test-password-not-real',
   merchantId: 'MERCHANT-TEST',
   deviceId: 'DEVICE-BR001',
   terminalSn: 'VT-TEST-001',
   secretKey: 'test-secret-not-real',
   requestTimeoutMs: 5000,
  });
  expect(() => getFiuuCloudEcrConfig({})).toThrow('Base URL');
 });

 it('rejects unsafe endpoints and invalid timeout values', () => {
  expect(() => getFiuuCloudEcrConfig({
   ...TEST_ENV,
   POS_FIUU_CLOUDECR_BASE_URL: 'http://cloudecr.test',
  })).toThrow('origin HTTPS');
  expect(() => getFiuuCloudEcrConfig({
   ...TEST_ENV,
   POS_FIUU_CLOUDECR_BASE_URL: 'https://lookalike.example',
  })).toThrow('hos rasmi Fiuu');
  expect(() => getFiuuCloudEcrConfig({
   ...TEST_ENV,
   POS_FIUU_CLOUDECR_TIMEOUT_MS: '15001',
  })).toThrow('timeout');
  expect(() => getFiuuCloudEcrConfig({
   ...TEST_ENV,
   POS_FIUU_CLOUDECR_SECRET_KEY: 'x'.repeat(41),
  })).toThrow('Secret Key');
 });

 it('keeps the timeout active while a response body is still being read', async () => {
  const stalledBodyFetch: FiuuCloudEcrFetch = async (_input, init) => {
   const signal = init?.signal;
   const body = new ReadableStream<Uint8Array>({
    start(controller) {
     signal?.addEventListener('abort', () => {
      controller.error(new DOMException('Aborted', 'AbortError'));
     }, { once: true });
    },
   });
   return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
   });
  };
  const timeoutConfig = { ...config(), requestTimeoutMs: 1_000 };

  await expect(loginFiuuCloudEcr(timeoutConfig, stalledBodyFetch))
   .rejects.toThrow('melebihi had masa');
 }, 3_000);

 it('formats UTC and generates a deterministic reference within 20 characters', () => {
  expect(formatFiuuCloudEcrUtcTimestamp(new Date('2030-01-02T03:04:05.999Z')))
   .toBe('20300102030405');
  const reference = buildFiuuCloudEcrReferenceId('3f342adb-5867-4e12-b872-e8a776ce1b67');
  expect(reference).toMatch(/^RKJ[A-F0-9]{17}$/);
  expect(reference).toHaveLength(20);
  expect(buildFiuuCloudEcrReferenceId('3f342adb-5867-4e12-b872-e8a776ce1b67'))
   .toBe(reference);
 });
});

describe('cloudECR HMAC contract', () => {
 const payload = {
  zulu: 'Z',
  empty: '',
  zero: 0,
  nested: { beta: 'B', nil: null, alpha: 'A' },
  list: ['D', undefined, 'C'],
  signature: 'excluded',
 };

 it('recursively flattens, omits empty/signature, and sorts scalar values', () => {
  expect(flattenFiuuCloudEcrValues(payload)).toEqual(['0', 'A', 'B', 'C', 'D', 'Z']);
 });

 it('creates and timing-safely verifies the sorted-value HMAC', () => {
  const secret = 'fixture-secret';
  const expected = createHmac('sha256', secret).update('0ABCDZ', 'utf8').digest('hex');
  const signature = buildFiuuCloudEcrSignature(payload, secret);
  expect(signature).toBe(expected);
  expect(verifyFiuuCloudEcrSignature({ ...payload, signature }, secret)).toBe(true);
  expect(verifyFiuuCloudEcrSignature({ ...payload, zulu: 'tampered', signature }, secret))
   .toBe(false);
  expect(verifyFiuuCloudEcrSignature({ ...payload, signature: 'short' }, secret)).toBe(false);
 });
});

describe('cloudECR authentication with injected fetch', () => {
 it('logs in with only the documented POS credentials', async () => {
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse(tokenResponse()));
  await expect(loginFiuuCloudEcr(config(), fetcher)).resolves.toEqual(tokenResponse());

  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://cloudecr.fiuu.com/auth/login');
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toEqual({
   posId: 'POS-BR001',
   password: 'test-password-not-real',
  });
  expect(init?.headers).not.toHaveProperty('Authorization');
 });

 it('refreshes through a bearer token without sending a body', async () => {
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse(tokenResponse()));
  await refreshFiuuCloudEcr(config(), 'old-refresh-token', fetcher);

  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://cloudecr.fiuu.com/auth/refresh');
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer old-refresh-token' });
  expect(init?.body).toBeUndefined();
 });

 it('reuses access, then refreshes or logs in according to expiry', async () => {
  const current = tokenResponse();
  const noFetch = vi.fn<FiuuCloudEcrFetch>();
  await expect(ensureFiuuCloudEcrAuth({
   config: config(),
   fetcher: noFetch,
   current,
   now: new Date('2030-01-02T03:00:00.000Z'),
  })).resolves.toBe(current);
  expect(noFetch).not.toHaveBeenCalled();

  const refreshFetch = vi.fn<FiuuCloudEcrFetch>()
   .mockResolvedValue(jsonResponse(tokenResponse()));
  await ensureFiuuCloudEcrAuth({
   config: config(),
   fetcher: refreshFetch,
   current: {
    ...current,
    access: { ...current.access, expiresAt: '2030-01-02T03:00:01.000Z' },
   },
   now: new Date('2030-01-02T03:00:00.000Z'),
  });
  expect(refreshFetch.mock.calls[0][0]).toBe('https://cloudecr.fiuu.com/auth/refresh');

  const loginFetch = vi.fn<FiuuCloudEcrFetch>()
   .mockResolvedValue(jsonResponse(tokenResponse()));
  await ensureFiuuCloudEcrAuth({
   config: config(),
   fetcher: loginFetch,
   current: {
    access: { ...current.access, expiresAt: '2030-01-02T03:00:01.000Z' },
    refresh: { ...current.refresh, expiresAt: '2030-01-02T03:00:01.000Z' },
   },
   now: new Date('2030-01-02T03:00:00.000Z'),
  });
  expect(loginFetch.mock.calls[0][0]).toBe('https://cloudecr.fiuu.com/auth/login');
 });

 it('does not echo an upstream response body in HTTP errors', async () => {
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse({
   error: 'test-secret-not-real',
  }, 401));
  const error = await loginFiuuCloudEcr(config(), fetcher).catch((value: unknown) => value);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('(401)');
  expect((error as Error).message).not.toContain('test-secret-not-real');
 });

 it('preserves the HTTP status when a 401 response is not JSON', async () => {
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(new Response('<html>denied</html>', {
   status: 401,
   headers: { 'Content-Type': 'text/html' },
  }));
  await expect(loginFiuuCloudEcr(config(), fetcher)).rejects.toThrow('(401)');
 });
});

describe('cloudECR transfer parsing and matching', () => {
 it('parses a signed approved response and rejects tampering', () => {
  const configuration = config();
  const signed = signedTransferResponse(configuration);
  const parsed = parseFiuuCloudEcrResponse(signed, configuration.secretKey);
  expect(parsed.statusCode).toBe('00');
  expect(parsed.transData).toMatchObject({
   transId: '1516809',
   transAmt: '12.50',
   currency: 'MYR',
  });
  expect(parsed.verifiedPayload).toEqual(signed);
  expect(() => parseFiuuCloudEcrResponse({
   ...signed,
   responseText: 'tampered',
  }, configuration.secretKey)).toThrow('Tandatangan');
 });

 it('matches request identity and approved payment fields', () => {
  const configuration = config();
  const parsed = parseFiuuCloudEcrResponse(
   signedTransferResponse(configuration),
   configuration.secretKey,
  );
  expect(matchFiuuCloudEcrResponse(parsed, {
   transType: 'sale',
   posId: configuration.posId,
   deviceId: configuration.deviceId,
   referenceId: 'RKJ12345678901234567',
   amountRm: 12.5,
   paymentChannel: FIUU_CLOUDECR_DUITNOW_CHANNEL,
   currency: 'MYR',
   terminalSn: configuration.terminalSn,
   metadata: 'RKJ12345678901234567',
  })).toBe(parsed);
  expect(() => matchFiuuCloudEcrResponse(parsed, {
   transType: 'sale',
   posId: configuration.posId,
   deviceId: configuration.deviceId,
   referenceId: 'RKJ12345678901234567',
   amountRm: 99,
  })).toThrow('Amaun');

  expect(() => matchFiuuCloudEcrResponse(
   parseFiuuCloudEcrResponse(
    signedTransferResponse(configuration, { terminalSn: 'OTHER-TERMINAL' }),
    configuration.secretKey,
   ),
   {
    transType: 'sale',
    posId: configuration.posId,
    deviceId: configuration.deviceId,
    referenceId: 'RKJ12345678901234567',
    terminalSn: configuration.terminalSn,
   },
  )).toThrow('Terminal');

  const mismatchedMetadata = {
   ...signedTransferResponse(configuration).transData as Record<string, unknown>,
   metadata: 'RKJ00000000000000000',
  };
  expect(() => matchFiuuCloudEcrResponse(
   parseFiuuCloudEcrResponse(
    signedTransferResponse(configuration, { transData: mismatchedMetadata }),
    configuration.secretKey,
   ),
   {
    transType: 'sale',
    posId: configuration.posId,
    deviceId: configuration.deviceId,
    referenceId: 'RKJ12345678901234567',
    metadata: 'RKJ12345678901234567',
   },
  )).toThrow('Metadata');
 });
});

describe('cloudECR sale and getLast requests', () => {
 it('creates a signed DuitNow QR sale through the injected fetch only', async () => {
  const configuration = config();
  const response = signedTransferResponse(configuration);
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse(response));

  await expect(createFiuuCloudEcrSale({
   config: configuration,
   fetcher,
   accessToken: 'access-token-for-test',
   referenceId: 'RKJ12345678901234567',
   amountRm: 12.5,
   note: 'UAT BR001',
   now: new Date('2030-01-02T03:04:05.000Z'),
  })).resolves.toMatchObject({ statusCode: '00', responseCode: '00' });

  const [url, init] = fetcher.mock.calls[0];
  const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
  expect(url).toBe('https://cloudecr.fiuu.com/api/transfer');
  expect(init?.headers).toMatchObject({
   Authorization: 'Bearer access-token-for-test',
   'Content-Type': 'application/json',
  });
  expect(request).toMatchObject({
   transType: 'sale',
   posId: configuration.posId,
   merchantId: configuration.merchantId,
   deviceId: configuration.deviceId,
   referenceId: 'RKJ12345678901234567',
   apiVersion: 'v1',
   datetime: '20300102030405',
   transData: {
    transAmt: '12.50',
    paymentMethod: 'qrCustScan',
    paymentChannel: FIUU_CLOUDECR_DUITNOW_CHANNEL,
    metadata: 'RKJ12345678901234567',
    note: 'UAT BR001',
   },
  });
  expect(verifyFiuuCloudEcrSignature(request, configuration.secretKey)).toBe(true);
 });

 it('creates getLast without sale-only transData and validates the result', async () => {
  const configuration = config();
  const response = signedTransferResponse(configuration, {
   transType: 'getLast',
   referenceId: 'RKJGETLAST0000000001',
  });
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse(response));

  await expect(getFiuuCloudEcrLast({
   config: configuration,
   fetcher,
   accessToken: 'access-token-for-test',
   queryReferenceId: 'RKJGETLAST0000000001',
   originalReferenceId: 'RKJ12345678901234567',
   expectedAmountRm: 12.5,
   now: new Date('2030-01-02T03:04:05.000Z'),
  })).resolves.toMatchObject({ transType: 'getLast', statusCode: '00' });

  const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
  expect(request.transType).toBe('getLast');
  expect(request).not.toHaveProperty('transData');
  expect(verifyFiuuCloudEcrSignature(request, configuration.secretKey)).toBe(true);
 });

 it('rejects a correctly signed response whose identity does not match', async () => {
  const configuration = config();
  const response = signedTransferResponse(configuration, { deviceId: 'OTHER-DEVICE' });
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse(response));
  await expect(createFiuuCloudEcrSale({
   config: configuration,
   fetcher,
   accessToken: 'access-token-for-test',
   referenceId: 'RKJ12345678901234567',
   amountRm: 12.5,
  })).rejects.toThrow('tidak sepadan');
 });
});
