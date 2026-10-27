import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
 vi.resetModules();
});

afterEach(() => {
 vi.unstubAllGlobals();
});

describe('fetchJson', () => {
 it('always sends same-origin credentials, even when the caller requests otherwise', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
   new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
   }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { fetchJson } = await import('./fetch-json');

  await expect(fetchJson('/api/example', { credentials: 'omit' })).resolves.toEqual({ ok: true });

  expect(fetchMock).toHaveBeenCalledWith(
   '/api/example',
   expect.objectContaining({ credentials: 'same-origin' }),
  );
 });

 it('uses a stable session-expired message and redirects only once with the current path', async () => {
  const replace = vi.fn();
  vi.stubGlobal('window', {
   location: {
    pathname: '/pos',
    search: '?branch=BR001',
    hash: '#payment',
    replace,
   },
  });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
   Promise.resolve(new Response('<html>Unauthorized</html>', {
    status: 401,
    headers: { 'Content-Type': 'text/html' },
   })),
  ));
  const { fetchJson, SESSION_EXPIRED_MESSAGE } = await import('./fetch-json');

  await expect(fetchJson('/api/pos/shift')).rejects.toMatchObject({
   message: SESSION_EXPIRED_MESSAGE,
   status: 401,
  });
  await expect(fetchJson('/api/pos/summary')).rejects.toMatchObject({
   message: SESSION_EXPIRED_MESSAGE,
   status: 401,
  });

  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith(
   '/login?redirect=%2Fpos%3Fbranch%3DBR001%23payment&error=session_expired',
  );
 });

 it('does not redirect a 401 response while already on the login page', async () => {
  const replace = vi.fn();
  vi.stubGlobal('window', {
   location: { pathname: '/login', search: '', hash: '', replace },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
   new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ));
  const { fetchJson, SESSION_EXPIRED_MESSAGE } = await import('./fetch-json');

  await expect(fetchJson('/api/session')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  expect(replace).not.toHaveBeenCalled();
 });

 it('does not expose a non-JSON error body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
   new Response('<html>internal proxy details</html>', {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
   }),
  ));
  const { fetchJson } = await import('./fetch-json');

  await expect(fetchJson('/api/example')).rejects.toMatchObject({
   message: 'Request failed (502)',
   status: 502,
   data: null,
  });
 });

 it('reports an invalid successful response without leaking its body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
   new Response('not-json-with-sensitive-upstream-details', { status: 200 }),
  ));
  const { fetchJson } = await import('./fetch-json');

  await expect(fetchJson('/api/example')).rejects.toMatchObject({
   message: 'Respons pelayan tidak sah. Sila cuba semula.',
   status: 200,
  });
 });
});
