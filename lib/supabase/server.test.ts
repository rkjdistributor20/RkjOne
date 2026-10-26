import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 cookieGetAll: vi.fn(),
 cookieSet: vi.fn(),
 cookies: vi.fn(),
 createServerClient: vi.fn(),
 createSupabaseClient: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createSupabaseClient }));

import { createClient, createServiceClient } from './server';

beforeEach(() => {
 vi.clearAllMocks();
 process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging.example.invalid';
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key';
 process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role-key';

 mocks.cookies.mockResolvedValue({
  getAll: mocks.cookieGetAll,
  set: mocks.cookieSet,
 });
 mocks.createServerClient.mockReturnValue({ kind: 'session-client' });
 mocks.createSupabaseClient.mockReturnValue({ kind: 'service-client' });
});

describe('Supabase server clients', () => {
 it('creates the session client with request cookies', async () => {
  await expect(createClient()).resolves.toEqual({ kind: 'session-client' });

  expect(mocks.cookies).toHaveBeenCalledOnce();
  expect(mocks.createServerClient).toHaveBeenCalledWith(
   'https://staging.example.invalid',
   'synthetic-anon-key',
   expect.objectContaining({ cookies: expect.any(Object) }));
 });

 it('creates the service client without inheriting request cookies', async () => {
  await expect(createServiceClient()).resolves.toEqual({ kind: 'service-client' });

  expect(mocks.cookies).not.toHaveBeenCalled();
  expect(mocks.createServerClient).not.toHaveBeenCalled();
  expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
   'https://staging.example.invalid',
   'synthetic-service-role-key',
   {
    auth: {
     autoRefreshToken: false,
     detectSessionInUrl: false,
     persistSession: false,
    },
   });
 });
});
