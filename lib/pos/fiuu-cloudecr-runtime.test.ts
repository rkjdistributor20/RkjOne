import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiuuCloudEcrFetch, FiuuCloudEcrTokens } from './fiuu-cloudecr';
import {
 clearFiuuCloudEcrRuntimeTokens,
 fetchFiuuCloudEcrTerminals,
} from './fiuu-cloudecr-runtime';

const ORIGINAL_ENV = { ...process.env };
const TEST_ENV = {
 POS_FIUU_CLOUDECR_BASE_URL: 'https://cloudecr.fiuu.com',
 POS_FIUU_CLOUDECR_POS_ID: 'POS-BR001',
 POS_FIUU_CLOUDECR_PASSWORD: 'test-password-not-real',
 POS_FIUU_CLOUDECR_MERCHANT_ID: 'MERCHANT-TEST',
 POS_FIUU_CLOUDECR_DEVICE_ID: 'DEVICE-BR001',
 POS_FIUU_CLOUDECR_TERMINAL_SN: 'VT-TEST-001',
 POS_FIUU_CLOUDECR_SECRET_KEY: 'test-secret-not-real',
 POS_FIUU_CLOUDECR_TIMEOUT_MS: '5000',
} as const;

function tokens(suffix: string): FiuuCloudEcrTokens {
 return {
  access: {
   token: `access-token-${suffix}`,
   expiresAt: '2030-01-02T04:00:00.000Z',
  },
  refresh: {
   token: `refresh-token-${suffix}`,
   expiresAt: '2030-01-02T23:59:00.000Z',
  },
 };
}

function jsonResponse(body: unknown, status = 200): Response {
 return new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
 });
}

function terminalResponse(): Response {
 return jsonResponse({
  data: [{ terminalId: 'VT-TEST-001', connected: true, isVT: true }],
 });
}

function authorization(init: RequestInit | undefined): string | undefined {
 return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

beforeEach(() => {
 process.env = { ...ORIGINAL_ENV, ...TEST_ENV };
 clearFiuuCloudEcrRuntimeTokens();
});

afterEach(() => {
 clearFiuuCloudEcrRuntimeTokens();
 process.env = { ...ORIGINAL_ENV };
});

describe('cloudECR runtime authorization recovery', () => {
 it('refreshes once after an operation returns 401 and retries with the new access token', async () => {
  const oldTokens = tokens('old');
  const newTokens = tokens('new');
  let step = 0;
  const fetcher = vi.fn<FiuuCloudEcrFetch>(async (input, init) => {
   step += 1;
   const url = String(input);
   if (step === 1) {
    expect(url).toBe('https://cloudecr.fiuu.com/auth/login');
    return jsonResponse(oldTokens);
   }
   if (step === 2) return terminalResponse();
   if (step === 3) {
    expect(url).toBe('https://cloudecr.fiuu.com/api/terminals');
    expect(authorization(init)).toBe('Bearer access-token-old');
    return jsonResponse({ code: 40123, message: 'Token expired.' }, 401);
   }
   if (step === 4) {
    expect(url).toBe('https://cloudecr.fiuu.com/auth/refresh');
    expect(authorization(init)).toBe('Bearer refresh-token-old');
    return jsonResponse(newTokens);
   }
   expect(step).toBe(5);
   expect(url).toBe('https://cloudecr.fiuu.com/api/terminals');
   expect(authorization(init)).toBe('Bearer access-token-new');
   return terminalResponse();
  });

  await expect(fetchFiuuCloudEcrTerminals({ fetcher })).resolves.toHaveLength(1);
  await expect(fetchFiuuCloudEcrTerminals({ fetcher })).resolves.toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(5);
 });

 it('ends a known stale session and retries login once when Fiuu returns 40314', async () => {
  const oldTokens = tokens('old');
  const newTokens = tokens('new');
  let step = 0;
  const fetcher = vi.fn<FiuuCloudEcrFetch>(async (input, init) => {
   step += 1;
   const url = String(input);
   if (step === 1) return jsonResponse(oldTokens);
   if (step === 2) return terminalResponse();
   if (step === 3) {
    expect(authorization(init)).toBe('Bearer access-token-old');
    return jsonResponse({ code: 40123, message: 'Token expired.' }, 401);
   }
   if (step === 4) {
    expect(url).toBe('https://cloudecr.fiuu.com/auth/refresh');
    return jsonResponse({ code: 40121, message: 'Refresh token invalid.' }, 401);
   }
   if (step === 5) {
    expect(url).toBe('https://cloudecr.fiuu.com/auth/login');
    return jsonResponse({ code: 40314, message: 'Active session exists.' }, 403);
   }
   if (step === 6) {
    expect(url).toBe('https://cloudecr.fiuu.com/auth/logout');
    expect(authorization(init)).toBe('Bearer access-token-old');
    return new Response(null, { status: 204 });
   }
   if (step === 7) {
    expect(url).toBe('https://cloudecr.fiuu.com/auth/login');
    return jsonResponse(newTokens);
   }
   expect(step).toBe(8);
   expect(url).toBe('https://cloudecr.fiuu.com/api/terminals');
   expect(authorization(init)).toBe('Bearer access-token-new');
   return terminalResponse();
  });

  await fetchFiuuCloudEcrTerminals({ fetcher });
  await expect(fetchFiuuCloudEcrTerminals({ fetcher })).resolves.toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(8);
 });

 it('surfaces 40314 without unsafe logout guesses when no known token exists', async () => {
  const fetcher = vi.fn<FiuuCloudEcrFetch>().mockResolvedValue(jsonResponse({
   code: 40314,
   message: 'Active session exists.',
  }, 403));

  await expect(fetchFiuuCloudEcrTerminals({ fetcher }))
   .rejects.toThrow('kod 40314');
  expect(fetcher).toHaveBeenCalledOnce();
 });
});
