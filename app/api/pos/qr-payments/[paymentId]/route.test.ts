import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 getCurrentProfile: vi.fn(),
 createAdminClient: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 posAccessErrorStatus: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/pos/access', () => ({
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
 posAccessErrorStatus: mocks.posAccessErrorStatus,
}));
vi.mock('@/lib/pos/fiuu', () => ({
 isFiuuReconciliationExpired: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/pos/fiuu-cloudecr', () => ({
 buildFiuuCloudEcrReferenceId: vi.fn(),
}));
vi.mock('@/lib/pos/fiuu-cloudecr-runtime', () => ({
 reconcileFiuuCloudEcrLast: vi.fn(),
}));

import { GET } from './route';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SHIFT_ID = '44444444-4444-4444-8444-444444444444';
const TRANSACTION_ID = '22222222-2222-4222-8222-222222222222';

function payment(status: 'REPORTED' | 'PAID') {
 return {
  id: PAYMENT_ID,
  branch_id: BRANCH_ID,
  shift_id: SHIFT_ID,
  amount_rm: 12.5,
  status,
  provider: 'fiuu',
  gateway_ref: 'TXN001',
  paid_at: status === 'PAID' ? '2026-10-26T01:00:00.000Z' : null,
  transaction_id: status === 'PAID' ? TRANSACTION_ID : null,
  expires_at: '2026-10-26T01:03:00.000Z',
  provider_result: {
   statusCode: '00',
  },
  provider_order_id: null,
  provider_status_checked_at: '2026-10-26T01:00:00.000Z',
 };
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.getCurrentProfile.mockResolvedValue({
  id: '55555555-5555-4555-8555-555555555555',
  organization_id: '66666666-6666-4666-8666-666666666666',
  role: 'STAFF',
 });
 mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
 mocks.posAccessErrorStatus.mockReturnValue(403);
});

describe('Fiuu OPA reported recovery', () => {
 it('retries idempotent fulfillment and returns the paid receipt', async () => {
  const query = {
   select: vi.fn(),
   eq: vi.fn(),
   maybeSingle: vi.fn()
    .mockResolvedValueOnce({ data: payment('REPORTED'), error: null })
    .mockResolvedValueOnce({ data: payment('PAID'), error: null })
    .mockResolvedValueOnce({ data: { receipt_data: { receipt_number: 'RC-001' } }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const rpc = vi.fn().mockResolvedValue({
   data: { transaction_id: TRANSACTION_ID },
   error: null,
  });
  mocks.createAdminClient.mockReturnValue({
   from: vi.fn().mockReturnValue(query),
   rpc,
  });

  const response = await GET(
   new Request(`http://localhost/api/pos/qr-payments/${PAYMENT_ID}`),
   { params: Promise.resolve({ paymentId: PAYMENT_ID }) },
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   payment: { id: PAYMENT_ID, status: 'PAID', transaction_id: TRANSACTION_ID },
   result: { receipt_number: 'RC-001' },
  });
  expect(rpc).toHaveBeenCalledWith('fulfill_pos_fiuu_payment', {
   p_payment_id: PAYMENT_ID,
   p_gateway_ref: 'TXN001',
   p_amount: 12.5,
   p_currency: 'MYR',
   p_channel_id: '24',
  });
 });
});
