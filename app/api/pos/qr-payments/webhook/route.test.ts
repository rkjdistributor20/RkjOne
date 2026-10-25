import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 enforceRateLimit: vi.fn(),
 getFiuuOpaConfig: vi.fn(),
 verifyFiuuOpaSignature: vi.fn(),
 verifyPosBillplzSignature: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock('@/lib/pos/fiuu', () => ({
 getFiuuOpaConfig: mocks.getFiuuOpaConfig,
 verifyFiuuOpaSignature: mocks.verifyFiuuOpaSignature,
}));
vi.mock('@/lib/pos/fiuu-opa-server', () => ({
 FIUU_OPA_PILOT_BRANCH: 'BR001',
}));
vi.mock('@/lib/pos/qr-gateway', () => ({
 verifyPosBillplzSignature: mocks.verifyPosBillplzSignature,
}));

import { POST } from './route';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SIGNATURE = 'a'.repeat(64);

function requestBody() {
 return {
  applicationCode: 'APP001',
  referenceId: PAYMENT_ID,
  molTransactionId: 'TXN001',
  amount: '12.50',
  currencyCode: 'MYR',
  channelId: '24',
  statusCode: '00',
  signature: SIGNATURE,
  secretKey: 'must-never-be-persisted',
  metadata: { untrusted: true },
 };
}

function webhookRequest(body = requestBody()) {
 return new Request('http://localhost/api/pos/qr-payments/webhook', {
  method: 'POST',
  headers: {
   'content-type': 'application/json',
   'x-forwarded-for': '203.0.113.8',
  },
  body: JSON.stringify(body),
 });
}

function arrangeAdmin(
 rpcResults: Array<{ data: unknown; error: { message: string } | null }>,
 paymentOverrides: Record<string, unknown> = {},
) {
 const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn().mockResolvedValue({
   data: {
    id: PAYMENT_ID,
    branch_id: BRANCH_ID,
    status: 'PENDING',
    provider: 'fiuu',
    amount_rm: 12.5,
    gateway_ref: 'TXN001',
    transaction_id: null,
    sale_payload: {
     branchId: BRANCH_ID,
     fiuu_branch_code: 'BR001',
     fiuu_device_code: 'POS-BR001-01',
    },
    ...paymentOverrides,
   },
   error: null,
  }),
 };
 query.select.mockReturnValue(query);
 query.eq.mockReturnValue(query);

 const rpc = vi.fn();
 for (const result of rpcResults) rpc.mockResolvedValueOnce(result);
 mocks.createAdminClient.mockReturnValue({
  from: vi.fn().mockReturnValue(query),
  rpc,
 });
 return rpc;
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.enforceRateLimit.mockReturnValue(null);
 mocks.getFiuuOpaConfig.mockReturnValue({
  applicationCode: 'APP001',
  secretKey: 'server-only-secret',
  channelId: '24',
 });
 mocks.verifyFiuuOpaSignature.mockReturnValue(true);
});

describe('Fiuu OPA webhook durability', () => {
 it('commits a sanitized REPORTED callback before invoking fulfillment', async () => {
  const rpc = arrangeAdmin([
   { data: { payment_id: PAYMENT_ID, status: 'REPORTED' }, error: null },
   { data: { transaction_id: '22222222-2222-4222-8222-222222222222' }, error: null },
  ]);

  const response = await POST(webhookRequest());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ ok: true, status: 'PAID' });
  expect(rpc).toHaveBeenNthCalledWith(1, 'report_pos_fiuu_payment', {
   p_payment_id: PAYMENT_ID,
   p_gateway_ref: 'TXN001',
   p_amount: 12.5,
   p_currency: 'MYR',
   p_channel_id: '24',
   p_status_code: '00',
   p_provider_result: {
    applicationCode: 'APP001',
    referenceId: PAYMENT_ID,
    molTransactionId: 'TXN001',
    amount: '12.50',
    currencyCode: 'MYR',
    channelId: '24',
    statusCode: '00',
    signature: SIGNATURE,
   },
  });
  expect(rpc).toHaveBeenNthCalledWith(2, 'fulfill_pos_fiuu_payment', {
   p_payment_id: PAYMENT_ID,
   p_gateway_ref: 'TXN001',
   p_amount: 12.5,
   p_currency: 'MYR',
   p_channel_id: '24',
  });
 });

 it('returns REPORTED when fulfillment fails after the durable report succeeds', async () => {
  const rpc = arrangeAdmin([
   { data: { payment_id: PAYMENT_ID, status: 'REPORTED' }, error: null },
   { data: null, error: { message: 'stock conflict' } },
  ]);

  const response = await POST(webhookRequest());

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu payment fulfillment failed',
   status: 'REPORTED',
  });
  expect(rpc).toHaveBeenCalledTimes(2);
 });

 it('treats an existing PAID report as a successful idempotent replay', async () => {
  const rpc = arrangeAdmin([
   {
    data: {
     payment_id: PAYMENT_ID,
     status: 'PAID',
     transaction_id: '22222222-2222-4222-8222-222222222222',
    },
    error: null,
   },
  ]);

  const response = await POST(webhookRequest());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   status: 'PAID',
   replay: true,
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('report_pos_fiuu_payment', expect.any(Object));
 });

 it('does not invoke fulfillment when the durable report fails', async () => {
  const rpc = arrangeAdmin([
   { data: null, error: { message: 'evidence mismatch' } },
  ]);

  const response = await POST(webhookRequest());

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({ error: 'Fiuu payment report failed' });
  expect(rpc).toHaveBeenCalledTimes(1);
 });

 it('rejects a callback for an intent outside the BR001 pilot boundary', async () => {
  const rpc = arrangeAdmin([], {
   sale_payload: {
    branchId: BRANCH_ID,
    fiuu_branch_code: 'BR002',
    fiuu_device_code: 'POS-BR002-01',
   },
  });

  const response = await POST(webhookRequest());

  expect(response.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect(mocks.getFiuuOpaConfig).not.toHaveBeenCalled();
 });

 it('rejects a provider amount that is not canonical two-decimal MYR', async () => {
  const rpc = arrangeAdmin([]);
  const response = await POST(webhookRequest({ ...requestBody(), amount: '12.500' }));

  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
 });
});

describe('Fiuu OPA migration lock order', () => {
 const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20261026120000_durable_fiuu_opa_notification.sql',
 ), 'utf8');

 function functionBody(name: string, nextName: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf(nextName, start);
  return migration.slice(start, end === -1 ? undefined : end);
 }

 it.each([
  ['report_pos_fiuu_payment', 'REVOKE ALL ON FUNCTION public.report_pos_fiuu_payment'],
  ['fulfill_pos_fiuu_payment', 'REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment'],
 ])('%s locks shift before payment and checks the payment ownership tuple', (name, endMarker) => {
  const sql = functionBody(name, endMarker);
  const shiftLock = sql.indexOf('FROM public.pos_shifts');
  const paymentLock = sql.lastIndexOf('FROM public.pos_online_payments');

  expect(sql).toContain('SELECT shift_id INTO v_shift_id');
  expect(shiftLock).toBeGreaterThan(-1);
  expect(paymentLock).toBeGreaterThan(shiftLock);
  expect(sql).toContain('v_payment.shift_id IS DISTINCT FROM v_shift_id');
  expect(sql).toContain('v_payment.organization_id IS DISTINCT FROM v_shift_organization_id');
  expect(sql).toContain('v_payment.branch_id IS DISTINCT FROM v_shift_branch_id');
  expect(sql).toContain("v_branch_code IS DISTINCT FROM 'BR001'");
  expect(sql).toContain("v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001'");
  expect(sql).toContain("v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT");
  expect(sql).toContain("v_shift_status IS DISTINCT FROM 'OPEN'");
 });

 it('requires canonical amount evidence and a locked server-side pricing snapshot', () => {
  const reportSql = functionBody(
   'report_pos_fiuu_payment',
   'REVOKE ALL ON FUNCTION public.report_pos_fiuu_payment',
  );
  const fulfillSql = functionBody(
   'fulfill_pos_fiuu_payment',
   'REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment',
  );

  expect(reportSql).toContain("'^(0|[1-9][0-9]*)\\.[0-9]{2}$'");
  expect(fulfillSql).toContain("jsonb_typeof(v_payment.sale_payload->'pricing_snapshot')");
  expect(fulfillSql).toContain('FOR UPDATE OF product');
  expect(fulfillSql).toContain('Fiuu OPA product price changed after payment started');
 });
});
