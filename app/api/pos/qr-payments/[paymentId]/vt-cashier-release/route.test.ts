import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
 hasRecentFiuuVtRecoverySuccess: vi.fn(),
 isFiuuVtCashierReleaseDeviceReady: vi.fn(),
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
 isFiuuVtCashierReleaseDeviceReady: mocks.isFiuuVtCashierReleaseDeviceReady,
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
const ORDER_ID = 'RKJ_0123456789ABCDEF0123456789ABCDEF';
const PROFILE = { id: 'user-1', organization_id: 'org-1' };

function payment(overrides: Record<string, unknown> = {}) {
 return {
  id: PAYMENT_ID,
  organization_id: 'org-1',
  branch_id: 'branch-1',
  shift_id: 'shift-1',
  created_by: PROFILE.id,
  provider: 'fiuu_vt',
  provider_order_id: ORDER_ID,
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
 attemptRow: Record<string, unknown> | null = null,
) {
 const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({ data: paymentRow, error: null })),
 };
 const attemptQuery = {
  select: vi.fn(() => attemptQuery),
  eq: vi.fn(() => attemptQuery),
  maybeSingle: vi.fn(async () => ({ data: attemptRow, error: null })),
 };
 return {
  attemptQuery,
  from: vi.fn((table: string) => table === 'pos_fiuu_vt_attempts' ? attemptQuery : query),
  rpc: vi.fn(async () => rpcResult),
 };
}

function legacyVoidError(overrides: Record<string, unknown> = {}) {
 return {
  launched_at: null, abandoned_at: null, result_fingerprint: 'fingerprint',
  result_json: { kind: 'ERROR', opType: 'VOID', orderId: ORDER_ID, errorCode: '-100' },
  ...overrides,
 };
}

const unrecordedVoid = {
 data: { outcome: 'VOID_NOT_DURABLY_LAUNCHED' },
 error: null,
};

function quarantineResult(overrides: Record<string, unknown> = {}) {
 return {
  data: {
   outcome: 'QUARANTINED', payment_id: PAYMENT_ID, payment_status: 'QUARANTINED',
   review_state: 'PROVIDER_ERROR_REVIEW', cashier_lane_released: true,
   provider_cancellation_confirmed: false, ...overrides,
  },
  error: null,
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
  mocks.isFiuuVtCashierReleaseDeviceReady.mockReturnValue(true);
  mocks.hasRecentFiuuVtRecoverySuccess.mockResolvedValue(true);
 });

 it('rejects first release from an old or unreported host build', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.isFiuuVtCashierReleaseDeviceReady.mockReturnValue(false);

  const response = await invoke({ attempt_id: ATTEMPT_ID });

  expect(response.status).toBe(426);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_APP_UPDATE_REQUIRED',
  });
  expect(mocks.hasRecentFiuuVtRecoverySuccess).not.toHaveBeenCalled();
  expect(mocks.assertActivePosShiftMember).not.toHaveBeenCalled();
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
  expect(admin.rpc).toHaveBeenCalledTimes(1);
  expect(admin.from).not.toHaveBeenCalledWith('pos_fiuu_vt_attempts');
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
  expect(admin.rpc).toHaveBeenCalledTimes(1);
 });

 it('uses the guarded STATUS quarantine for the exact consumed legacy VOID error', async () => {
  const admin = makeAdmin(payment(), unrecordedVoid, legacyVoidError());
  admin.rpc.mockResolvedValueOnce(unrecordedVoid).mockResolvedValueOnce(quarantineResult());
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke({ attempt_id: ATTEMPT_ID });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   outcome: 'TERMINAL',
   payment: { id: PAYMENT_ID, status: 'QUARANTINED', cancellation_phase: 'TERMINAL' },
   reused: false,
   warning: expect.stringContaining('pembatalan Fiuu belum disahkan'),
  });
  expect(admin.attemptQuery.eq.mock.calls).toEqual([
   ['id', ATTEMPT_ID], ['payment_id', PAYMENT_ID], ['provider_order_id', ORDER_ID],
   ['op_type', 'VOID'], ['state', 'CONSUMED'],
  ]);
  expect(admin.rpc).toHaveBeenNthCalledWith(2, 'park_pos_fiuu_vt_status_retry_limit', {
   p_payment_id: PAYMENT_ID, p_actor_id: PROFILE.id,
   p_device_id: '11111111-1111-4111-8111-111111111111', p_enrollment_generation: 2,
  });
 });

 it.each([
  legacyVoidError({ result_fingerprint: null }),
  legacyVoidError({ result_json: { kind: 'ERROR', opType: 'VOID', orderId: 'wrong-order', errorCode: '-100' } }),
  legacyVoidError({ result_json: { opType: 'VOID', orderId: ORDER_ID, status: '00' } }),
  legacyVoidError({ launched_at: '2026-11-29T00:00:00Z' }),
 ])('does not quarantine in the fallback without exact legacy evidence', async attempt => {
  const admin = makeAdmin(payment(), unrecordedVoid, attempt);
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(409);
  expect(admin.rpc).toHaveBeenCalledTimes(1);
 });

 it.each([
  { outcome: 'CALLBACK_ACTIVE' },
  { outcome: 'NOT_ELIGIBLE', reason: 'ATTEMPT_PROVIDER_SUCCESS_EVIDENCE' },
  { outcome: 'NOT_ELIGIBLE', reason: 'STATUS_RETRY_BUDGET_NOT_EXHAUSTED' },
  { payment_id: 'another-payment' },
  { provider_cancellation_confirmed: true },
 ])('does not report release when the quarantine result is not exact and safe', async result => {
  const admin = makeAdmin(payment(), unrecordedVoid, legacyVoidError());
  admin.rpc.mockResolvedValueOnce(unrecordedVoid)
   .mockResolvedValueOnce(quarantineResult(result));
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(409);
 });

 it('acknowledges loss of a successful quarantine response without claiming cancellation', async () => {
  const reviewRequired = { data: { outcome: 'REVIEW_REQUIRED' }, error: null };
  const admin = makeAdmin(payment({ status: 'QUARANTINED' }), reviewRequired, legacyVoidError());
  admin.rpc.mockResolvedValueOnce(reviewRequired)
   .mockResolvedValueOnce(quarantineResult({ reused: true, provider_cancellation_confirmed: undefined }));
  mocks.createAdminClient.mockReturnValue(admin);
  const response = await invoke({ attempt_id: ATTEMPT_ID });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   outcome: 'TERMINAL', reused: true,
   payment: { status: 'QUARANTINED', cancellation_phase: 'TERMINAL' },
  });
 });
});
