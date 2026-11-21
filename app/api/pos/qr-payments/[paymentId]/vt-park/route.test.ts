import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
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
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 normalizeFiuuVtBranchCode: vi.fn((value: unknown) => (
  typeof value === 'string' ? value.trim().toUpperCase() : null
 )),
}));
vi.mock('@/lib/security/rate-limit', () => ({ enforceRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from './route';

const PAYMENT_ID = '0122709a-a1f6-4c94-a8c7-dda63262a474';
const PROFILE = { id: 'user-1', organization_id: 'org-1' };

function payment() {
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
   fiuu_enrollment_generation: 2,
  },
 };
}

function adminFor(currentPayment = payment()) {
 const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({ data: currentPayment, error: null })),
 };
 type RpcResponse = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
 };
 const rpc = vi.fn(async (): Promise<RpcResponse> => ({
  data: {
   payment_id: PAYMENT_ID,
   status: 'CANCELLED',
   review_state: 'PROVIDER_ERROR_REVIEW',
   reused: false,
  },
  error: null,
 }));
 return {
  from: vi.fn(() => query),
  rpc,
 };
}

function invoke() {
 return POST(new Request('http://localhost/vt-park', { method: 'POST' }), {
  params: Promise.resolve({ paymentId: PAYMENT_ID }),
 });
}

describe('POST /api/pos/qr-payments/[paymentId]/vt-park', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
  mocks.assertActivePosShiftMember.mockResolvedValue(undefined);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: 'device-1',
   deviceCode: 'POS-BR001-TEST',
   branchCode: 'BR001',
   enrollmentGeneration: 2,
  });
 });

 it('fails closed while provider-error parking is safety-gated', async () => {
  const admin = adminFor();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke();

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_PARK_DISABLED',
  });
  expect(admin.rpc).not.toHaveBeenCalled();
 });

 it('still rejects unauthenticated callers before the safety gate', async () => {
  mocks.getCurrentProfile.mockResolvedValue(null);
  expect((await invoke()).status).toBe(401);
 });
});
