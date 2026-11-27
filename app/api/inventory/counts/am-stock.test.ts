import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 profile: vi.fn(),
 client: vi.fn(),
 scope: vi.fn(),
 from: vi.fn(),
 rpc: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.profile }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/auth/branch-scope', () => ({ resolveScopedBranches: mocks.scope }));
vi.mock('@/lib/brand/legal-entities', () => ({ HQ_DISTRIBUTOR_LABEL: 'HQ' }));
vi.mock('@/lib/inventory/balance-utils', () => ({ padHqStockBalances: vi.fn() }));
vi.mock('@/lib/stock/catalog', () => ({ isHqStockItemCode: vi.fn() }));
vi.mock('@/lib/auth/stock-access', () => import('../../../../lib/auth/stock-access'));
vi.mock('@/lib/inventory/stock-guard', () => import('../../../../lib/inventory/stock-guard'));
vi.mock('@/lib/supabase/inventory-rpc', () => import('../../../../lib/supabase/inventory-rpc'));

import { GET as balances } from '../balances/route';
import { GET as movements } from '../movements/route';
import { POST as receive } from '../receive/route';
import { POST as adjust } from '../adjustments/route';
import { GET as listCounts, PATCH as review } from './route';

const AM = { id: '00000000-0000-0000-0000-000000000001', role: 'AREA_MANAGER', organization_id: 'org' };
const LOC = '00000000-0000-0000-0000-000000000002';
const COUNT = '00000000-0000-0000-0000-000000000003';
const REQUEST_ID = '00000000-0000-4000-a000-000000000004';
const location = { id: LOC, branch_id: 'assigned', location_type: 'BRANCH_KIOSK', organization_id: 'org', is_active: true };
const items = [{ stock_item_id: 'item', quantity: 1, unit: 'PCS' }];

function query(data: unknown) {
 const result = { data, error: null };
 return {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result),
  then: (accept: (value: typeof result) => void) => Promise.resolve(result).then(accept),
 };
}

function request(method: string, body?: object, params = '', id: string | null = REQUEST_ID) {
 return new Request(`http://localhost/api/inventory/test${params}`, {
  method, ...(body && { body: JSON.stringify(body) }), ...(id && { headers: { 'Idempotency-Key': id } }),
 });
}

let locationQuery: ReturnType<typeof query>;
let countsQuery: ReturnType<typeof query>;
let movementsQuery: ReturnType<typeof query>;

beforeEach(() => {
 vi.resetAllMocks();
 locationQuery = query(location);
 countsQuery = query({ location_id: LOC });
 movementsQuery = query([]);
 mocks.profile.mockResolvedValue(AM);
 mocks.client.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
 mocks.from.mockImplementation((table) => ({
  inventory_locations: locationQuery,
  stock_counts: countsQuery,
  stock_movements: movementsQuery,
 }[table as string]));
 mocks.scope.mockResolvedValue({ branchIds: ['assigned'] });
 mocks.rpc.mockResolvedValue({ data: { status: 'APPROVED' }, error: null });
});

describe('AM stock scope', () => {
 it('uses the external receipt contract with source and document reference', async () => {
  expect((await receive(request('POST', {
   location_id: LOC, items, source: 'Supplier fixture', document_reference: 'INV-17', branch_id: 'ignored',
  }))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('post_am_stock_operation', {
   p_location_id: LOC, p_request_id: REQUEST_ID, p_action: 'RECEIVE',
   p_payload: { source: 'Supplier fixture', document_reference: 'INV-17', items, notes: null },
  });
 });

 it('rejects AM direct postings without a replay key before touching the ledger', async () => {
  expect((await receive(request('POST', { location_id: LOC, items, source: 'Supplier' }, '', null))).status).toBe(400);
  expect((await adjust(request('POST', { location_id: LOC, items, reason: 'Correction' }, '', null))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('denies forged location choices on posting and reads', async () => {
  locationQuery.maybeSingle.mockResolvedValue({ data: { ...location, branch_id: 'other' }, error: null });
  expect((await receive(request('POST', { location_id: LOC, items, source: 'Fixture', branch_id: 'assigned' }))).status).toBe(403);
  expect((await adjust(request('POST', { location_id: LOC, items, reason: 'Fixture' }))).status).toBe(403);
  expect((await balances(request('GET', undefined, `?location_id=${LOC}`))).status).toBe(403);
  expect((await movements(request('GET', undefined, `?location_id=${LOC}`))).status).toBe(403);
  expect((await listCounts(request('GET', undefined, `?location_id=${LOC}`))).status).toBe(403);
  expect((await review(request('PATCH', { count_id: COUNT, action: 'APPROVE' }))).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalledWith('stock_movements');
 });

 it('denies non-kiosk, inactive and foreign-tenant receipt records', async () => {
  for (const row of [{ ...location, location_type: 'HQ_WAREHOUSE' }, { ...location, is_active: false },
   { ...location, organization_id: 'other' }]) {
   locationQuery.maybeSingle.mockResolvedValue({ data: row, error: null });
   expect((await receive(request('POST', { location_id: LOC, items, source: 'Fixture' }))).status).toBe(403);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('returns a conflict when the adjustment balance changed after the form loaded', async () => {
  const change = [{ stock_item_id: 'item', quantity_after: 9, expected_quantity: 10 }];
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Baki telah berubah', code: '40001' } });
  const response = await adjust(request('POST', { location_id: LOC, items: change, reason: 'Fixture reason' }));
  expect(response.status).toBe(409);
  expect(mocks.rpc).toHaveBeenCalledWith('post_am_stock_operation', {
   p_location_id: LOC, p_request_id: REQUEST_ID, p_action: 'ADJUSTMENT',
   p_payload: { reason: 'Fixture reason', items: change },
  });
 });

 it('requires a rejection reason and derives authorization from the stored count location', async () => {
  expect((await review(request('PATCH', { count_id: COUNT, action: 'REJECT', reason: '  ' }))).status).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled();
  expect((await review(request('PATCH', {
   count_id: COUNT, action: 'REJECT', reason: '  Kira semula  ', location_id: 'ignored',
  }))).status).toBe(200);
  expect(countsQuery.eq).toHaveBeenCalledWith('organization_id', AM.organization_id);
  expect(locationQuery.eq).toHaveBeenCalledWith('id', LOC);
  expect(mocks.rpc).toHaveBeenCalledWith('review_stock_count', {
   p_count_id: COUNT, p_action: 'REJECT', p_reason: 'Kira semula',
  });
 });

 it('does not let a staff session act on the AM review endpoint', async () => {
  mocks.profile.mockResolvedValue({ ...AM, role: 'STAFF' });
  expect((await review(request('PATCH', { count_id: COUNT, action: 'APPROVE' }))).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
 });

 it('reports a stale count as a conflict and leaves rejection/recount explicit', async () => {
  const error = 'Snapshot kiraan lapuk. Tolak dan minta staf kira semula.';
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: error } });
  const response = await review(request('PATCH', { count_id: COUNT, action: 'APPROVE' }));
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({ error });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('review_stock_count', {
   p_count_id: COUNT, p_action: 'APPROVE', p_reason: null,
  });
 });

 it('filters movement types and whole MYT days before imposing the row limit', async () => {
  const response = await movements(request('GET', undefined,
   `?location_id=${LOC}&kind=transfer&from=2026-11-27&to=2026-11-27`));
  expect(response.status).toBe(200);
  expect(movementsQuery.in).toHaveBeenCalledWith('movement_type', ['TRANSFER_IN', 'TRANSFER_OUT']);
  expect(movementsQuery.gte).toHaveBeenCalledWith('created_at', '2026-11-26T16:00:00.000Z');
  expect(movementsQuery.lt).toHaveBeenCalledWith('created_at', '2026-11-27T16:00:00.000Z');
  expect((await movements(request('GET', undefined, `?location_id=${LOC}&from=2026-02-31`))).status).toBe(400);
 });
});
