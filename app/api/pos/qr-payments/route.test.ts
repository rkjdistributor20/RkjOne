import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertAreaManagerScheduledForPos: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createAdminClient: vi.fn(),
 createClient: vi.fn(),
 enforceRateLimit: vi.fn(),
 getCurrentProfile: vi.fn(),
 getPosQrPaymentMode: vi.fn(),
 inventoryRpc: vi.fn(),
 isFiuuOpaEnabledForBranch: vi.fn(),
 isValidPosPaymentIdempotencyKey: vi.fn(),
 posAccessErrorStatus: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock('@/lib/pos/access', () => ({
 assertActivePosShiftMember: mocks.assertActivePosShiftMember,
 assertAreaManagerScheduledForPos: mocks.assertAreaManagerScheduledForPos,
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
 posAccessErrorStatus: mocks.posAccessErrorStatus,
}));
vi.mock('@/lib/pos/device-auth', () => ({
 assertOfficialPosDevice: mocks.assertOfficialPosDevice,
}));
vi.mock('@/lib/supabase/inventory-rpc', () => ({
 inventoryRpc: mocks.inventoryRpc,
}));
vi.mock('@/lib/supabase/server', () => ({
 createClient: mocks.createClient,
}));
vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/pos/fiuu', () => ({
 FIUU_CALLBACK_GRACE_MS: 20 * 60 * 1000,
 createFiuuDynamicQr: vi.fn(),
 getFiuuEnvironment: vi.fn(() => 'sandbox'),
 getFiuuOpaConfig: vi.fn(),
 getPosQrPaymentMode: mocks.getPosQrPaymentMode,
 isFiuuOpaApplicationUnavailable: vi.fn(() => false),
 isFiuuOpaDefinitiveRejection: vi.fn(() => false),
 isFiuuReconciliationExpired: vi.fn(() => false),
 malaysiaBusinessDate: vi.fn(() => '2026-11-03'),
}));
vi.mock('@/lib/pos/fiuu-opa-server', () => ({
 isFiuuOpaEnabledForBranch: mocks.isFiuuOpaEnabledForBranch,
}));
vi.mock('@/lib/pos/fiuu-cloudecr', () => ({
 buildFiuuCloudEcrReferenceId: vi.fn(),
 getFiuuCloudEcrConfig: vi.fn(),
}));
vi.mock('@/lib/pos/fiuu-cloudecr-runtime', () => ({
 sendFiuuCloudEcrSale: vi.fn(),
}));
vi.mock('@/lib/pos/fiuu-cloudecr-server', () => ({
 getFiuuCloudEcrValiditySeconds: vi.fn(),
 isFiuuCloudEcrEnabledForBranch: vi.fn(() => false),
}));
vi.mock('@/lib/pos/fiuu-vt', () => ({
 buildFiuuVtOrderId: vi.fn(),
}));
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 getFiuuVtValiditySeconds: vi.fn(),
 isFiuuVtEnabledForBranch: vi.fn(() => false),
}));
vi.mock('@/lib/pos/payment-idempotency', () => ({
 isSamePosPaymentIntent: vi.fn(() => false),
 isValidPosPaymentIdempotencyKey: mocks.isValidPosPaymentIdempotencyKey,
}));

import { POST } from './route';

const ORGANIZATION_ID = '66666666-6666-4666-8666-666666666666';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SHIFT_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
const SCOPE = {
 organizationId: ORGANIZATION_ID,
 branchId: BRANCH_ID,
 branchCode: 'BR001',
};

function paymentRequest() {
 return new Request('http://localhost/api/pos/qr-payments', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
   idempotency_key: 'fiuu-opa-br001-attempt-0001',
   branchId: BRANCH_ID,
   shiftId: SHIFT_ID,
   payment_method: 'QR',
   cash_amount: 0,
   qr_amount: 2.5,
   items: [{ product_id: PRODUCT_ID, quantity: 1 }],
  }),
 });
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.enforceRateLimit.mockReturnValue(null);
 mocks.getCurrentProfile.mockResolvedValue({
  id: '55555555-5555-4555-8555-555555555555',
  organization_id: ORGANIZATION_ID,
  role: 'STAFF',
 });
 mocks.getPosQrPaymentMode.mockReturnValue('fiuu');
 mocks.isValidPosPaymentIdempotencyKey.mockReturnValue(true);
 mocks.createClient.mockResolvedValue({});
 mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
 mocks.assertAreaManagerScheduledForPos.mockResolvedValue(undefined);
 mocks.assertOfficialPosDevice.mockResolvedValue({ branchCode: 'BR001' });
 mocks.assertActivePosShiftMember.mockResolvedValue(undefined);
 mocks.posAccessErrorStatus.mockReturnValue(403);
 mocks.isFiuuOpaEnabledForBranch.mockReturnValue(false);
});

afterEach(() => {
 vi.restoreAllMocks();
});

describe('Fiuu OPA payment rollout gate', () => {
 it('fails closed when the organization and branch tuple is not configured', async () => {
  const response = await POST(paymentRequest());

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_OPA_BRANCH_NOT_ENABLED',
  });
  expect(mocks.isFiuuOpaEnabledForBranch).toHaveBeenCalledWith(SCOPE);
  expect(mocks.inventoryRpc).not.toHaveBeenCalled();
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed before stock or payment writes when rollout mapping is partial', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.isFiuuOpaEnabledForBranch.mockImplementation(() => {
   throw new Error('Konfigurasi Fiuu OPA BR001 tidak lengkap');
  });

  const response = await POST(paymentRequest());

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Konfigurasi pilot Fiuu OPA tidak sah. Hubungi HQ.',
  });
  expect(mocks.isFiuuOpaEnabledForBranch).toHaveBeenCalledWith(SCOPE);
  expect(mocks.inventoryRpc).not.toHaveBeenCalled();
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });
});
