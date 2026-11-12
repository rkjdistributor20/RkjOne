import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/access', () => ({
 assertActivePosShiftMember: mocks.assertActivePosShiftMember,
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
 posAccessErrorStatus: vi.fn(() => 403),
}));
vi.mock('@/lib/pos/device-auth', () => ({
 assertOfficialPosDevice: mocks.assertOfficialPosDevice,
}));
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 normalizeFiuuVtBranchCode: vi.fn((value: unknown) => (
  typeof value === 'string' ? value.trim().toUpperCase() : null
 )),
}));
vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: vi.fn(() => null),
}));
vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));

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
  sale_payload: {
   fiuu_branch_code: 'BR001',
   fiuu_device_id: 'device-1',
   fiuu_device_code: 'POS-BR001-TEST',
   fiuu_enrollment_generation: 1,
  },
  ...overrides,
 };
}

function makeAdmin(
 paymentRow: Record<string, unknown> | null = payment(),
 rpcResult: { data: unknown; error: unknown } = {
  data: { payment_id: PAYMENT_ID, status: 'CANCELLED', reused: false },
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

function request(body: unknown) {
 return new Request('http://localhost/vt-prelaunch-cancel', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
 });
}

function invoke(body: unknown) {
 return POST(request(body), { params: Promise.resolve({ paymentId: PAYMENT_ID }) });
}

describe('Fiuu VT pre-launch cashier release', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
  mocks.assertActivePosShiftMember.mockResolvedValue(undefined);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: 'device-1',
   deviceCode: 'POS-BR001-TEST',
   branchCode: 'BR001',
   enrollmentGeneration: 1,
  });
 });

 it('requires an authenticated cashier', async () => {
  mocks.getCurrentProfile.mockResolvedValue(null);

  const response = await invoke({
   attempt_id: ATTEMPT_ID,
   error_code: 'FIUU_VT_LAUNCH_FAILED',
  });

  expect(response.status).toBe(401);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('rejects an unrecognised pre-launch error code', async () => {
  const response = await invoke({
   attempt_id: ATTEMPT_ID,
   error_code: 'UNKNOWN_FAILURE',
  });

  expect(response.status).toBe(400);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('atomically cancels the exact abandoned SALE attempt', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke({
   attempt_id: ATTEMPT_ID,
   error_code: 'fiuu_vt_launch_failed',
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
   payment: { id: PAYMENT_ID, status: 'CANCELLED' },
   reused: false,
  });
  expect(admin.rpc).toHaveBeenCalledWith('cancel_pos_fiuu_vt_prelaunch', {
   p_payment_id: PAYMENT_ID,
   p_attempt_id: ATTEMPT_ID,
   p_error_code: 'FIUU_VT_LAUNCH_FAILED',
   p_actor_id: PROFILE.id,
  });
 });

 it('rejects a request from a different enrolled tablet', async () => {
  const admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: 'device-2',
   deviceCode: 'POS-BR001-OTHER',
   branchCode: 'BR001',
   enrollmentGeneration: 1,
  });

  const response = await invoke({
   attempt_id: ATTEMPT_ID,
   error_code: 'FIUU_VT_LAUNCH_FAILED',
  });

  expect(response.status).toBe(403);
  expect(admin.rpc).not.toHaveBeenCalled();
 });

 it('fails closed when provider evidence prevents local release', async () => {
  const admin = makeAdmin(payment(), { data: null, error: { message: 'provider evidence exists' } });
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke({
   attempt_id: ATTEMPT_ID,
   error_code: 'FIUU_VT_LAUNCH_FAILED',
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_RECONCILIATION_REQUIRED',
  });
 });
});
