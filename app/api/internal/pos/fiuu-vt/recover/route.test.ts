import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getFiuuVtBranches: vi.fn(),
 recoverReportedFiuuVtPayment: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 getFiuuVtBranches: mocks.getFiuuVtBranches,
}));
vi.mock('@/lib/pos/fiuu-vt-reliability', () => ({
 recoverReportedFiuuVtPayment: mocks.recoverReportedFiuuVtPayment,
}));
vi.mock('../../../../../../lib/pos/fiuu-vt-server', () => ({
 getFiuuVtBranches: mocks.getFiuuVtBranches,
}));
vi.mock('../../../../../../lib/pos/fiuu-vt-reliability', () => ({
 recoverReportedFiuuVtPayment: mocks.recoverReportedFiuuVtPayment,
}));
vi.mock('../../../../../../lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/pos/fiuu-vt-recovery-worker', async () => (
 import('../../../../../../lib/pos/fiuu-vt-recovery-worker')
));

import { POST } from './route';

const ORIGINAL_ENV = { ...process.env };
const SECRET = 'fiuu-vt-worker-secret-longer-than-32-chars';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function request(token = SECRET, authorization = `Bearer ${token}`) {
 return new Request('http://localhost/api/internal/pos/fiuu-vt/recover', {
  method: 'POST',
  headers: { authorization },
 });
}

function payment(id: string): Record<string, unknown> {
 return {
  id,
  status: 'REPORTED',
  amount_rm: 12.5,
  created_by: '44444444-4444-4444-8444-444444444444',
  provider_order_id: `RKJ_ORDER_${id}`,
  provider_transaction_id: `TXN_${id}`,
  provider_result: { opType: 'STATUS', status: '00' },
  provider_sale_reported_at: '2026-11-12T01:00:00.000Z',
  fiuu_vt_recovery_attempts: 0,
  fiuu_vt_recovery_next_at: null,
 };
}

function arrangeService(input: {
 branchRows?: Array<Record<string, unknown>>;
 payments?: Array<Record<string, unknown>>;
 branchError?: unknown;
 paymentError?: unknown;
 rotationError?: unknown;
} = {}) {
 const branchQuery = {
  select: vi.fn(),
  in: vi.fn(),
  eq: vi.fn().mockResolvedValue({
   data: input.branchRows ?? [{
    id: BRANCH_ID,
    organization_id: ORGANIZATION_ID,
    branch_code: 'BR001',
   }],
   error: input.branchError ?? null,
  }),
 };
 branchQuery.select.mockReturnValue(branchQuery);
 branchQuery.in.mockReturnValue(branchQuery);

 const paymentQuery = {
  eq: vi.fn(),
  in: vi.fn(),
  not: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  limit: vi.fn().mockResolvedValue({
   data: input.payments ?? [],
   error: input.paymentError ?? null,
  }),
 };
 paymentQuery.eq.mockReturnValue(paymentQuery);
 paymentQuery.in.mockReturnValue(paymentQuery);
 paymentQuery.not.mockReturnValue(paymentQuery);
 paymentQuery.or.mockReturnValue(paymentQuery);
 paymentQuery.order.mockReturnValue(paymentQuery);

 const rotationQuery = {
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn().mockResolvedValue({
   data: input.rotationError ? null : { id: PAYMENT_ID },
   error: input.rotationError ?? null,
  }),
 };
 rotationQuery.eq.mockReturnValue(rotationQuery);
 rotationQuery.select.mockReturnValue(rotationQuery);

 const paymentTable = {
  select: vi.fn().mockReturnValue(paymentQuery),
  update: vi.fn().mockReturnValue(rotationQuery),
 };
 const service = {
  from: vi.fn((table: string) => table === 'branches' ? branchQuery : paymentTable),
 };
 mocks.createAdminClient.mockReturnValue(service);
 return { branchQuery, paymentQuery, paymentTable, rotationQuery, service };
}

beforeEach(() => {
 vi.clearAllMocks();
 vi.spyOn(console, 'error').mockImplementation(() => undefined);
 process.env = {
  ...ORIGINAL_ENV,
  FIUU_RECONCILIATION_ENABLED: 'true',
  FIUU_RECONCILIATION_SECRET: SECRET,
 };
 mocks.getFiuuVtBranches.mockReturnValue(new Set(['BR001']));
 mocks.recoverReportedFiuuVtPayment.mockResolvedValue('fulfilled');
});

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
 vi.restoreAllMocks();
});

describe('Fiuu VT reported-payment recovery worker', () => {
 it('fails closed while the reconciliation worker is disabled', async () => {
  delete process.env.FIUU_RECONCILIATION_ENABLED;

  const response = await POST(request());

  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed when the worker secret is missing or too short', async () => {
  process.env.FIUU_RECONCILIATION_SECRET = 'short';

  const response = await POST(request('short'));

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu reconciliation worker is not configured',
  });
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('requires the exact Bearer worker secret before opening the service client', async () => {
  const wrongToken = await POST(request('wrong-token'));
  const wrongScheme = await POST(request(SECRET, `Basic ${SECRET}`));

  expect(wrongToken.status).toBe(401);
  expect(wrongScheme.status).toBe(401);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed when the configured branch mapping is incomplete', async () => {
  arrangeService({ branchRows: [] });

  const response = await POST(request());

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu VT recovery branch mapping is incomplete',
  });
  expect(mocks.recoverReportedFiuuVtPayment).not.toHaveBeenCalled();
 });

 it('skips one broken branch mapping without blocking healthy branch recovery', async () => {
  mocks.getFiuuVtBranches.mockReturnValue(new Set(['BR001', 'BR002']));
  const { paymentQuery } = arrangeService({
   branchRows: [{
    id: BRANCH_ID,
    organization_id: ORGANIZATION_ID,
    branch_code: 'BR001',
   }],
  });

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   branch: 'BR001',
   branches: ['BR001'],
   skippedBranches: ['BR002'],
   examined: 0,
  });
  expect(paymentQuery.in).toHaveBeenCalledWith('branch_id', [BRANCH_ID]);
  expect(paymentQuery.in).toHaveBeenCalledWith(
   'sale_payload->>fiuu_branch_code',
   ['BR001'],
  );
 });

 it('fails closed when the recovery queue cannot be read', async () => {
  arrangeService({ paymentError: { message: 'unavailable' } });

  const response = await POST(request());

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu VT recovery queue unavailable',
  });
  expect(mocks.recoverReportedFiuuVtPayment).not.toHaveBeenCalled();
 });

 it('scans 100 structurally complete configured-branch REPORTED rows', async () => {
  const row = payment(PAYMENT_ID);
  const { paymentQuery, service } = arrangeService({ payments: [row] });

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   branch: 'BR001',
   branches: ['BR001'],
   examined: 1,
   rotated: 0,
   results: { fulfilled: 1 },
  });
  expect(paymentQuery.eq).toHaveBeenCalledWith('provider', 'fiuu_vt');
  expect(paymentQuery.eq).toHaveBeenCalledWith('status', 'REPORTED');
  expect(paymentQuery.eq).toHaveBeenCalledWith('fiuu_vt_review_required', false);
  expect(paymentQuery.eq).toHaveBeenCalledWith('provider_result->>opType', 'STATUS');
  expect(paymentQuery.eq).toHaveBeenCalledWith('provider_result->>status', '00');
  expect(paymentQuery.in).toHaveBeenCalledWith('organization_id', [ORGANIZATION_ID]);
  expect(paymentQuery.in).toHaveBeenCalledWith('branch_id', [BRANCH_ID]);
  expect(paymentQuery.in).toHaveBeenCalledWith(
   'sale_payload->>fiuu_branch_code',
   ['BR001'],
  );
  expect(paymentQuery.not).toHaveBeenCalledWith('created_by', 'is', null);
  expect(paymentQuery.not).toHaveBeenCalledWith('provider_order_id', 'is', null);
  expect(paymentQuery.not).toHaveBeenCalledWith('provider_transaction_id', 'is', null);
  expect(paymentQuery.not).toHaveBeenCalledWith('provider_result', 'is', null);
  expect(paymentQuery.not).toHaveBeenCalledWith('provider_sale_reported_at', 'is', null);
  expect(paymentQuery.or).toHaveBeenCalledWith(expect.stringMatching(
   /^fiuu_vt_recovery_next_at\.is\.null,fiuu_vt_recovery_next_at\.lte\./,
  ));
  expect(paymentQuery.order).toHaveBeenCalledWith(
   'fiuu_vt_recovery_next_at',
   { ascending: true, nullsFirst: true },
  );
  expect(paymentQuery.limit).toHaveBeenCalledWith(100);
  expect(mocks.recoverReportedFiuuVtPayment).toHaveBeenCalledWith(service, row);
 });

 it('continues past poison rows, recovers a later valid row, and rotates deferred rows', async () => {
  const invalid = payment('invalid');
  const throwing = payment('throwing');
  const valid = payment('valid');
  const { paymentTable, rotationQuery, service } = arrangeService({
   payments: [invalid, throwing, valid],
  });
  mocks.recoverReportedFiuuVtPayment
   .mockResolvedValueOnce('invalid_evidence')
   .mockRejectedValueOnce(new Error('poison row'))
   .mockResolvedValueOnce('fulfilled');

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   examined: 3,
   rotated: 2,
   results: {
    invalid_evidence: 1,
    retryable: 1,
    fulfilled: 1,
   },
  });
  expect(mocks.recoverReportedFiuuVtPayment).toHaveBeenNthCalledWith(1, service, invalid);
  expect(mocks.recoverReportedFiuuVtPayment).toHaveBeenNthCalledWith(2, service, throwing);
  expect(mocks.recoverReportedFiuuVtPayment).toHaveBeenNthCalledWith(3, service, valid);
  expect(paymentTable.update).toHaveBeenCalledTimes(2);
  expect(paymentTable.update).toHaveBeenNthCalledWith(1, {
   fiuu_vt_recovery_attempted_at: expect.any(String),
   fiuu_vt_recovery_next_at: expect.any(String),
   fiuu_vt_recovery_attempts: 1,
   fiuu_vt_recovery_last_error: 'INVALID_STORED_EVIDENCE',
  });
  expect(paymentTable.update).toHaveBeenNthCalledWith(2, {
   fiuu_vt_recovery_attempted_at: expect.any(String),
   fiuu_vt_recovery_next_at: expect.any(String),
   fiuu_vt_recovery_attempts: 1,
   fiuu_vt_recovery_last_error: 'FULFILLMENT_RETRYABLE',
  });
  for (const [update] of paymentTable.update.mock.calls) {
   expect(update).not.toHaveProperty('provider_status_checked_at');
   expect(Date.parse(update.fiuu_vt_recovery_next_at)
    - Date.parse(update.fiuu_vt_recovery_attempted_at)).toBe(30_000);
  }
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'invalid');
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(2, 'status', 'REPORTED');
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(3, 'fiuu_vt_review_required', false);
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(4, 'fiuu_vt_recovery_attempts', 0);
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(5, 'id', 'throwing');
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(6, 'status', 'REPORTED');
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(7, 'fiuu_vt_review_required', false);
  expect(rotationQuery.eq).toHaveBeenNthCalledWith(8, 'fiuu_vt_recovery_attempts', 0);
  expect(rotationQuery.select).toHaveBeenCalledTimes(2);
  expect(rotationQuery.select).toHaveBeenCalledWith('id');
 });

 it('does not report a poison row as rotated when its queue update fails', async () => {
  arrangeService({
   payments: [payment('invalid')],
   rotationError: { message: 'write failed' },
  });
  mocks.recoverReportedFiuuVtPayment.mockResolvedValue('invalid_evidence');

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   examined: 1,
   rotated: 0,
   results: { invalid_evidence: 1 },
  });
 });
});
