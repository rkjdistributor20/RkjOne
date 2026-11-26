import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getFiuuVtBranches: vi.fn(),
 recordFiuuVtRecoverySuccess: vi.fn(),
 recoverReportedFiuuVtPayment: vi.fn(),
}));

vi.mock('../../../../lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('../../../../lib/pos/fiuu-vt-server', () => ({
 getFiuuVtBranches: mocks.getFiuuVtBranches,
}));
vi.mock('../../../../lib/pos/fiuu-vt-reliability', () => ({
 recoverReportedFiuuVtPayment: mocks.recoverReportedFiuuVtPayment,
}));
vi.mock('../../../../lib/pos/fiuu-vt-recovery-heartbeat', () => ({
 recordFiuuVtRecoverySuccess: mocks.recordFiuuVtRecoverySuccess,
}));

import { GET } from './route';

const ORIGINAL_ENV = { ...process.env };
const CRON_SECRET = 'vercel-cron-secret-longer-than-32-characters';

function request(authorization = `Bearer ${CRON_SECRET}`) {
 return new Request('https://rkj.one/api/cron/fiuu-vt-recover', {
  method: 'GET',
  headers: { authorization },
 });
}

function arrangeService() {
 const branchQuery = {
  select: vi.fn(),
  in: vi.fn(),
  eq: vi.fn().mockResolvedValue({
   data: [{
    id: '22222222-2222-4222-8222-222222222222',
    organization_id: '11111111-1111-4111-8111-111111111111',
    branch_code: 'BR001',
   }],
   error: null,
  }),
 };
 branchQuery.select.mockReturnValue(branchQuery);
 branchQuery.in.mockReturnValue(branchQuery);

 const paymentQuery = {
  eq: vi.fn(),
  in: vi.fn(),
  not: vi.fn(),
  or: vi.fn(),
  lte: vi.fn(),
  order: vi.fn(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
 };
 paymentQuery.eq.mockReturnValue(paymentQuery);
 paymentQuery.in.mockReturnValue(paymentQuery);
 paymentQuery.not.mockReturnValue(paymentQuery);
 paymentQuery.or.mockReturnValue(paymentQuery);
 paymentQuery.lte.mockReturnValue(paymentQuery);
 paymentQuery.order.mockReturnValue(paymentQuery);

 const paymentTable = {
  select: vi.fn().mockReturnValue(paymentQuery),
  update: vi.fn(),
 };
 const service = {
  from: vi.fn((table: string) => table === 'branches' ? branchQuery : paymentTable),
  rpc: vi.fn(async (name: string) => ({
   data: name === 'reconcile_pos_fiuu_vt_review_status' ? { verified: 0 } : [], error: null,
  })),
 };
 mocks.createAdminClient.mockReturnValue(service);
 return service;
}

beforeEach(() => {
 vi.clearAllMocks();
 vi.spyOn(console, 'error').mockImplementation(() => undefined);
 process.env = {
  ...ORIGINAL_ENV,
  FIUU_RECONCILIATION_ENABLED: 'true',
  CRON_SECRET,
 };
 delete process.env.FIUU_VT_RECOVERY_ENABLED;
 mocks.getFiuuVtBranches.mockReturnValue(new Set(['BR001']));
 mocks.recordFiuuVtRecoverySuccess.mockResolvedValue(true);
 mocks.recoverReportedFiuuVtPayment.mockResolvedValue('fulfilled');
 arrangeService();
});

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
 vi.restoreAllMocks();
});

describe('Vercel Cron Fiuu VT recovery endpoint', () => {
 it('fails closed when reconciliation is disabled', async () => {
  delete process.env.FIUU_RECONCILIATION_ENABLED;

  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('lets the dedicated VT gate override the legacy shared gate', async () => {
  process.env.FIUU_RECONCILIATION_ENABLED = 'true';
  process.env.FIUU_VT_RECOVERY_ENABLED = 'false';

  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed when CRON_SECRET is missing or too short', async () => {
  process.env.CRON_SECRET = 'short';

  const response = await GET(request('Bearer short'));

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu reconciliation cron is not configured',
  });
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('requires the official Authorization: Bearer CRON_SECRET value', async () => {
  const missing = await GET(new Request('https://rkj.one/api/cron/fiuu-vt-recover'));
  const wrong = await GET(request('Bearer wrong-secret'));
  const alternateHeader = await GET(new Request('https://rkj.one/api/cron/fiuu-vt-recover', {
   headers: { 'x-cron-secret': CRON_SECRET },
  }));

  expect(missing.status).toBe(401);
  expect(wrong.status).toBe(401);
  expect(alternateHeader.status).toBe(401);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('runs the shared recovery pass for a valid Vercel Cron request', async () => {
  const response = await GET(request());

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   branches: ['BR001'],
   examined: 0,
   rotated: 0,
   results: {},
   automaticReview: { verified: 0 },
  });
  expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
  expect(mocks.recordFiuuVtRecoverySuccess).toHaveBeenCalledTimes(1);
 });

 it('does not finalize or classify an expired VT payment whose only SALE callback never arrived', async () => {
  const service = arrangeService();
  const pending = {
   id: '33333333-3333-4333-8333-333333333333',
   provider: 'fiuu_vt',
   status: 'PENDING',
   provider_result: null,
   fiuu_vt_review_required: false,
   fiuu_vt_cashier_released_at: null,
   expires_at: '2026-11-25T15:53:29Z',
  };
  const launched = { attempt_id: '44444444-4444-4444-8444-444444444444', state: 'LAUNCHED' };
  const before = { ...pending };
  const table = service.from('pos_online_payments');
  if (!('update' in table)) throw new Error('Missing payment table fixture');
  table.select.mockImplementation(() => {
   let matches = true;
   const value = (column: string) => pending[column as keyof typeof pending];
   const query = {
    eq(column: string, expected: unknown) {
     matches &&= value(column) === expected; // includes the unavailable provider STATUS result
     return query;
    },
    not(column: string, operator: string, expected: unknown) {
     expect(operator).toBe('is');
     matches &&= value(column) !== expected; // in particular, not a released lane
     return query;
    },
    in(column: string, allowed: unknown[]) {
     if (column === 'status') matches &&= allowed.includes(pending.status);
     return query;
    },
    or() { return query; },
    order() { return query; },
    limit: async () => ({ data: matches ? [pending] : [], error: null }),
   };
   return query;
  });
  service.rpc.mockImplementation(async (name: string) => {
   if (name === 'reconcile_pos_fiuu_vt_review_status') return { data: { verified: 0 }, error: null };
   if (name !== 'list_pos_fiuu_vt_received_attempts') throw new Error(`Unexpected write RPC: ${name}`);
   return { data: [launched].filter(attempt => attempt.state === 'RECEIVED'), error: null };
  });

  const response = await GET(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true, examined: 0, receivedAttemptsExamined: 0, releasedExamined: 0, quarantined: 0,
  });
  expect(service.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.recoverReportedFiuuVtPayment).not.toHaveBeenCalled();
  expect(table.update).not.toHaveBeenCalled();
  expect(pending).toEqual(before);
 });

 it('returns 503 when a successful run cannot durably record its heartbeat', async () => {
  mocks.recordFiuuVtRecoverySuccess.mockResolvedValue(false);

  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu VT recovery heartbeat could not be recorded',
  });
  expect(mocks.recordFiuuVtRecoverySuccess).toHaveBeenCalledTimes(1);
 });

 it('does not record a heartbeat for an unsuccessful recovery run', async () => {
  mocks.getFiuuVtBranches.mockReturnValue(new Set());

  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(mocks.recordFiuuVtRecoverySuccess).not.toHaveBeenCalled();
 });

 it('returns 503 without leaking details when the shared runner throws', async () => {
  mocks.createAdminClient.mockImplementation(() => {
   throw new Error('database unavailable');
  });

  const response = await GET(request());

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu VT recovery cron failed',
  });
 });

 it('is scheduled every minute in vercel.json', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

  expect(config.crons).toContainEqual({
   path: '/api/cron/fiuu-vt-recover',
   schedule: '* * * * *',
  });
 });
});
