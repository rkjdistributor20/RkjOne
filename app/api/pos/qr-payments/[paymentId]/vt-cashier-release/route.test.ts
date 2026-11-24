import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
 hasRecentFiuuVtRecoverySuccess: vi.fn(),
 isFiuuVtCashierReleaseEnabledForBranch: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock('@/lib/pos/access', () => ({
 assertActivePosShiftMember: mocks.assertActivePosShiftMember,
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
 posAccessErrorStatus: vi.fn(() => 403),
}));
vi.mock('@/lib/pos/device-auth', () => ({
 assertOfficialPosDevice: mocks.assertOfficialPosDevice,
}));
vi.mock('@/lib/pos/fiuu-vt-recovery-heartbeat', () => ({
 hasRecentFiuuVtRecoverySuccess: mocks.hasRecentFiuuVtRecoverySuccess,
}));
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 isFiuuVtCashierReleaseEnabledForBranch: mocks.isFiuuVtCashierReleaseEnabledForBranch,
 normalizeFiuuVtBranchCode: vi.fn((value: unknown) => (
  typeof value === 'string' ? value.trim().toUpperCase() : null
 )),
}));
vi.mock('@/lib/security/rate-limit', () => ({ enforceRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from './route';

const PAYMENT_ID = '0122709a-a1f6-4c94-a8c7-dda63262a474';
const ATTEMPT_ID = '123e4567-e89b-42d3-a456-426614174000';
const PROFILE = { id: 'user-1', organization_id: 'org-1' };

function payment(overrides: Record<string, unknown> = {}) {
 return {
  id: PAYMENT_ID,
  organization_id: 'org-1',
  branch_id: 'branch-1',
  shift_id: 'shift-1',
  created_by: PROFILE.id,
  provider: 'fiuu_vt',
  status: 'PENDING',
  fiuu_vt_cancel_attempt_id: null,
  fiuu_vt_cashier_released_at: null,
  sale_payload: {
   fiuu_branch_code: 'BR001',
   fiuu_device_id: '11111111-1111-4111-8111-111111111111',
   fiuu_device_code: 'POS-BR001-TEST',
   fiuu_enrollment_generation: 2,
  },
  ...overrides,
 };
}

function makeAdmin(
 paymentRow: Record<string, unknown> | null = payment(),
 rpcResult: { data: unknown; error: unknown } = {
  data: {
   outcome: 'RELEASED',
   payment_status: 'PENDING',
   cancel_requested_at: '2026-11-23T04:00:01.000Z',
   cashier_released_at: '2026-11-23T04:00:01.000Z',
   reused: false,
  },
  error: null,
 },
) {
 const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({ data: paymentRow, error: null })),
 };
 return {
  from: vi.fn(() => query),
  rpc: vi.fn(async () => rpcResult),
 };
}

function invoke(body: unknown) {
 return POST(new Request('http://localhost/vt-cashier-release', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
 }), { params: Promise.resolve({ paymentId: PAYMENT_ID }) });
}

describe('Fiuu VT cashier release after cancellation request', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
  mocks.assertActivePosShiftMember.mockResolvedValue(undefined);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: '11111111-1111-4111-8111-111111111111',
   deviceCode: 'POS-BR001-TEST',
   branchCode: 'BR001',
   enrollmentGeneration: 2,
  });
  mocks.isFiuuVtCashierReleaseEnabledForBranch.mockReturnValue(true);
  mocks.hasRecentFiuuVtRecoverySuccess.mockResolvedValue(true);
 });

 it('fails closed before first release when the recovery heartbeat is stale', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.hasRecentFiuuVtRecoverySuccess.mockResolvedValue(false);

  const response = await invoke({ attempt_id: ATTEMPT_ID });

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_RECOVERY_HEARTBEAT_STALE',
  });
  expect(mocks.hasRecentFiuuVtRecoverySuccess).toHaveBeenCalledWith(admin);
  expect(mocks.assertActivePosShiftMember).not.toHaveBeenCalled();
  expect(admin.rpc).not.toHaveBeenCalledWith(
   'release_pos_fiuu_vt_cashier_lane',
   expect.anything(),
  );
 });

 it('requires an authenticated cashier', async () => {
  mocks.getCurrentProfile.mockResolvedValue(null);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(401);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('rejects malformed VOID evidence', async () => {
  const response = await invoke({ attempt_id: 'not-an-attempt' });
  expect(response.status).toBe(400);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed outside the explicit cashier-release canary allowlist', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.isFiuuVtCashierReleaseEnabledForBranch.mockReturnValue(false);
  mocks.hasRecentFiuuVtRecoverySuccess.mockResolvedValue(false);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_CASHIER_RELEASE_DISABLED',
  });
  expect(admin.rpc).not.toHaveBeenCalled();
 });

 it('releases only the exact official tablet lane while keeping payment pending', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
   outcome: 'RELEASED',
   payment: {
    id: PAYMENT_ID,
    status: 'PENDING',
    cancellation_phase: 'CANCEL_REQUESTED',
    cancel_requested_at: '2026-11-23T04:00:01.000Z',
    cashier_released_at: '2026-11-23T04:00:01.000Z',
   },
   reused: false,
  });
  expect(admin.rpc).toHaveBeenCalledWith('release_pos_fiuu_vt_cashier_lane', {
   p_payment_id: PAYMENT_ID,
   p_attempt_id: ATTEMPT_ID,
   p_actor_id: PROFILE.id,
   p_device_id: '11111111-1111-4111-8111-111111111111',
   p_enrollment_generation: 2,
  });
 });

 it('is idempotent when the same launched VOID release is retried', async () => {
  const admin = makeAdmin(payment(), {
   data: {
    outcome: 'RELEASED',
    payment_status: 'PENDING',
    cancel_requested_at: '2026-11-23T04:00:01.000Z',
    cashier_released_at: '2026-11-23T04:00:01.000Z',
    reused: true,
   },
   error: null,
  });
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ outcome: 'RELEASED', reused: true });
 });

 it('acknowledges a lost release response even after the original payment is quarantined', async () => {
  const admin = makeAdmin(payment({
   status: 'QUARANTINED',
   created_by: 'prior-cashier',
   shift_id: 'prior-shift',
   fiuu_vt_cancel_attempt_id: ATTEMPT_ID,
   fiuu_vt_cashier_released_at: '2026-11-23T04:00:01.000Z',
  }), {
   data: {
    outcome: 'RELEASED',
    payment_status: 'QUARANTINED',
    cancel_requested_at: '2026-11-23T04:00:01.000Z',
    cashier_released_at: '2026-11-23T04:00:01.000Z',
    reused: true,
   },
   error: null,
  });
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.isFiuuVtCashierReleaseEnabledForBranch.mockReturnValue(false);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: '22222222-2222-4222-8222-222222222222',
   deviceCode: 'POS-BR001-REENROLLED',
   branchCode: 'BR001',
   enrollmentGeneration: 7,
  });
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   outcome: 'RELEASED',
   reused: true,
   payment: {
    status: 'QUARANTINED',
    cancellation_phase: 'TERMINAL',
   },
  });
  expect(mocks.assertActivePosShiftMember).not.toHaveBeenCalled();
  expect(mocks.hasRecentFiuuVtRecoverySuccess).not.toHaveBeenCalled();
  expect(admin.rpc).toHaveBeenCalledWith('release_pos_fiuu_vt_cashier_lane', {
   p_payment_id: PAYMENT_ID,
   p_attempt_id: ATTEMPT_ID,
   p_actor_id: PROFILE.id,
   p_device_id: '22222222-2222-4222-8222-222222222222',
   p_enrollment_generation: 7,
  });
 });

 it('lets payment success win a race with cashier release', async () => {
  const admin = makeAdmin(payment(), {
   data: { outcome: 'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED', payment_status: 'REPORTED' },
   error: null,
  });
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_PAYMENT_STATUS_CHANGED',
   outcome: 'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED',
  });
 });

 it('rejects a different enrolled tablet before calling the release RPC', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: '22222222-2222-4222-8222-222222222222',
   deviceCode: 'POS-BR001-OTHER',
   branchCode: 'BR001',
   enrollmentGeneration: 2,
  });
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(403);
  expect(admin.rpc).not.toHaveBeenCalled();
 });

 it('fails closed when the VOID launch was not durably recorded', async () => {
  const admin = makeAdmin(payment(), {
   data: { outcome: 'VOID_NOT_DURABLY_LAUNCHED', payment_status: 'PENDING' },
   error: null,
  });
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_VOID_NOT_DURABLY_LAUNCHED',
  });
 });
});
