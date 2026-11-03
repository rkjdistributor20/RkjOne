import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
 getFiuuOpaConfig: vi.fn(),
 getFiuuOpaConfigurationFingerprint: vi.fn(),
 getFiuuOpaConfiguredTargets: vi.fn(),
 getPosQrPaymentMode: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/fiuu', () => ({
 getFiuuOpaConfig: mocks.getFiuuOpaConfig,
 getFiuuOpaConfigurationFingerprint: mocks.getFiuuOpaConfigurationFingerprint,
 getPosQrPaymentMode: mocks.getPosQrPaymentMode,
}));
vi.mock('@/lib/pos/fiuu-opa-server', () => ({
 getFiuuOpaConfiguredTargets: mocks.getFiuuOpaConfiguredTargets,
}));
vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));

import { GET } from './route';

const ORGANIZATION_ID = '66666666-6666-4666-8666-666666666666';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const TARGET = {
 organizationId: ORGANIZATION_ID,
 branchId: BRANCH_ID,
 branchCode: 'BR001',
};
const CONFIG = {
 applicationCode: 'APP001',
 secretKey: 'must-never-leave-server',
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

let rpc: ReturnType<typeof vi.fn>;
let branchQuery: {
 select: ReturnType<typeof vi.fn>;
 eq: ReturnType<typeof vi.fn>;
 maybeSingle: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
 vi.clearAllMocks();
 vi.stubEnv('VERCEL_ENV', 'preview');
 vi.stubEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  'https://lktggxwgaormnzfwcogx.supabase.co',
 );
 rpc = vi.fn().mockImplementation((functionName: string) => {
  if (functionName === 'is_pos_fiuu_opa_rollout_control_ready') {
   return Promise.resolve({ data: true, error: null });
  }
  return Promise.resolve({ data: false, error: null });
 });
 branchQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn().mockResolvedValue({
   data: {
    id: BRANCH_ID,
    organization_id: ORGANIZATION_ID,
    branch_code: 'BR001',
    status: 'ACTIVE',
   },
   error: null,
  }),
 };
 branchQuery.select.mockReturnValue(branchQuery);
 branchQuery.eq.mockReturnValue(branchQuery);
 mocks.createAdminClient.mockReturnValue({
  rpc,
  from: vi.fn().mockReturnValue(branchQuery),
 });
 mocks.getCurrentProfile.mockResolvedValue({
  id: '55555555-5555-4555-8555-555555555555',
  organization_id: ORGANIZATION_ID,
  role: 'SUPER_ADMIN',
 });
 mocks.getPosQrPaymentMode.mockReturnValue('fiuu');
 mocks.getFiuuOpaConfiguredTargets.mockReturnValue([TARGET]);
 mocks.getFiuuOpaConfig.mockReturnValue(CONFIG);
 mocks.getFiuuOpaConfigurationFingerprint.mockReturnValue('a'.repeat(64));
});

afterEach(() => {
 vi.unstubAllEnvs();
 vi.restoreAllMocks();
});

describe('Fiuu OPA Preview preflight', () => {
 it('is not available outside Vercel Preview', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');

  const response = await GET();

  expect(response.status).toBe(404);
  expect(mocks.getCurrentProfile).not.toHaveBeenCalled();
 });

 it('requires an authenticated SUPER_ADMIN', async () => {
  mocks.getCurrentProfile.mockResolvedValueOnce(null);
  const unauthenticated = await GET();
  expect(unauthenticated.status).toBe(401);

  mocks.getCurrentProfile.mockResolvedValueOnce({
   organization_id: ORGANIZATION_ID,
   role: 'ADMIN',
  });
  const nonOwner = await GET();
  expect(nonOwner.status).toBe(403);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('is pinned to the expected staging Supabase project', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://production-ref.supabase.co');

  const response = await GET();

  expect(response.status).toBe(503);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed unless exactly BR001 is configured', async () => {
  mocks.getFiuuOpaConfiguredTargets.mockReturnValueOnce([]);
  expect((await GET()).status).toBe(503);

  mocks.getFiuuOpaConfiguredTargets.mockReturnValueOnce([
   TARGET,
   { ...TARGET, branchId: '44444444-4444-4444-8444-444444444444', branchCode: 'BR002' },
  ]);
  expect((await GET()).status).toBe(503);

  mocks.getFiuuOpaConfiguredTargets.mockReturnValueOnce([
   { ...TARGET, branchCode: 'BR002' },
  ]);
  expect((await GET()).status).toBe(503);
  expect(mocks.getFiuuOpaConfig).not.toHaveBeenCalled();
 });

 it('logs only a fixed safe category for malformed target configuration', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.getFiuuOpaConfiguredTargets.mockImplementationOnce(() => {
   throw new Error('POS_FIUU_APPLICATIONS_JSON bukan JSON yang sah');
  });

  const response = await GET();
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(body).toEqual({ error: 'Preflight Fiuu OPA gagal secara selamat' });
  expect(consoleError).toHaveBeenCalledWith(
   '[fiuu-opa-preflight] failed at target-json',
  );
  expect(JSON.stringify(body)).not.toContain('POS_FIUU_APPLICATIONS_JSON');
 });

 it('rejects organization mismatch and non-sandbox configuration', async () => {
  mocks.getCurrentProfile.mockResolvedValueOnce({
   organization_id: '77777777-7777-4777-8777-777777777777',
   role: 'SUPER_ADMIN',
  });
  expect((await GET()).status).toBe(403);

  mocks.getFiuuOpaConfig.mockReturnValueOnce({ ...CONFIG, environment: 'production' });
  expect((await GET()).status).toBe(503);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('verifies that the mapped branch is the exact ACTIVE BR001 row', async () => {
  branchQuery.maybeSingle.mockResolvedValueOnce({
   data: { id: BRANCH_ID, organization_id: ORGANIZATION_ID, branch_code: 'BR002', status: 'ACTIVE' },
   error: null,
  });
  expect((await GET()).status).toBe(503);

  branchQuery.maybeSingle.mockResolvedValueOnce({
   data: { id: BRANCH_ID, organization_id: ORGANIZATION_ID, branch_code: 'BR001', status: 'INACTIVE' },
   error: null,
  });
  expect((await GET()).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
 });

 it('fails closed when the rollout-control readiness probe is unavailable', async () => {
  rpc.mockResolvedValueOnce({ data: false, error: null });

  const response = await GET();

  expect(response.status).toBe(503);
  expect(rpc).toHaveBeenCalledTimes(1);
 });

 it('fails closed when the active-state RPC returns an error', async () => {
  rpc
   .mockResolvedValueOnce({ data: true, error: null })
   .mockResolvedValueOnce({ data: null, error: { message: 'rpc unavailable' } });

  const response = await GET();

  expect(response.status).toBe(503);
  expect(rpc).toHaveBeenCalledTimes(2);
 });

 it('returns only the redacted configuration fingerprint and rollout state', async () => {
  rpc
   .mockResolvedValueOnce({ data: true, error: null })
   .mockResolvedValueOnce({ data: true, error: null });

  const response = await GET();
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(body).toEqual({
   configurationSha256: 'a'.repeat(64),
   rolloutControlReady: true,
   active: true,
  });
  expect(JSON.stringify(body)).not.toContain(CONFIG.secretKey);
  expect(JSON.stringify(body)).not.toContain(CONFIG.applicationCode);
  expect(JSON.stringify(body)).not.toContain(CONFIG.storeId);
  expect(JSON.stringify(body)).not.toContain(CONFIG.terminalId);
  expect(JSON.stringify(body)).not.toContain(CONFIG.credentialVersion);
  expect(rpc).toHaveBeenNthCalledWith(
   1,
   'is_pos_fiuu_opa_rollout_control_ready',
  );
  expect(rpc).toHaveBeenNthCalledWith(
   2,
   'is_pos_fiuu_opa_branch_active',
   {
    p_organization_id: ORGANIZATION_ID,
    p_branch_id: BRANCH_ID,
    p_branch_code: 'BR001',
    p_environment: 'sandbox',
    p_application_code: CONFIG.applicationCode,
    p_store_id: CONFIG.storeId,
    p_terminal_id: CONFIG.terminalId,
    p_credential_version: CONFIG.credentialVersion,
   },
  );
  expect(mocks.getFiuuOpaConfigurationFingerprint).toHaveBeenCalledWith(CONFIG);
 });
});
