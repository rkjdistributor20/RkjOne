import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createEnrollmentCode: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCurrentProfile: vi.fn(),
  hashPosDeviceValue: vi.fn(),
  isSettingsAdmin: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/device-auth', () => ({
  createEnrollmentCode: mocks.createEnrollmentCode,
  hashPosDeviceValue: mocks.hashPosDeviceValue,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock('@/lib/settings/admin-auth', () => ({
  isSettingsAdmin: mocks.isSettingsAdmin,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from './route';

const PROFILE = {
  id: '11111111-1111-4111-8111-111111111111',
  organization_id: '22222222-2222-4222-8222-222222222222',
  role: 'SUPER_ADMIN',
};
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const CODE_HASH = 'a'.repeat(64);

function request() {
  return new Request(`http://localhost/api/settings/pos-devices/${DEVICE_ID}/reenroll`, {
    method: 'POST',
  });
}

function arrangeRpc(result: { data: unknown; error: unknown }) {
  mocks.single.mockResolvedValue(result);
  mocks.rpc.mockReturnValue({ single: mocks.single });
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRateLimit.mockReturnValue(null);
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.isSettingsAdmin.mockReturnValue(true);
  mocks.createEnrollmentCode.mockReturnValue('ABCDEF1234');
  mocks.hashPosDeviceValue.mockReturnValue(CODE_HASH);
});

describe('POST /api/settings/pos-devices/[id]/reenroll', () => {
  it('delegates BR001 rotation and audit enforcement to the atomic database RPC', async () => {
    arrangeRpc({
      data: {
        id: DEVICE_ID,
        device_code: 'POS-BR001-TEST',
        device_name: 'Tablet POS BR001',
        branch_id: '44444444-4444-4444-8444-444444444444',
        status: 'PENDING',
        enrollment_expires_at: '2026-10-28T00:00:00.000Z',
      },
      error: null,
    });

    const response = await POST(request(), { params: Promise.resolve({ id: DEVICE_ID }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      enrollment_code: 'ABCDEF1234',
      device: expect.objectContaining({ status: 'PENDING' }),
    }));
    expect(mocks.rpc).toHaveBeenCalledWith('request_br001_pos_device_reenrollment', expect.objectContaining({
      p_device_id: DEVICE_ID,
      p_organization_id: PROFILE.organization_id,
      p_actor_id: PROFILE.id,
      p_enrollment_code_hash: CODE_HASH,
      p_enrollment_expires_at: expect.any(String),
    }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a conflict without disclosing the new code when a payment is unresolved', async () => {
    arrangeRpc({
      data: null,
      error: {
        code: 'P0001',
        message: 'Selesaikan bayaran Fiuu VT yang belum selesai sebelum daftar semula tablet.',
      },
    });

    const response = await POST(request(), { params: Promise.resolve({ id: DEVICE_ID }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('bayaran Fiuu VT');
    expect(body.enrollment_code).toBeUndefined();
  });

  it('rejects non-admin access before creating an admin client', async () => {
    mocks.isSettingsAdmin.mockReturnValue(false);

    const response = await POST(request(), { params: Promise.resolve({ id: DEVICE_ID }) });

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
