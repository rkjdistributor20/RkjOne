import { afterEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, fetchApprovals, rejectRequest } from './api';

afterEach(() => {
 vi.unstubAllGlobals();
});

describe('approval API client', () => {
 it('always requests current approval data without using a browser cache', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
   new Response(JSON.stringify({ approvals: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
   }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await fetchApprovals('PENDING');

  expect(fetchMock).toHaveBeenCalledWith(
   '/api/approvals?status=PENDING',
   expect.objectContaining({ cache: 'no-store' }),
  );
 });

 it('keeps approval mutations as POST requests while bypassing cache', async () => {
  const fetchMock = vi.fn().mockImplementation(() =>
   Promise.resolve(new Response(JSON.stringify({ result: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
   })),
  );
  vi.stubGlobal('fetch', fetchMock);

  await approveRequest('approval-1');
  await rejectRequest('approval-2', 'Bukti tidak lengkap');

  expect(fetchMock).toHaveBeenNthCalledWith(
   1,
   '/api/approvals/approval-1/approve',
   expect.objectContaining({ method: 'POST', cache: 'no-store' }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
   2,
   '/api/approvals/approval-2/reject',
   expect.objectContaining({
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ reason: 'Bukti tidak lengkap' }),
   }),
  );
 });
});
