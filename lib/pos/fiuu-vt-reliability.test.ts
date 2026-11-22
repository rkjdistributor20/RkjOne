import { describe, expect, it, vi } from 'vitest';
import {
 recoverReportedFiuuVtPayment,
 type FiuuVtRecoveryPayment,
} from './fiuu-vt-reliability';
import { buildFiuuVtCallbackHost } from './fiuu-vt';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const CALLBACK_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const CALLBACK_HOST = buildFiuuVtCallbackHost(CALLBACK_ATTEMPT_ID);

function reportedPayment(overrides: Partial<FiuuVtRecoveryPayment> = {}): FiuuVtRecoveryPayment {
 return {
  id: PAYMENT_ID,
  status: 'REPORTED',
  amount_rm: 12.5,
  created_by: PROFILE_ID,
  provider_order_id: 'RKJ_ORDER_001',
  provider_transaction_id: 'TXN001',
  provider_sale_reported_at: '2026-11-12T01:00:00.000Z',
  provider_status_checked_at: '2026-11-12T01:00:05.000Z',
  provider_result: {
   callbackAttemptId: CALLBACK_ATTEMPT_ID,
   callbackHost: CALLBACK_HOST,
   opType: 'STATUS',
   orderId: 'RKJ_ORDER_001',
   transactionId: 'TXN001',
   status: '00',
   amountRm: 12.5,
   currency: 'MYR',
   channel: 'RPP_DuitNowQR-Offline',
   payDate: '2026-11-12 09:00:00',
  },
  ...overrides,
 };
}

describe('Fiuu VT server reliability', () => {
 it('fulfills matching durable STATUS=00 evidence through the atomic recovery RPC', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { outcome: 'FULFILLED' }, error: null });
  const outcome = await recoverReportedFiuuVtPayment({ rpc } as never, reportedPayment());

  expect(outcome).toBe('fulfilled');
  expect(rpc).toHaveBeenCalledWith('recover_pos_fiuu_vt_reported_payment', {
   p_payment_id: PAYMENT_ID,
   p_confirmed_by: PROFILE_ID,
  });
 });

 it('atomically recovers a PENDING row that already contains exact STATUS=00 evidence', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { outcome: 'FULFILLED' }, error: null });

  await expect(recoverReportedFiuuVtPayment(
   { rpc } as never,
   reportedPayment({ status: 'PENDING' }),
  )).resolves.toBe('fulfilled');

  expect(rpc).toHaveBeenCalledTimes(1);
 });

 it('reports closed-shift success as quarantined without retrying fulfilment', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { outcome: 'QUARANTINED' }, error: null });

  await expect(recoverReportedFiuuVtPayment(
   { rpc } as never,
   reportedPayment({ status: 'PENDING' }),
  )).resolves.toBe('quarantined');
 });

 it.each([
  ['missing SALE evidence', { provider_sale_reported_at: null }],
  ['missing STATUS observation time', { provider_status_checked_at: null }],
  ['mismatched order', { provider_order_id: 'RKJ_ORDER_999' }],
  ['mismatched transaction', { provider_transaction_id: 'TXN999' }],
  ['mismatched amount', { amount_rm: 99 }],
  ['non-success status', {
   provider_result: {
    callbackAttemptId: CALLBACK_ATTEMPT_ID,
    callbackHost: CALLBACK_HOST,
    opType: 'STATUS', orderId: 'RKJ_ORDER_001', transactionId: 'TXN001',
    status: '55', amountRm: 12.5, currency: 'MYR',
    channel: 'RPP_DuitNowQR-Offline', payDate: null,
   },
  }],
 ])('rejects %s before invoking fulfillment', async (_label, overrides) => {
  const rpc = vi.fn();
  const outcome = await recoverReportedFiuuVtPayment(
   { rpc } as never,
   reportedPayment(overrides as Partial<FiuuVtRecoveryPayment>),
  );

  expect(outcome).toBe('invalid_evidence');
  expect(rpc).not.toHaveBeenCalled();
 });

 it('leaves a transient RPC failure retryable', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'temporary failure' } });

  await expect(recoverReportedFiuuVtPayment(
   { rpc } as never,
   reportedPayment(),
  )).resolves.toBe('retryable');
 });
});
