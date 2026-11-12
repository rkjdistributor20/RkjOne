import { afterEach, describe, expect, it } from 'vitest';
import {
 buildFiuuVtCallbackHost,
 buildFiuuVtOrderId,
 buildFiuuVtRequestUrl,
 FIUU_VT_DUITNOW_CHANNEL,
 getFiuuVtStatusDisposition,
 getFiuuVtVoidDisposition,
 isFiuuVtErrorResult,
 isFiuuVtPendingStatus,
 parseFiuuVtCallbackResult,
 parseFiuuVtResult,
 paymentIdFromFiuuVtOrderId,
 shouldLaunchFiuuVtStatusAfterReconcile,
} from './fiuu-vt';
import {
 getFiuuVtBranches,
 getFiuuVtLateRecoveryMs,
 getFiuuVtValiditySeconds,
 isFiuuVtEnabledForBranch,
 normalizeFiuuVtBranchCode,
} from './fiuu-vt-server';

const ORIGINAL_ENV = { ...process.env };
const CALLBACK_ATTEMPT_ID = '123e4567-e89b-42d3-a456-426614174000';
const CALLBACK_HOST = buildFiuuVtCallbackHost(CALLBACK_ATTEMPT_ID);
const CALLBACK_IDENTITY = {
 callbackAttemptId: CALLBACK_ATTEMPT_ID,
 callbackHost: CALLBACK_HOST,
};

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
});

describe('Fiuu VT request contract', () => {
 it('builds the documented merchant-presented SALE request', () => {
  const orderId = buildFiuuVtOrderId('3f342adb-5867-4e12-b872-e8a776ce1b67');
  const url = new URL(buildFiuuVtRequestUrl({
   opType: 'SALE',
   orderId,
   amountRm: 12.5,
   callbackHost: CALLBACK_HOST,
  }));

  expect(url.protocol).toBe('razervt:');
  expect(url.host).toBe('merchant.razer.com');
  expect(url.searchParams.get('merchantUrlScheme')).toBe('com.rkjone.staff');
  expect(url.searchParams.get('merchantHost')).toBe(CALLBACK_HOST);
  expect(url.searchParams.get('opType')).toBe('SALE');
  expect(url.searchParams.get('currency')).toBe('MYR');
  expect(url.searchParams.get('amount')).toBe('12.50');
  expect(url.searchParams.get('orderId')).toBe(orderId);
  expect(url.searchParams.get('channel')).toBe(FIUU_VT_DUITNOW_CHANNEL);
  expect(url.searchParams.get('payType')).toBe('2');
 });

 it('builds STATUS without adding SALE-only parameters', () => {
  const url = new URL(buildFiuuVtRequestUrl({
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   callbackHost: CALLBACK_HOST,
  }));
  expect(url.searchParams.get('opType')).toBe('STATUS');
  expect(url.searchParams.get('orderId')).toBe('RKJ_ORDER_001');
  expect(url.searchParams.has('amount')).toBe(false);
  expect(url.searchParams.has('currency')).toBe(false);
  expect(url.searchParams.has('payType')).toBe(false);
 });

 it('builds VOID for the original order without adding SALE-only parameters', () => {
  const url = new URL(buildFiuuVtRequestUrl({
   opType: 'VOID',
   orderId: 'RKJ_ORDER_001',
   callbackHost: CALLBACK_HOST,
  }));
  expect(url.searchParams.get('opType')).toBe('VOID');
  expect(url.searchParams.get('orderId')).toBe('RKJ_ORDER_001');
  expect(url.searchParams.has('amount')).toBe(false);
  expect(url.searchParams.has('currency')).toBe(false);
  expect(url.searchParams.has('payType')).toBe(false);
 });

 it('rejects invalid order IDs and currency precision', () => {
  expect(() => buildFiuuVtRequestUrl({
   opType: 'SALE',
   orderId: 'bad order',
   amountRm: 1,
   callbackHost: CALLBACK_HOST,
  })).toThrow('ID pesanan Fiuu VT tidak sah');
  expect(() => buildFiuuVtRequestUrl({
   opType: 'SALE',
   orderId: 'RKJ_ORDER_001',
   amountRm: Number.NaN,
   callbackHost: CALLBACK_HOST,
  })).toThrow('Amaun Fiuu VT tidak sah');
 });

 it('recovers the UUID only from RKJ order IDs created by this integration', () => {
  const paymentId = '3f342adb-5867-4e12-b872-e8a776ce1b67';
  expect(paymentIdFromFiuuVtOrderId(buildFiuuVtOrderId(paymentId))).toBe(paymentId);
  expect(paymentIdFromFiuuVtOrderId('RKJ_ORDER_001')).toBeNull();
  expect(paymentIdFromFiuuVtOrderId('RKJ_3F342ADB58674E12B872E8A776CE1B6Z')).toBeNull();
 });
});

describe('Fiuu VT callback validation', () => {
 const valid = {
  ...CALLBACK_IDENTITY,
  opType: 'STATUS',
  orderid: 'RKJ_ORDER_001',
  tranID: 'VT_778899',
  status: '00',
  amount: '12.50',
  currency: 'MYR',
  channel: FIUU_VT_DUITNOW_CHANNEL,
  payDate: '2026-10-15 10:30:00',
 };

 it('normalizes a complete matching result', () => {
  expect(parseFiuuVtResult(valid)).toEqual({
   ...CALLBACK_IDENTITY,
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   transactionId: 'VT_778899',
   status: '00',
   amountRm: 12.5,
   currency: 'MYR',
   channel: FIUU_VT_DUITNOW_CHANNEL,
   payDate: '2026-10-15 10:30:00',
  });

 });

 it('accepts the sanitized result shape stored for confirmation', () => {
  expect(parseFiuuVtResult({
   ...CALLBACK_IDENTITY,
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   transactionId: 'VT_778899',
   status: '00',
   amountRm: 12.5,
   currency: 'MYR',
   channel: FIUU_VT_DUITNOW_CHANNEL,
   payDate: null,
  })).toMatchObject({
   orderId: 'RKJ_ORDER_001',
   transactionId: 'VT_778899',
   amountRm: 12.5,
   status: '00',
  });
 });

 it('normalizes the documented error callback using the pending attempt context', () => {
  const result = parseFiuuVtCallbackResult({
   ...CALLBACK_IDENTITY,
   kind: 'ERROR',
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   errorCode: '310',
   errorMessage: 'Time out',
  });

  expect(isFiuuVtErrorResult(result)).toBe(true);
  expect(result).toEqual({
   ...CALLBACK_IDENTITY,
   kind: 'ERROR',
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   errorCode: '310',
   errorMessage: 'Time out',
  });
 });

 it('accepts provider-confirmed VOID cancellation and its error callback', () => {
  expect(parseFiuuVtResult({
   ...valid,
   opType: 'VOID',
   status: '44',
  })).toMatchObject({
   opType: 'VOID',
   orderId: 'RKJ_ORDER_001',
   status: '44',
  });
  expect(parseFiuuVtCallbackResult({
   ...CALLBACK_IDENTITY,
   kind: 'ERROR',
   opType: 'VOID',
   orderId: 'RKJ_ORDER_001',
   errorCode: '310',
   errorMessage: 'Cancel failed',
  })).toMatchObject({
   kind: 'ERROR',
   opType: 'VOID',
   errorCode: '310',
  });
 });

 it.each([
  { ...CALLBACK_IDENTITY, opType: 'STATUS', orderId: 'RKJ_ORDER_001', errorCode: '', errorMessage: 'Time out' },
  { ...CALLBACK_IDENTITY, opType: 'STATUS', orderId: 'bad order', errorCode: '310', errorMessage: 'Time out' },
  { ...CALLBACK_IDENTITY, opType: 'STATUS', orderId: 'RKJ_ORDER_001', errorCode: '310', errorMessage: 'Bad\nmessage' },
  {
   ...CALLBACK_IDENTITY, opType: 'STATUS', orderId: 'RKJ_ORDER_001', errorCode: '310', errorMessage: 'Time out',
   status: '00',
  },
 ])('rejects a malformed error callback %#', (value) => {
  expect(() => parseFiuuVtCallbackResult(value)).toThrow();
 });

 it.each([
  ['status', { ...valid, status: '99' }],
  ['amount', { ...valid, amount: '-1.00' }],
  ['currency', { ...valid, currency: 'USD' }],
  ['channel', { ...valid, channel: 'OTHER' }],
  ['transaction', { ...valid, tranID: '' }],
 ])('rejects an invalid %s field', (_label, value) => {
  expect(() => parseFiuuVtResult(value)).toThrow();
 });

 it('keeps only documented in-progress statuses pending', () => {
  expect(isFiuuVtPendingStatus('22')).toBe(true);
  expect(isFiuuVtPendingStatus('33')).toBe(true);
  expect(isFiuuVtPendingStatus('45')).toBe(true);
  expect(isFiuuVtPendingStatus('55')).toBe(false);
  expect(isFiuuVtPendingStatus('00')).toBe(false);
  expect(isFiuuVtPendingStatus('44')).toBe(false);
 });

 it('releases a provider-expired QR immediately', () => {
  expect(getFiuuVtStatusDisposition('00')).toBe('REPORTED');
  expect(getFiuuVtStatusDisposition('11')).toBe('FAILED');
  expect(getFiuuVtStatusDisposition('44')).toBe('CANCELLED');
  expect(getFiuuVtStatusDisposition('55')).toBe('EXPIRED');
 });

it('never treats a VOID response as payment success', () => {
 expect(getFiuuVtVoidDisposition('00')).toBe('PENDING');
 expect(getFiuuVtVoidDisposition('11')).toBe('PENDING');
 expect(getFiuuVtVoidDisposition('22')).toBe('PENDING');
 expect(getFiuuVtVoidDisposition('33')).toBe('PENDING');
 expect(getFiuuVtVoidDisposition('45')).toBe('PENDING');
 expect(getFiuuVtVoidDisposition('44')).toBe('CANCELLED');
 expect(getFiuuVtVoidDisposition('55')).toBe('EXPIRED');
});
});

describe('Fiuu VT STATUS recovery', () => {
 it('launches provider STATUS only after RKJ authoritatively remains pending', () => {
  expect(shouldLaunchFiuuVtStatusAfterReconcile('PENDING')).toBe(true);
  expect(shouldLaunchFiuuVtStatusAfterReconcile(null)).toBe(false);
 });

 it.each(['REPORTED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'] as const)(
  'does not relaunch provider STATUS after RKJ reaches %s',
  (status) => {
   expect(shouldLaunchFiuuVtStatusAfterReconcile(status)).toBe(false);
  },
 );
});

describe('Fiuu VT registered-branch gate', () => {
 it('allows the bounded late-recovery exception on Preview only', () => {
  process.env.VERCEL_ENV = 'preview';
  expect(getFiuuVtLateRecoveryMs()).toBe(24 * 60 * 60 * 1000);
  process.env.VERCEL_ENV = 'production';
  expect(getFiuuVtLateRecoveryMs()).toBe(0);
  delete process.env.VERCEL_ENV;
  expect(getFiuuVtLateRecoveryMs()).toBe(0);
 });

 it('fails closed when the VT allowlist is not configured', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_vt';
  delete process.env.POS_FIUU_VT_BRANCHES;

  expect([...getFiuuVtBranches()]).toEqual([]);
  expect(isFiuuVtEnabledForBranch('BR001')).toBe(false);
 });

 it('allows only explicitly configured BR001-BR036 branches while the dedicated mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_vt';
  process.env.POS_FIUU_VT_BRANCHES = ' br001,BR002,br036 ';

  expect([...getFiuuVtBranches()]).toEqual(['BR001', 'BR002', 'BR036']);
  expect(isFiuuVtEnabledForBranch('br001')).toBe(true);
  expect(isFiuuVtEnabledForBranch('BR002')).toBe(true);
  expect(isFiuuVtEnabledForBranch('BR036')).toBe(true);
  expect(isFiuuVtEnabledForBranch('BR003')).toBe(false);
  expect(isFiuuVtEnabledForBranch('not-a-branch')).toBe(false);

  process.env.POS_QR_PAYMENT_MODE = 'manual';
  expect(isFiuuVtEnabledForBranch('BR001')).toBe(false);
 });

 it.each(['*', 'ALL', 'BR01', 'BR000', 'BR037', 'BR0001', 'BR001,', ',BR001', 'BR001,,BR002'])(
  'rejects wildcard or malformed allowlist value %s',
  (allowlist) => {
   process.env.POS_FIUU_VT_BRANCHES = allowlist;
   expect(() => getFiuuVtBranches()).toThrow('Kod cawangan Fiuu VT tidak sah');
  },
 );

 it('rejects duplicate branch codes instead of silently accepting a configuration typo', () => {
  process.env.POS_FIUU_VT_BRANCHES = 'BR001,br001';
  expect(() => getFiuuVtBranches()).toThrow('Kod cawangan Fiuu VT berulang: BR001');
 });

 it('normalizes only canonical fleet branch codes', () => {
  expect(normalizeFiuuVtBranchCode(' br001 ')).toBe('BR001');
  expect(normalizeFiuuVtBranchCode('BR036')).toBe('BR036');
  expect(normalizeFiuuVtBranchCode('BR000')).toBeNull();
  expect(normalizeFiuuVtBranchCode('BR037')).toBeNull();
 });

 it('bounds validity', () => {
  process.env.POS_FIUU_VT_VALIDITY_SECONDS = '30';
  expect(getFiuuVtValiditySeconds()).toBe(180);
  process.env.POS_FIUU_VT_VALIDITY_SECONDS = '1200';
  expect(getFiuuVtValiditySeconds()).toBe(1200);
 });
});
