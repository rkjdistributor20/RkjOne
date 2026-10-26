import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 enforceRateLimit: vi.fn(),
 createClient: vi.fn(),
 createServiceClient: vi.fn(),
 getUser: vi.fn(),
 updateUser: vi.fn(),
 profileReadFrom: vi.fn(),
 profileReadSelect: vi.fn(),
 profileReadEq: vi.fn(),
 profileReadMaybeSingle: vi.fn(),
 profileWriteFrom: vi.fn(),
 profileWriteUpdate: vi.fn(),
 profileWriteEq: vi.fn(),
 profileWriteSelect: vi.fn(),
 profileWriteMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('@/lib/supabase/server', () => ({
 createClient: mocks.createClient,
 createServiceClient: mocks.createServiceClient,
}));

import { POST } from './route';

const USER = {
 id: '11111111-1111-4111-8111-111111111111',
 email: 'forced-password-user@example.invalid',
 last_sign_in_at: '2026-10-26T10:20:30.000Z',
};

type TestProfile = {
 status: string;
 must_change_password: boolean;
 updated_at: string;
 metadata: Record<string, unknown> | null;
};

const ACTIVE_PROFILE: TestProfile = {
 status: 'ACTIVE',
 must_change_password: true,
 updated_at: '2026-10-26T10:14:38.000Z',
 metadata: null,
};

function request(body: Record<string, unknown>) {
 return new Request('http://localhost/api/auth/change-password', {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(body),
 });
}

function arrange({
 user = USER,
 profile = ACTIVE_PROFILE,
 profileLookupError = null,
 updateError = null,
 profileUpdateError = null,
 updatedProfile = { id: USER.id },
}: {
 user?: typeof USER | null;
 profile?: TestProfile | null;
 profileLookupError?: { message: string } | null;
 updateError?: { message: string } | null;
 profileUpdateError?: { message: string } | null;
 updatedProfile?: { id: string } | null;
} = {}) {
 const readQuery = {
 select: mocks.profileReadSelect,
 eq: mocks.profileReadEq,
 maybeSingle: mocks.profileReadMaybeSingle,
 };
 const writeQuery = {
 update: mocks.profileWriteUpdate,
 eq: mocks.profileWriteEq,
 select: mocks.profileWriteSelect,
 maybeSingle: mocks.profileWriteMaybeSingle,
 };

 mocks.getUser.mockResolvedValue({ data: { user }, error: null });
 mocks.updateUser.mockResolvedValue({ error: updateError });
 mocks.profileReadFrom.mockReturnValue(readQuery);
 mocks.profileReadSelect.mockReturnValue(readQuery);
 mocks.profileReadEq.mockReturnValue(readQuery);
 mocks.profileReadMaybeSingle.mockResolvedValue({
 data: profile,
 error: profileLookupError,
 });
 mocks.profileWriteFrom.mockReturnValue(writeQuery);
 mocks.profileWriteUpdate.mockReturnValue(writeQuery);
 mocks.profileWriteEq.mockReturnValue(writeQuery);
 mocks.profileWriteSelect.mockReturnValue(writeQuery);
 mocks.profileWriteMaybeSingle.mockResolvedValue({
 data: updatedProfile,
 error: profileUpdateError,
 });

 mocks.createClient.mockResolvedValue({
 auth: {
 getUser: mocks.getUser,
 updateUser: mocks.updateUser,
 },
 from: mocks.profileReadFrom,
 });
 mocks.createServiceClient.mockResolvedValue({
 from: mocks.profileWriteFrom,
 });
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.enforceRateLimit.mockReturnValue(null);
});

describe('POST /api/auth/change-password', () => {
 it('uses a session established after the reset to change the forced password', async () => {
 arrange();

 const response = await POST(request({ newPassword: 'synthetic-next-credential' }));

 expect(response.status).toBe(200);
 await expect(response.json()).resolves.toEqual({ ok: true });
 expect(mocks.updateUser).toHaveBeenCalledWith({
 password: 'synthetic-next-credential',
 });
 expect(mocks.profileWriteUpdate).toHaveBeenCalledWith(
 expect.objectContaining({ must_change_password: false }));
 expect(mocks.profileWriteEq).toHaveBeenCalledWith('id', USER.id);
 expect(mocks.profileWriteEq).toHaveBeenCalledWith('must_change_password', true);
});

 it('rejects a session that predates the password reset', async () => {
 arrange({
 user: {
 ...USER,
 last_sign_in_at: '2026-10-26T10:10:00.000Z',
 },
 });

 const response = await POST(request({ newPassword: 'synthetic-next-credential' }));

 expect(response.status).toBe(401);
 expect(mocks.updateUser).not.toHaveBeenCalled();
 expect(mocks.createServiceClient).not.toHaveBeenCalled();
});

 it('prefers the explicit password reset timestamp in profile metadata', async () => {
 arrange({
 profile: {
 ...ACTIVE_PROFILE,
 updated_at: '2026-10-26T09:00:00.000Z',
 metadata: { password_reset_at: '2026-10-26T10:25:00.000Z' },
 },
 });

 const response = await POST(request({ newPassword: 'synthetic-next-credential' }));

 expect(response.status).toBe(401);
 expect(mocks.updateUser).not.toHaveBeenCalled();
});

 it('does not update the password when the profile is not active', async () => {
 arrange({ profile: { ...ACTIVE_PROFILE, status: 'INACTIVE' } });

 const response = await POST(request({ newPassword: 'synthetic-next-credential' }));

 expect(response.status).toBe(403);
 expect(mocks.updateUser).not.toHaveBeenCalled();
});

 it('requires a new password of at least eight characters', async () => {
 arrange();

 const response = await POST(request({ newPassword: 'short' }));

 expect(response.status).toBe(400);
 expect(mocks.createClient).not.toHaveBeenCalled();
});

 it('reports a profile synchronization failure after the auth update', async () => {
 arrange({
 profileUpdateError: { message: 'synthetic profile failure' },
 updatedProfile: null,
 });

 const response = await POST(request({ newPassword: 'synthetic-next-credential' }));

 expect(response.status).toBe(500);
 expect(mocks.updateUser).toHaveBeenCalledOnce();
});
});
