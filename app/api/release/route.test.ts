import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pwa/release-metadata', async () => (
 await import('../../../lib/pwa/release-metadata')
));

import { GET } from './route';

const originalDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA;

afterEach(() => {
 if (originalDeploymentId === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
 else process.env.VERCEL_DEPLOYMENT_ID = originalDeploymentId;
 if (originalCommitSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
 else process.env.VERCEL_GIT_COMMIT_SHA = originalCommitSha;
});

describe('GET /api/release', () => {
 it('returns only deployment metadata with fail-closed no-store headers', async () => {
  process.env.VERCEL_DEPLOYMENT_ID = 'deployment_test_123';
  process.env.VERCEL_GIT_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';

  const response = await GET();
  const body = await response.json() as Record<string, unknown>;

  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(response.headers.get('Pragma')).toBe('no-cache');
  expect(body).toEqual({
   releaseId: expect.stringMatching(/^rkj-[0-9a-f]{32}$/),
   commitSha: '0123456789abcdef0123456789abcdef01234567',
  });
  expect(Object.keys(body).sort()).toEqual(['commitSha', 'releaseId']);
 });

 it('does not expose a malformed commit value', async () => {
  process.env.VERCEL_DEPLOYMENT_ID = 'deployment_test_456';
  process.env.VERCEL_GIT_COMMIT_SHA = 'not-a-commit-or-secret';

  const response = await GET();

  expect(await response.json()).toMatchObject({ commitSha: 'unknown' });
 });
});
