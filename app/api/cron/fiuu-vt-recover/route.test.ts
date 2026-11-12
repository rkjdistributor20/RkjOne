import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getFiuuVtBranches: vi.fn(),
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
  order: vi.fn(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
 };
 paymentQuery.eq.mockReturnValue(paymentQuery);
 paymentQuery.in.mockReturnValue(paymentQuery);
 paymentQuery.not.mockReturnValue(paymentQuery);
 paymentQuery.or.mockReturnValue(paymentQuery);
 paymentQuery.order.mockReturnValue(paymentQuery);

 const paymentTable = {
  select: vi.fn().mockReturnValue(paymentQuery),
  update: vi.fn(),
 };
 const service = {
  from: vi.fn((table: string) => table === 'branches' ? branchQuery : paymentTable),
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
 mocks.getFiuuVtBranches.mockReturnValue(new Set(['BR001']));
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
  });
  expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
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
