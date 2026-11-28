import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const ENROLLMENT_GENERATION = 3;
const UPDATED_AT = '2026-11-28T02:53:03.000Z';
const COMMIT = '1234567890abcdef1234567890abcdef12345678';
const PRIOR_WEB_BUILD = { commitSha: 'a'.repeat(40), receivedAt: UPDATED_AT, enrollmentGeneration: 3 };

function arrangeAdmin(
  metadata: Record<string, unknown> = { retained: true },
  currentError: unknown = null,
) {
  const read = vi.fn().mockResolvedValue({
    data: currentError ? null : { metadata, updated_at: UPDATED_AT },
    error: currentError,
  });
  const write = vi.fn().mockResolvedValue({ data: { id: DEVICE_ID }, error: null });
  const selectQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: read };
  const updateQuery = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: write };
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue(selectQuery),
    update: mocks.update.mockReturnValue(updateQuery),
  });
  mocks.createAdminClient.mockReturnValue({ from });
  return { from, read, write, selectQuery, updateQuery };
}

function putRequest(body: unknown) {
  return new Request('http://localhost/api/pos/device', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function request(status: Record<string, unknown>) {
  return putRequest({ status });
}

function fiuuRequest(status: Record<string, unknown>) {
  return putRequest({ fiuu_vt_status: status });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.getPosDeviceContext.mockResolvedValue({
    mode: 'PRODUCTION',
    device: { id: DEVICE_ID, branchId: BRANCH_ID, enrollmentGeneration: ENROLLMENT_GENERATION },
  });
});

afterEach(() => vi.useRealTimers());

describe('PUT /api/pos/device host app version reporting', () => {
  it('normalizes and persists Android package version fields with existing metadata', async () => {
    arrangeAdmin({ retained: true, web_build: PRIOR_WEB_BUILD });

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
        web_build: PRIOR_WEB_BUILD,
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
      web_build: PRIOR_WEB_BUILD,
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
        web_build: PRIOR_WEB_BUILD,
        device_management: expect.objectContaining({ versionCode: 25 }),
        fiuu_vt_app: expect.objectContaining({ versionCode: 321 }),
      }),
    }));
  });

  it.each([{}, null, [], 'status'])('fails closed without a report: %j', async (body) => {
    arrangeAdmin({});
    const response = await PUT(putRequest(body));

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

describe('PUT /api/pos/device rendered web build self-report', () => {
  it('records the exact reported SHA with server receipt time and only updates the authenticated enrollment', async () => {
    const receivedAt = '2026-11-28T03:14:00.000Z';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(receivedAt));
    const metadata = {
      official_hardware_profile: 'SAMSUNG_TAB_S10_LITE_5G_128',
      device_management: { versionName: '1.8.7', versionCode: 25 },
      fiuu_vt_app: { installed: true, versionName: '3.2.1' },
      web_build: PRIOR_WEB_BUILD,
    };
    const { from, selectQuery, updateQuery } = arrangeAdmin(metadata);

    const response = await PUT(putRequest({
      web_commit_sha: COMMIT,
      receivedAt: '2000-01-01T00:00:00.000Z',
      device_id: 'another-device',
      organization_id: 'another-organization',
      branch_id: 'another-branch',
      enrollment_generation: 999,
      metadata: { official_hardware_profile: 'spoofed' },
    }));

    expect(response.status).toBe(200);
    expect(mocks.getPosDeviceContext).toHaveBeenCalledWith(PROFILE);
    expect(from.mock.calls).toEqual([['pos_devices'], ['pos_devices']]);
    const scope = [
      ['id', DEVICE_ID],
      ['organization_id', PROFILE.organization_id],
      ['branch_id', BRANCH_ID],
      ['status', 'ACTIVE'],
      ['enrollment_generation', ENROLLMENT_GENERATION],
    ];
    expect(selectQuery.eq.mock.calls).toEqual(scope);
    expect(updateQuery.eq.mock.calls).toEqual([...scope, ['updated_at', UPDATED_AT]]);
    expect(mocks.update).toHaveBeenCalledWith({
      metadata: {
        ...metadata,
        web_build: { commitSha: COMMIT, receivedAt, enrollmentGeneration: ENROLLMENT_GENERATION },
      },
      last_seen_at: receivedAt,
      updated_at: receivedAt,
    });
  });

  it.each(['unknown', COMMIT.slice(0, 12), COMMIT + '\n', 'g'.repeat(40), 'a'.repeat(64), null, 123, { commitSha: COMMIT }])(
    'rejects an invalid or non-full repository SHA without touching metadata: %j',
    async (webCommit) => {
      const response = await PUT(putRequest({ web_commit_sha: webCommit }));

      expect(response.status).toBe(400);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    },
  );

  it('rejects a report without a signed-in profile', async () => {
    mocks.getCurrentProfile.mockResolvedValue(null);
    const response = await PUT(putRequest({ web_commit_sha: COMMIT }));

    expect(response.status).toBe(401);
    expect(mocks.getPosDeviceContext).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a report without production device authentication', async () => {
    mocks.getPosDeviceContext.mockResolvedValue({ mode: 'TRAINING', device: null });
    const response = await PUT(putRequest({ web_commit_sha: COMMIT }));

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('merges against fresh metadata after a concurrent native/Fiuu report', async () => {
    const { read, write, updateQuery } = arrangeAdmin();
    const latest = {
      device_management: { versionCode: 25 },
      fiuu_vt_app: { installed: true },
    };
    const latestUpdatedAt = '2026-11-28T02:53:04.000Z';
    write.mockResolvedValueOnce({ data: null, error: null });
    read
      .mockResolvedValueOnce({ data: { metadata: { retained: true }, updated_at: UPDATED_AT }, error: null })
      .mockResolvedValueOnce({
        data: { metadata: { retained: true, ...latest }, updated_at: latestUpdatedAt },
        error: null,
      });

    const response = await PUT(putRequest({ web_commit_sha: COMMIT }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(updateQuery.eq).toHaveBeenLastCalledWith('updated_at', latestUpdatedAt);
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      metadata: { retained: true, ...latest, web_build: expect.objectContaining({ commitSha: COMMIT }) },
    }));
  });

  it('does not report success when the authenticated enrollment no longer matches at write time', async () => {
    const { read, write } = arrangeAdmin();
    const firstSnapshot = { data: { metadata: {}, updated_at: UPDATED_AT }, error: null };
    read.mockResolvedValueOnce(firstSnapshot).mockResolvedValueOnce({ data: null, error: null });
    write.mockResolvedValueOnce({ data: null, error: null });

    const response = await PUT(putRequest({ web_commit_sha: COMMIT }));

    expect(response.ok).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
