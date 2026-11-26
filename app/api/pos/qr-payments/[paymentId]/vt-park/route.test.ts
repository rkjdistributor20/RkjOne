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
 let paymentReadCount = 0;
 const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(async () => {
   paymentReadCount += 1;
   return {
    data: paymentReadCount === 1
     ? currentPayment
     : {
      id: PAYMENT_ID,
      status: 'QUARANTINED',
      fiuu_vt_review_required: true,
      fiuu_vt_reconciliation_state: 'PROVIDER_ERROR_REVIEW',
     },
    error: null,
   };
  }),
 };
 type RpcResponse = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
 };
 const rpc = vi.fn(async (): Promise<RpcResponse> => ({
  data: {
   outcome: 'QUARANTINED',
   payment_id: PAYMENT_ID,
   payment_status: 'QUARANTINED',
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

function invoke(reason?: 'NATIVE_CALLBACK_REGISTRY' | 'STATUS_RETRY_LIMIT') {
 return POST(new Request('http://localhost/vt-park', {
  method: 'POST',
  body: reason ? JSON.stringify({ reason }) : undefined,
 }), {
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

 it('quarantines an eligible payment using the verified official tablet identity', async () => {
  const admin = adminFor();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke();

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   payment: {
    id: PAYMENT_ID,
    status: 'QUARANTINED',
    fiuu_vt_review_required: true,
    fiuu_vt_reconciliation_state: 'PROVIDER_ERROR_REVIEW',
   },
   reused: false,
  });
  expect(admin.rpc).toHaveBeenCalledWith('park_pos_fiuu_vt_provider_error', {
   p_payment_id: PAYMENT_ID,
   p_actor_id: PROFILE.id,
   p_device_id: 'device-1',
   p_enrollment_generation: 2,
  });
 });

 it('uses the reviewed native-storage quarantine lane for a corrupt callback registry', async () => {
  const admin = adminFor();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('NATIVE_CALLBACK_REGISTRY');

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   payment: {
    status: 'QUARANTINED',
    fiuu_vt_review_required: true,
   },
  });
  expect(admin.rpc).toHaveBeenCalledWith(
   'park_pos_fiuu_vt_native_storage_recovery',
   {
    p_payment_id: PAYMENT_ID,
    p_actor_id: PROFILE.id,
    p_device_id: 'device-1',
    p_enrollment_generation: 2,
   },
  );
 });

 it('uses the bounded STATUS quarantine lane after the terminal retry limit', async () => {
  const admin = adminFor();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS_RETRY_LIMIT');

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   payment: {
    status: 'QUARANTINED',
    fiuu_vt_review_required: true,
   },
  });
  expect(admin.rpc).toHaveBeenCalledWith(
   'park_pos_fiuu_vt_status_retry_limit',
   {
    p_payment_id: PAYMENT_ID,
    p_actor_id: PROFILE.id,
    p_device_id: 'device-1',
    p_enrollment_generation: 2,
   },
  );
 });

 it('rejects unauthenticated callers', async () => {
  mocks.getCurrentProfile.mockResolvedValue(null);
  expect((await invoke()).status).toBe(401);
 });

 it('rejects a tablet whose enrollment generation does not match the sale intent', async () => {
  const admin = adminFor();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: 'device-1',
   deviceCode: 'POS-BR001-TEST',
   branchCode: 'BR001',
   enrollmentGeneration: 3,
  });

  const response = await invoke();

  expect(response.status).toBe(403);
  expect(admin.rpc).not.toHaveBeenCalled();
 });

 it('keeps the lane closed when the serialized database quarantine is not eligible', async () => {
  const admin = adminFor();
  admin.rpc.mockResolvedValueOnce({
   data: null,
   error: { message: 'success evidence exists' },
  });
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke();

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ mode: 'FIUU_VT_PARK_NOT_READY' });
 });

 it('returns a retryable native-recovery mode while callback evidence is still active', async () => {
  const admin = adminFor();
  admin.rpc.mockResolvedValueOnce({
   data: null,
   error: { message: 'launch lease active' },
  });
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('NATIVE_CALLBACK_REGISTRY');

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_NATIVE_RECOVERY_NOT_READY',
  });
 });

 it('keeps the lane closed without asserting a cause when the STATUS quarantine RPC errors', async () => {
  const admin = adminFor();
  admin.rpc.mockResolvedValueOnce({
   data: null,
   error: { message: 'database unavailable' },
  });
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS_RETRY_LIMIT');

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   error: 'Kuarantin transaksi asal belum dapat disahkan. Troli dikekalkan; jangan mulakan bayaran QR baharu.',
   mode: 'FIUU_VT_STATUS_RETRY_LIMIT_NOT_READY',
   retry_after_ms: 2_000,
  });
 });

 it.each([
  ['FORBIDDEN', undefined, 403, 'Transaksi Fiuu VT bukan milik sesi tablet ini'],
  ['NOT_FOUND', undefined, 404, 'Transaksi Fiuu VT tidak dijumpai'],
  ['CALLBACK_ACTIVE', 'LAUNCH_OR_CALLBACK_PROCESSING_NOT_TERMINAL', 409, 'Percubaan bayaran Fiuu VT masih aktif'],
  ['NOT_ELIGIBLE', 'STATUS_RETRY_BUDGET_NOT_EXHAUSTED', 409, 'Semakan STATUS belum mencapai had dan tempoh menunggu belum tamat'],
  ['NOT_ELIGIBLE', 'ATTEMPT_PROVIDER_SUCCESS_EVIDENCE', 409, 'Bukti daripada Fiuu ditemui untuk percubaan asal'],
  ['NOT_ELIGIBLE', 'PAYMENT_STATE_OR_PROVIDER_EVIDENCE', 409, 'Status transaksi atau bukti daripada Fiuu memerlukan semakan'],
  ['NOT_ELIGIBLE', 'UNKNOWN_REASON', 409, 'Kuarantin transaksi asal belum dapat disahkan'],
  ['STATUS_CHANGED', undefined, 409, 'Kuarantin transaksi asal belum dapat disahkan'],
 ] as const)('does not report a rejected database outcome %s as quarantined', async (
  outcome,
  reason,
  expectedStatus,
  expectedMessage,
 ) => {
  const admin = adminFor();
  admin.rpc.mockResolvedValueOnce({
   data: { outcome, reason },
   error: null,
  });
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS_RETRY_LIMIT');

  expect(response.status).toBe(expectedStatus);
  expect(await response.json()).toMatchObject({
   error: expect.stringContaining(expectedMessage),
   mode: 'FIUU_VT_STATUS_RETRY_LIMIT_NOT_READY',
   ...(expectedStatus === 409 ? { retry_after_ms: 2_000 } : {}),
  });
 });

 it('fails closed when the committed quarantine cannot be re-read as review-locked', async () => {
  const admin = adminFor();
  const query = admin.from();
  query.maybeSingle
   .mockResolvedValueOnce({ data: payment(), error: null })
   .mockResolvedValueOnce({
    data: {
     id: PAYMENT_ID,
     status: 'PENDING',
     fiuu_vt_review_required: false,
     fiuu_vt_reconciliation_state: 'PENDING',
    },
    error: null,
   });
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS_RETRY_LIMIT');

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_STATUS_RETRY_LIMIT_NOT_READY',
  });
 });

 it('rejects unknown quarantine reasons instead of falling back to provider-error recovery', async () => {
  const response = await POST(new Request('http://localhost/vt-park', {
   method: 'POST',
   body: JSON.stringify({ reason: 'UNTRUSTED_REASON' }),
  }), {
   params: Promise.resolve({ paymentId: PAYMENT_ID }),
  });

  expect(response.status).toBe(400);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });
});
