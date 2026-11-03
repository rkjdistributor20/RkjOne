import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertCanAccessPosBranch: vi.fn(),
 createAdminClient: vi.fn(),
 createClient: vi.fn(),
 enforceRateLimit: vi.fn(),
 getCurrentProfile: vi.fn(),
 getFiuuCloudEcrConfig: vi.fn(),
 getFiuuOpaConfig: vi.fn(),
 getFiuuStaticQrConfig: vi.fn(),
 getPosQrPaymentMode: vi.fn(),
 isFiuuCloudEcrEnabledForBranch: vi.fn(),
 isFiuuOpaEnabledForBranch: vi.fn(),
 isFiuuOpaRolloutActive: vi.fn(),
 isFiuuVtEnabledForBranch: vi.fn(),
 posAccessErrorStatus: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/access', () => ({
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
 posAccessErrorStatus: mocks.posAccessErrorStatus,
}));
vi.mock('@/lib/pos/fiuu', () => ({
 getFiuuOpaConfig: mocks.getFiuuOpaConfig,
 getPosQrPaymentMode: mocks.getPosQrPaymentMode,
}));
vi.mock('@/lib/pos/fiuu-opa-server', () => ({
 isFiuuOpaEnabledForBranch: mocks.isFiuuOpaEnabledForBranch,
 isFiuuOpaRolloutActive: mocks.isFiuuOpaRolloutActive,
}));
vi.mock('@/lib/pos/fiuu-cloudecr', () => ({
 getFiuuCloudEcrConfig: mocks.getFiuuCloudEcrConfig,
}));
vi.mock('@/lib/pos/fiuu-cloudecr-server', () => ({
 FIUU_CLOUDECR_APP_PACKAGE: 'com.fiuu.vtplus',
 isFiuuCloudEcrEnabledForBranch: mocks.isFiuuCloudEcrEnabledForBranch,
}));
vi.mock('@/lib/pos/fiuu-vt', () => ({
 FIUU_VT_DUITNOW_CHANNEL: '24',
 FIUU_VT_PACKAGE: 'com.rms.mobile.razervt',
}));
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 isFiuuVtEnabledForBranch: mocks.isFiuuVtEnabledForBranch,
}));
vi.mock('@/lib/pos/fiuu-static', () => ({
 getFiuuStaticQrConfig: mocks.getFiuuStaticQrConfig,
}));
vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock('@/lib/supabase/server', () => ({
 createClient: mocks.createClient,
}));
vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));

import { GET } from './route';

const ORGANIZATION_ID = '66666666-6666-4666-8666-666666666666';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
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
const ADMIN_CLIENT = { rpc: vi.fn() };

function arrangeBranch() {
 const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn().mockResolvedValue({
   data: {
    id: BRANCH_ID,
    branch_code: 'BR001',
    branch_name: 'RNR Juru Arah Selatan',
    status: 'ACTIVE',
   },
   error: null,
  }),
 };
 query.select.mockReturnValue(query);
 query.eq.mockReturnValue(query);
 mocks.createClient.mockResolvedValue({
  from: vi.fn().mockReturnValue(query),
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
 mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
 mocks.posAccessErrorStatus.mockReturnValue(403);
 mocks.getPosQrPaymentMode.mockReturnValue('fiuu');
 mocks.getFiuuOpaConfig.mockReturnValue(OPA_CONFIG);
 mocks.isFiuuOpaEnabledForBranch.mockReturnValue(true);
 mocks.isFiuuOpaRolloutActive.mockResolvedValue(true);
 mocks.createAdminClient.mockReturnValue(ADMIN_CLIENT);
 mocks.isFiuuVtEnabledForBranch.mockReturnValue(false);
 mocks.isFiuuCloudEcrEnabledForBranch.mockReturnValue(false);
 mocks.getFiuuStaticQrConfig.mockReturnValue(null);
 arrangeBranch();
});

afterEach(() => {
 vi.restoreAllMocks();
});

describe('Fiuu OPA QR configuration scope', () => {
 it('enables dynamic QR only after checking the organization and branch tuple', async () => {
  const response = await GET(new Request(
   `http://localhost/api/pos/qr-config?branch_id=${BRANCH_ID}`,
  ));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_DYNAMIC',
   branch: { id: BRANCH_ID, code: 'BR001' },
   configured: true,
  });
  expect(mocks.isFiuuOpaEnabledForBranch).toHaveBeenCalledWith(SCOPE);
  expect(mocks.getFiuuOpaConfig).toHaveBeenCalledWith(SCOPE);
  expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
  expect(mocks.isFiuuOpaRolloutActive).toHaveBeenCalledWith(
   ADMIN_CLIENT,
   SCOPE,
   OPA_CONFIG,
  );
 });

 it('fails closed to manual when the mapped configuration has no ACTIVE rollout row', async () => {
  mocks.isFiuuOpaRolloutActive.mockResolvedValue(false);

  const response = await GET(new Request(
   `http://localhost/api/pos/qr-config?branch_id=${BRANCH_ID}`,
  ));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_STATIC_MANUAL',
   configured: false,
  });
  expect(mocks.isFiuuOpaRolloutActive).toHaveBeenCalledWith(
   ADMIN_CLIENT,
   SCOPE,
   OPA_CONFIG,
  );
 });

 it('fails closed to manual when the ACTIVE rollout check throws', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.isFiuuOpaRolloutActive.mockRejectedValue(new Error('rollout RPC unavailable'));

  const response = await GET(new Request(
   `http://localhost/api/pos/qr-config?branch_id=${BRANCH_ID}`,
  ));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_STATIC_MANUAL',
   configured: false,
  });
 });

 it('fails closed to manual when the tenant tuple is not configured', async () => {
  mocks.isFiuuOpaEnabledForBranch.mockReturnValue(false);

  const response = await GET(new Request(
   `http://localhost/api/pos/qr-config?branch_id=${BRANCH_ID}`,
  ));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_STATIC_MANUAL',
   configured: false,
  });
  expect(mocks.isFiuuOpaEnabledForBranch).toHaveBeenCalledWith(SCOPE);
  expect(mocks.getFiuuOpaConfig).not.toHaveBeenCalled();
  expect(mocks.isFiuuOpaRolloutActive).not.toHaveBeenCalled();
 });

 it('fails closed to manual when an allowlisted branch has a partial mapping', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.isFiuuOpaEnabledForBranch.mockImplementation(() => {
   throw new Error('Pemetaan Fiuu OPA BR001 tiada');
  });

  const response = await GET(new Request(
   `http://localhost/api/pos/qr-config?branch_id=${BRANCH_ID}`,
  ));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   mode: 'FIUU_STATIC_MANUAL',
   configured: false,
  });
  expect(mocks.isFiuuOpaEnabledForBranch).toHaveBeenCalledWith(SCOPE);
  expect(mocks.getFiuuOpaConfig).not.toHaveBeenCalled();
  expect(mocks.isFiuuOpaRolloutActive).not.toHaveBeenCalled();
 });
});
