import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertCanManagePersonnel: vi.fn(),
 assertUserTargetInScope: vi.fn(),
 createAdminClient: vi.fn(),
 createClient: vi.fn(),
 enforceRateLimit: vi.fn(),
 generateTemporaryPassword: vi.fn(),
 getCurrentProfile: vi.fn(),
 isSettingsAdmin: vi.fn(),
 readEq: vi.fn(),
 readFrom: vi.fn(),
 readMaybeSingle: vi.fn(),
 readSelect: vi.fn(),
 updateUserById: vi.fn(),
 writeEq: vi.fn(),
 writeFrom: vi.fn(),
 writeUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/security/passwords', () => ({
 generateTemporaryPassword: mocks.generateTemporaryPassword,
}));
vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock('@/lib/settings/admin-auth', () => ({
 isSettingsAdmin: mocks.isSettingsAdmin,
}));
vi.mock('@/lib/settings/personnel-access', () => ({
 assertCanManagePersonnel: mocks.assertCanManagePersonnel,
 assertUserTargetInScope: mocks.assertUserTargetInScope,
}));
vi.mock('@/lib/supabase/server', () => ({
 createClient: mocks.createClient,
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
const TARGET = {
 id: '33333333-3333-4333-8333-333333333333',
 email: 'uat.fiuu.staff.br001@example.invalid',
 full_name: 'UAT Fiuu Staff BR001',
 employee_code: 'UAT-FIUU-001',
 metadata: null,
};

function request() {
 return new Request('http://localhost/api/settings/users/target/reset-password', {
  method: 'POST',
 });
}

function arrange({
 authError = null,
 profileError = null,
}: {
 authError?: { message: string } | null;
 profileError?: { message: string } | null;
} = {}) {
 const readQuery = {
  select: mocks.readSelect,
  eq: mocks.readEq,
  maybeSingle: mocks.readMaybeSingle,
 };
 const writeQuery = {
  update: mocks.writeUpdate,
  eq: mocks.writeEq,
 };

 mocks.getCurrentProfile.mockResolvedValue(PROFILE);
 mocks.assertCanManagePersonnel.mockReturnValue(PROFILE);
 mocks.isSettingsAdmin.mockReturnValue(true);
 mocks.generateTemporaryPassword.mockReturnValue('synthetic-temporary-password');

 mocks.readFrom.mockReturnValue(readQuery);
 mocks.readSelect.mockReturnValue(readQuery);
 mocks.readEq.mockReturnValue(readQuery);
 mocks.readMaybeSingle.mockResolvedValue({ data: TARGET, error: null });
 mocks.createClient.mockResolvedValue({ from: mocks.readFrom });

 mocks.updateUserById.mockResolvedValue({ error: authError });
 mocks.writeFrom.mockReturnValue(writeQuery);
 mocks.writeUpdate.mockReturnValue(writeQuery);
 mocks.writeEq.mockImplementation((column: string) =>
  column === 'organization_id'
   ? Promise.resolve({ error: profileError })
   : writeQuery);
 mocks.createAdminClient.mockReturnValue({
  auth: { admin: { updateUserById: mocks.updateUserById } },
  from: mocks.writeFrom,
 });
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.enforceRateLimit.mockReturnValue(null);
});

describe('POST /api/settings/users/[id]/reset-password', () => {
 it('uses the no-cookie admin client for privileged auth and profile writes', async () => {
  arrange();

  const response = await POST(request(), { params: Promise.resolve({ id: TARGET.id }) });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual(expect.objectContaining({
   temporary_password: 'synthetic-temporary-password',
  }));
  expect(mocks.createAdminClient).toHaveBeenCalledOnce();
  expect(mocks.updateUserById).toHaveBeenCalledWith(TARGET.id, {
   password: 'synthetic-temporary-password',
  });
  expect(mocks.writeUpdate).toHaveBeenCalledWith(expect.objectContaining({
   must_change_password: true,
  }));
 });

 it('does not update the profile when the auth reset fails', async () => {
  arrange({ authError: { message: 'synthetic auth failure' } });

  const response = await POST(request(), { params: Promise.resolve({ id: TARGET.id }) });

  expect(response.status).toBe(400);
  expect(mocks.writeUpdate).not.toHaveBeenCalled();
 });

 it('reports a privileged profile synchronization failure', async () => {
  arrange({ profileError: { message: 'synthetic profile failure' } });

  const response = await POST(request(), { params: Promise.resolve({ id: TARGET.id }) });

  expect(response.status).toBe(400);
  expect(mocks.updateUserById).toHaveBeenCalledOnce();
 });
});
