import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 profile: vi.fn(),
 client: vi.fn(),
 rpc: vi.fn(),
 resolve: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.profile }));
vi.mock('@/lib/auth/branch-scope', () => ({ resolveScopedBranches: mocks.resolve }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));

import { GET as getOverview } from './overview/route';
import { GET as getSales } from './sales/route';
import { GET as getFleet } from './fleet/route';
import { GET as getInventory } from './inventory/route';
import { GET as getMovements } from './movements/route';
import { GET as getReceipt } from './receipt/route';
import { GET as getTransactions } from './transactions/route';

const branch = '00000000-0000-0000-0000-000000000011';
const transaction = '00000000-0000-0000-0000-000000000012';
const am = { id: 'am-id', role: 'AREA_MANAGER', organization_id: 'am-org' };
const request = (query = '') => new Request(`http://localhost/api/reports?from=2026-11-27&to=2026-11-28${query}`);

beforeEach(() => {
 vi.resetAllMocks();
 mocks.profile.mockResolvedValue(am);
 mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});

describe('report route authorization and filtering', () => {
 it('rejects anonymous sessions and roles without report access before any DB report query', async () => {
  mocks.profile.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...am, role: 'STAFF' });
  expect((await getOverview(request())).status).toBe(401);
  expect((await getSales(request())).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
 });

 it('rejects invalid inputs and a branch denied by the shared resolver', async () => {
  expect((await getSales(request('&branch_id=bogus'))).status).toBe(400);
  expect((await getMovements(request('&movement_type=__proto__'))).status).toBe(400);
  expect((await getInventory(request('&page=0'))).status).toBe(400);
  expect((await getReceipt(request())).status).toBe(400);
  mocks.resolve.mockRejectedValueOnce(new Error('Denied'));
  expect((await getInventory(request(`&branch_id=${branch}&format=csv`))).status).toBe(403);
  expect(mocks.resolve).toHaveBeenCalledWith({ rpc: mocks.rpc }, am, branch);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('honors a DB branch revocation and never serves an export or a cached response', async () => {
  mocks.rpc.mockResolvedValue({ error: { code: '42501' } });
  const denied = await getMovements(request(`&branch_id=${branch}&format=csv`));
  expect(denied.status).toBe(403);
  expect(denied.headers.get('content-type')).not.toContain('csv');
  expect(denied.headers.get('cache-control')).toBe('private, no-store');
  expect((await getFleet(request())).status).toBe(403);
 });

 it('returns the same not-found response for invisible and missing receipt records', async () => {
  mocks.rpc.mockResolvedValue({ data: { receipt: null } });
  const response = await getReceipt(request(`&transaction_id=${transaction}`));
  expect(response.status).toBe(404);
  expect(mocks.rpc).toHaveBeenCalledWith('read_scoped_report', expect.objectContaining({
   p_report: 'receipt', p_transaction_id: transaction, p_limit: 1,
  }));
 });
});

describe('report CSV and view parity', () => {
 it('sends the same movement scope and filter through the same query for JSON and CSV', async () => {
  const row = {
   created_at: '2026-11-27T16:00:00Z', branch_name: '=Branch', location_name: 'Kiosk, East',
   item_code: 'THING', name: 'A "quote"', movement_type: 'ADJUSTMENT', quantity: -2, unit: 'PCS',
   balance_before: 8, balance_after: 6, reference_id: null, reference_type: null,
   actor_name: null, created_by: null,
  };
  mocks.rpc.mockResolvedValue({ data: { movements: [row] } });
  const query = `&branch_id=${branch}&movement_type=ADJUSTMENT`;
  const json = await getMovements(request(query));
  const csv = await getMovements(request(query + '&format=csv'));
  const first = mocks.rpc.mock.calls[0][1];
  expect(mocks.rpc.mock.calls[1][1]).toEqual({ ...first, p_limit: 5001 });
  expect(first).toEqual(expect.objectContaining({
   p_report: 'movements', p_branch_id: branch, p_movement_type: 'ADJUSTMENT',
   p_from: '2026-11-27', p_to: '2026-11-28',
  }));
  expect(first).not.toHaveProperty('p_organization_id');
  expect(await json.json()).toEqual({ movements: [row], has_more: false });
  expect(csv.headers.get('content-disposition')).toContain('rkj-movements-2026-11-27_2026-11-28.csv');
  expect(csv.headers.get('cache-control')).toBe('private, no-store');
  expect(await csv.text()).toContain(`"2026-11-28 00:00:00","'=Branch","Kiosk, East","THING","A ""quote""","Pelarasan",-2`);
 });

 it('does not silently truncate an export or return a lookahead row in JSON', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { transactions: Array(5001).fill({}) } })
   .mockResolvedValueOnce({ data: { items: [{ id: '1' }, { id: '2' }] } });
  expect((await getTransactions(request('&format=csv'))).status).toBe(422);
  const response = await getInventory(request('&limit=1&page=2'));
  expect(await response.json()).toEqual({ items: [{ id: '1' }], has_more: true });
  expect(mocks.rpc.mock.calls[1][1]).toEqual(expect.objectContaining({ p_limit: 2, p_offset: 1 }));
 });
});
