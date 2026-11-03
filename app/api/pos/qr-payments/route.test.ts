import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertAreaManagerScheduledForPos: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createFiuuDynamicQr: vi.fn(),
 createAdminClient: vi.fn(),
 createClient: vi.fn(),
 enforceRateLimit: vi.fn(),
 getCurrentProfile: vi.fn(),
 getFiuuOpaConfig: vi.fn(),
 getFiuuOpaConfigurationFingerprint: vi.fn(),
 getPosQrPaymentMode: vi.fn(),
 inventoryRpc: vi.fn(),
 isFiuuOpaEnabledForBranch: vi.fn(),
 isFiuuOpaRolloutActive: vi.fn(),
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
 createFiuuDynamicQr: mocks.createFiuuDynamicQr,
 getFiuuEnvironment: vi.fn(() => 'sandbox'),
 getFiuuOpaConfig: mocks.getFiuuOpaConfig,
 getFiuuOpaConfigurationFingerprint: mocks.getFiuuOpaConfigurationFingerprint,
 getPosQrPaymentMode: mocks.getPosQrPaymentMode,
 isFiuuOpaApplicationUnavailable: vi.fn(() => false),
 isFiuuOpaDefinitiveRejection: vi.fn(() => false),
 isFiuuReconciliationExpired: vi.fn(() => false),
 malaysiaBusinessDate: vi.fn(() => '2026-11-03'),
}));
vi.mock('@/lib/pos/fiuu-opa-server', () => ({
 isFiuuOpaEnabledForBranch: mocks.isFiuuOpaEnabledForBranch,
 isFiuuOpaRolloutActive: mocks.isFiuuOpaRolloutActive,
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
const OPA_CONFIG = {
 applicationCode: 'APP001',
 secretKey: 'secret-001',
 storeId: 'STORE001',
 terminalId: 'TERM001',
 credentialVersion: 'cred-v1',
 channelId: '24' as const,
 environment: 'sandbox' as const,
 precreateUrl: 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php',
 inquiryUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/inquiry.php',
 reversalUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/reversal.php',
 validitySeconds: 180,
};

function arrangeReadyPaymentPath() {
 const inventoryLocationQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn().mockResolvedValue({
   data: { id: '77777777-7777-4777-8777-777777777777' },
   error: null,
  }),
 };
 inventoryLocationQuery.select.mockReturnValue(inventoryLocationQuery);
 inventoryLocationQuery.eq.mockReturnValue(inventoryLocationQuery);

 const productsQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn().mockResolvedValue({
   data: [{ id: PRODUCT_ID, price: 2.5 }],
   error: null,
  }),
 };
 productsQuery.select.mockReturnValue(productsQuery);
 productsQuery.eq.mockReturnValue(productsQuery);

 const supabase = {
  from: vi.fn((table: string) => (
   table === 'inventory_locations' ? inventoryLocationQuery : productsQuery
  )),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
 };
 mocks.createClient.mockResolvedValue(supabase);
 mocks.inventoryRpc.mockResolvedValue({ data: null, error: null });

 const adminQuery = {
  update: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  lte: vi.fn().mockResolvedValue({ data: null, error: null }),
  contains: vi.fn(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  single: vi.fn().mockResolvedValue({ data: { id: 'payment-id' }, error: null }),
 };
 adminQuery.update.mockReturnValue(adminQuery);
 adminQuery.select.mockReturnValue(adminQuery);
 adminQuery.insert.mockReturnValue(adminQuery);
 adminQuery.eq.mockReturnValue(adminQuery);
 adminQuery.in.mockReturnValue(adminQuery);
 adminQuery.contains.mockReturnValue(adminQuery);
 const admin = { from: vi.fn().mockReturnValue(adminQuery) };
 mocks.createAdminClient.mockReturnValue(admin);

 return { admin, adminQuery };
}

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
 mocks.assertOfficialPosDevice.mockResolvedValue({
  branchCode: 'BR001',
  deviceCode: 'POS-BR001-TEST',
 });
 mocks.assertActivePosShiftMember.mockResolvedValue(undefined);
 mocks.posAccessErrorStatus.mockReturnValue(403);
 mocks.isFiuuOpaEnabledForBranch.mockReturnValue(false);
 mocks.getFiuuOpaConfig.mockReturnValue(OPA_CONFIG);
 mocks.getFiuuOpaConfigurationFingerprint.mockReturnValue('a'.repeat(64));
 mocks.isFiuuOpaRolloutActive.mockResolvedValue(false);
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

 it('fails closed before insert or provider pre-create when the full rollout is not ACTIVE', async () => {
  mocks.isFiuuOpaEnabledForBranch.mockReturnValue(true);
  const { admin, adminQuery } = arrangeReadyPaymentPath();

  const response = await POST(paymentRequest());

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_OPA_ROLLOUT_NOT_ACTIVE',
  });
  expect(mocks.isFiuuOpaRolloutActive).toHaveBeenCalledWith(
   admin,
   SCOPE,
   OPA_CONFIG,
  );
  expect(adminQuery.insert).not.toHaveBeenCalled();
  expect(mocks.createFiuuDynamicQr).not.toHaveBeenCalled();
 });
});
