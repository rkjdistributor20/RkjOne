import { describe, expect, it, vi } from 'vitest';
import { buildFiuuOpaSignature, type FiuuOpaConfig } from './fiuu';
import {
 inquireFiuuOpaPayment,
 reverseFiuuOpaPayment,
 type FiuuOpaFetch,
} from './fiuu-opa-runtime';

const SECRET = 'test-secret-not-real';
const CONFIG: FiuuOpaConfig = {
 applicationCode: 'APP001',
 secretKey: SECRET,
 storeId: 'STORE001',
 terminalId: 'TERM001',
 channelId: '24',
 environment: 'sandbox',
 precreateUrl: 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php',
 inquiryUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/inquiry.php',
 reversalUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/reversal.php',
 validitySeconds: 180,
};

function signed(body: Record<string, unknown>) {
 const signingBody = Object.fromEntries(Object.entries(body).map(([key, value]) => [
  key,
  (key === 'amount' || key === 'baseAmount') && typeof value === 'number'
   ? value.toFixed(2)
   : value,
 ]));
 return {
  ...body,
  signature: buildFiuuOpaSignature(signingBody, SECRET),
 };
}

function response(body: Record<string, unknown>) {
 let raw = JSON.stringify(signed(body));
 for (const key of ['amount', 'baseAmount']) {
  const value = body[key];
  if (typeof value === 'number') {
   raw = raw.replace(`"${key}":${String(value)}`, `"${key}":${value.toFixed(2)}`);
  }
 }
 return new Response(raw, {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
 });
}

describe('Fiuu OPA inquiry', () => {
 it('verifies and normalizes a successful numeric amount response', async () => {
  const fetcher = vi.fn<FiuuOpaFetch>().mockResolvedValue(response({
   amount: 12.5,
   applicationCode: 'APP001',
   channelId: '24',
   currencyCode: 'MYR',
   molTransactionId: 'TXN001',
   referenceId: 'PAYMENT001',
   statusCode: '00',
   version: 'v2',
  }));

  await expect(inquireFiuuOpaPayment({
   config: CONFIG,
   referenceId: 'PAYMENT001',
   expectedGatewayReference: 'TXN001',
   expectedAmountRm: 12.5,
   fetcher,
  })).resolves.toMatchObject({
   statusCode: '00',
   gatewayReference: 'TXN001',
   amount: '12.50',
   verifiedRawResponse: expect.stringContaining('"amount":12.50'),
  });

  const requested = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(requested.origin + requested.pathname).toBe(CONFIG.inquiryUrl);
  expect(requested.searchParams.get('referenceId')).toBe('PAYMENT001');
  expect(requested.searchParams.get('hashType')).toBe('hmac-sha256');
  expect(requested.searchParams.get('signature')).toMatch(/^[a-f0-9]{64}$/);
 });

 it('rejects a signed response for another provider transaction', async () => {
  const fetcher = vi.fn<FiuuOpaFetch>().mockResolvedValue(response({
   amount: '12.50',
   applicationCode: 'APP001',
   channelId: '24',
   currencyCode: 'MYR',
   molTransactionId: 'TXN-WRONG',
   referenceId: 'PAYMENT001',
   statusCode: '00',
   version: 'v2',
  }));

  await expect(inquireFiuuOpaPayment({
   config: CONFIG,
   referenceId: 'PAYMENT001',
   expectedGatewayReference: 'TXN001',
   expectedAmountRm: 12.5,
   fetcher,
  })).rejects.toThrow('Transaction ID respons Fiuu inquiry tidak sepadan');
 });

 it('learns the signed provider transaction ID when pre-create outcome was unknown', async () => {
  const fetcher = vi.fn<FiuuOpaFetch>().mockResolvedValue(response({
   amount: '12.50',
   applicationCode: 'APP001',
   channelId: '24',
   currencyCode: 'MYR',
   molTransactionId: 'TXN-RECOVERED',
   referenceId: 'PAYMENT001',
   statusCode: '11',
   version: 'v2',
  }));

  await expect(inquireFiuuOpaPayment({
   config: CONFIG,
   referenceId: 'PAYMENT001',
   expectedGatewayReference: null,
   expectedAmountRm: 12.5,
   fetcher,
  })).resolves.toMatchObject({
   statusCode: '11',
   gatewayReference: 'TXN-RECOVERED',
  });
 });

 it('rejects an uncorrelatable pending result instead of treating it as safe evidence', async () => {
  const fetcher = vi.fn<FiuuOpaFetch>().mockResolvedValue(response({
   applicationCode: 'APP001',
   referenceId: 'PAYMENT001',
   statusCode: '11',
   version: 'v2',
  }));

  await expect(inquireFiuuOpaPayment({
   config: CONFIG,
   referenceId: 'PAYMENT001',
   expectedGatewayReference: 'TXN001',
   expectedAmountRm: 12.5,
   fetcher,
  })).rejects.toThrow('tidak lengkap untuk pengesahan selamat');
 });
});

describe('Fiuu OPA reversal', () => {
 it('sends a signed form request and verifies the response references', async () => {
  const fetcher = vi.fn<FiuuOpaFetch>().mockResolvedValue(response({
   applicationCode: 'APP001',
   channelId: '24',
   molTransactionId: 'REVTXN001',
   paymentReferenceId: 'PAYMENT001',
   referenceId: 'REVERSAL001',
   statusCode: '00',
   version: 'v2',
  }));

  await expect(reverseFiuuOpaPayment({
   config: CONFIG,
   reversalReferenceId: 'REVERSAL001',
   paymentReferenceId: 'PAYMENT001',
   businessDate: '2026-10-26',
   fetcher,
  })).resolves.toMatchObject({
   statusCode: '00',
   referenceId: 'REVERSAL001',
   paymentReferenceId: 'PAYMENT001',
  });

  const init = fetcher.mock.calls[0]?.[1];
  expect(fetcher.mock.calls[0]?.[0]).toBe(CONFIG.reversalUrl);
  expect(init?.method).toBe('POST');
  const form = new URLSearchParams(String(init?.body));
  expect(form.get('paymentReferenceId')).toBe('PAYMENT001');
  expect(form.get('businessDate')).toBe('2026-10-26');
  expect(form.get('signature')).toMatch(/^[a-f0-9]{64}$/);
 });
});
