import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getCurrentProfile: vi.fn(),
  getPosDeviceContext: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/access', () => ({
  assertCanAccessPosBranch: vi.fn(),
  posAccessErrorStatus: vi.fn(),
}));
vi.mock('@/lib/pos/device-auth', () => ({
  createPosDeviceSecret: vi.fn(),
  getPosDeviceContext: mocks.getPosDeviceContext,
  hashPosDeviceValue: vi.fn(),
  POS_DEVICE_COOKIE: 'rkj_pos_device',
}));
vi.mock('@/lib/security/rate-limit', () => ({
  enforceRateLimit: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { PUT } from './route';

const PROFILE = {
  id: '11111111-1111-4111-8111-111111111111',
  organization_id: '22222222-2222-4222-8222-222222222222',
};
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';

function arrangeAdmin(
  metadata: Record<string, unknown> = { retained: true },
  currentError: unknown = null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: currentError ? null : { metadata },
    error: currentError,
  });
  const organizationFilter = vi.fn().mockReturnValue({ maybeSingle });
  const selectQuery = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: organizationFilter,
      }),
    }),
  };
  const finalUpdate = vi.fn().mockResolvedValue({ error: null });
  const updateQuery = {
    update: mocks.update.mockImplementation(() => ({
      eq: vi.fn().mockReturnValue({ eq: finalUpdate }),
    })),
  };
  const from = vi.fn()
    .mockReturnValueOnce(selectQuery)
    .mockReturnValueOnce(updateQuery);
  mocks.createAdminClient.mockReturnValue({ from });
  return { organizationFilter };
}

function request(status: Record<string, unknown>) {
  return new Request('http://localhost/api/pos/device', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

function fiuuRequest(status: Record<string, unknown>) {
  return new Request('http://localhost/api/pos/device', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fiuu_vt_status: status }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.getPosDeviceContext.mockResolvedValue({
    mode: 'PRODUCTION',
    device: { id: DEVICE_ID },
  });
});

describe('PUT /api/pos/device host app version reporting', () => {
  it('normalizes and persists Android package version fields with existing metadata', async () => {
    arrangeAdmin();

    const response = await PUT(request({
      nativeApp: true,
      packageName: 'com.rkjone.staff',
      versionName: '  1.8.5\nproduction  ',
      versionCode: '23',
      sdkLevel: 35,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.management).toEqual(expect.objectContaining({
      versionName: '1.8.5 production',
      versionCode: 23,
    }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        retained: true,
        device_management: expect.objectContaining({
          versionName: '1.8.5 production',
          versionCode: 23,
        }),
      }),
    }));
  });

  it.each([
    [{ versionName: 185, versionCode: 0 }],
    [{ versionName: '', versionCode: 2_100_000_001 }],
    [{ versionName: null, versionCode: 'not-a-number' }],
  ])('stores null for invalid host version values: %j', async (status) => {
    arrangeAdmin({});

    const response = await PUT(request(status));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.management.versionName).toBeNull();
    expect(body.management.versionCode).toBeNull();
  });
});

describe('PUT /api/pos/device Fiuu VT app reporting', () => {
  it('persists normalized Fiuu app evidence without replacing host management state', async () => {
    arrangeAdmin({
      retained: true,
      device_management: { nativeApp: true, versionName: '1.8.7', versionCode: 25 },
    });

    const response = await PUT(fiuuRequest({
      nativeAndroid: true,
      installed: true,
      trustedInstall: true,
      packageName: 'com.rms.mobile.razervt',
      versionName: ' 3.2.1\n ',
      versionCode: '321',
      installSource: 'com.android.vending',
      bridgeApiVersion: '11',
      stateSchemaVersion: 7,
      callbackRegistryRecoveryRequired: false,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.management).toMatchObject({ versionName: '1.8.7', versionCode: 25 });
    expect(body.fiuuVt).toEqual(expect.objectContaining({
      installed: true,
      trustedInstall: true,
      packageName: 'com.rms.mobile.razervt',
      versionName: '3.2.1',
      versionCode: 321,
      installSource: 'com.android.vending',
      bridgeApiVersion: 11,
      stateSchemaVersion: 7,
      callbackRegistryRecoveryRequired: false,
    }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        retained: true,
        device_management: expect.objectContaining({ versionCode: 25 }),
        fiuu_vt_app: expect.objectContaining({ versionCode: 321 }),
      }),
    }));
  });

  it('fails closed for an empty update body', async () => {
    arrangeAdmin({});
    const response = await PUT(new Request('http://localhost/api/pos/device', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not overwrite metadata when the current device row cannot be read', async () => {
    arrangeAdmin({}, { message: 'read failed' });

    const response = await PUT(fiuuRequest({ installed: true }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
