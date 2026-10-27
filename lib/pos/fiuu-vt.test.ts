import { afterEach, describe, expect, it } from 'vitest';
import {
 buildFiuuVtOrderId,
 buildFiuuVtRequestUrl,
 FIUU_VT_DUITNOW_CHANNEL,
 getFiuuVtStatusDisposition,
 isFiuuVtErrorResult,
 isFiuuVtPendingStatus,
 parseFiuuVtCallbackResult,
 parseFiuuVtResult,
 shouldLaunchFiuuVtStatusAfterReconcile,
} from './fiuu-vt';
import {
 FIUU_VT_PILOT_BRANCH,
 getFiuuVtPilotBranches,
 getFiuuVtValiditySeconds,
 isFiuuVtEnabledForBranch,
} from './fiuu-vt-server';

const ORIGINAL_ENV = { ...process.env };

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
  }));

  expect(url.protocol).toBe('razervt:');
  expect(url.host).toBe('merchant.razer.com');
  expect(url.searchParams.get('merchantUrlScheme')).toBe('com.rkjone.staff');
  expect(url.searchParams.get('merchantHost')).toBe('fiuu-vt.rkj.one');
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
  }));
  expect(url.searchParams.get('opType')).toBe('STATUS');
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
  })).toThrow('ID pesanan Fiuu VT tidak sah');
  expect(() => buildFiuuVtRequestUrl({
   opType: 'SALE',
   orderId: 'RKJ_ORDER_001',
   amountRm: Number.NaN,
  })).toThrow('Amaun Fiuu VT tidak sah');
 });
});

describe('Fiuu VT callback validation', () => {
 const valid = {
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
   kind: 'ERROR',
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   errorCode: '310',
   errorMessage: 'Time out',
  });

  expect(isFiuuVtErrorResult(result)).toBe(true);
  expect(result).toEqual({
   kind: 'ERROR',
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   errorCode: '310',
   errorMessage: 'Time out',
  });
 });

 it.each([
  { opType: 'STATUS', orderId: 'RKJ_ORDER_001', errorCode: '', errorMessage: 'Time out' },
  { opType: 'STATUS', orderId: 'bad order', errorCode: '310', errorMessage: 'Time out' },
  { opType: 'STATUS', orderId: 'RKJ_ORDER_001', errorCode: '310', errorMessage: 'Bad\nmessage' },
  {
   opType: 'STATUS', orderId: 'RKJ_ORDER_001', errorCode: '310', errorMessage: 'Time out',
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

 it('keeps documented in-progress and bounded timeout status pending', () => {
  expect(isFiuuVtPendingStatus('22')).toBe(true);
  expect(isFiuuVtPendingStatus('33')).toBe(true);
  expect(isFiuuVtPendingStatus('45')).toBe(true);
  expect(isFiuuVtPendingStatus('55')).toBe(true);
  expect(isFiuuVtPendingStatus('00')).toBe(false);
  expect(isFiuuVtPendingStatus('44')).toBe(false);
 });

 it('keeps status 55 locked pending until reconciliation grace ends', () => {
  expect(getFiuuVtStatusDisposition('00')).toBe('REPORTED');
  expect(getFiuuVtStatusDisposition('11')).toBe('FAILED');
  expect(getFiuuVtStatusDisposition('44')).toBe('CANCELLED');
  expect(getFiuuVtStatusDisposition('55')).toBe('PENDING');
 });
});

describe('Fiuu VT STATUS recovery', () => {
 it('launches provider STATUS when RKJ reconciliation is pending or temporarily unavailable', () => {
  expect(shouldLaunchFiuuVtStatusAfterReconcile('PENDING')).toBe(true);
  expect(shouldLaunchFiuuVtStatusAfterReconcile(null)).toBe(true);
 });

 it.each(['REPORTED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'] as const)(
  'does not relaunch provider STATUS after RKJ reaches %s',
  (status) => {
   expect(shouldLaunchFiuuVtStatusAfterReconcile(status)).toBe(false);
  },
 );
});

describe('Fiuu VT pilot gate', () => {
 it('fails closed when the VT allowlist is not configured', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_vt';
  delete process.env.POS_FIUU_VT_BRANCHES;

  expect([...getFiuuVtPilotBranches()]).toEqual([]);
  expect(isFiuuVtEnabledForBranch(FIUU_VT_PILOT_BRANCH)).toBe(false);
 });

 it('allows only BR001 while the dedicated mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_vt';
  process.env.POS_FIUU_VT_BRANCHES = ' br001 ';

  expect([...getFiuuVtPilotBranches()]).toEqual(['BR001']);
  expect(isFiuuVtEnabledForBranch('br001')).toBe(true);
  expect(isFiuuVtEnabledForBranch('BR002')).toBe(false);
  expect(isFiuuVtEnabledForBranch('not-a-branch')).toBe(false);

  process.env.POS_QR_PAYMENT_MODE = 'manual';
  expect(isFiuuVtEnabledForBranch('BR001')).toBe(false);
 });

 it.each(['*', 'ALL', 'BR01', 'BR0001', 'BR001,', ',BR001', 'BR001,,BR001'])(
  'rejects wildcard or malformed allowlist value %s',
  (allowlist) => {
   process.env.POS_FIUU_VT_BRANCHES = allowlist;
   expect(() => getFiuuVtPilotBranches()).toThrow('Kod cawangan pilot Fiuu VT tidak sah');
  },
 );

 it.each(['BR002', 'BR001,BR002', 'BR007'])(
  'rejects non-BR001 allowlist value %s',
  (allowlist) => {
   process.env.POS_FIUU_VT_BRANCHES = allowlist;
   expect(() => getFiuuVtPilotBranches()).toThrow('dikunci kepada BR001');
  },
 );

 it('bounds validity', () => {
  process.env.POS_FIUU_VT_VALIDITY_SECONDS = '30';
  expect(getFiuuVtValiditySeconds()).toBe(900);
  process.env.POS_FIUU_VT_VALIDITY_SECONDS = '1200';
  expect(getFiuuVtValiditySeconds()).toBe(1200);
 });
});
