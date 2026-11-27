import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createClient: vi.fn(), getProfile: vi.fn(), rpc: vi.fn(),
 access: vi.fn(), device: vi.fn(), from: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.getProfile }));
vi.mock('@/lib/supabase/inventory-rpc', () => ({ inventoryRpc: mocks.rpc }));
vi.mock('@/lib/pos/access', () => ({ assertCanAccessPosBranch: mocks.access, posAccessErrorStatus: () => 400 }));
vi.mock('@/lib/pos/device-auth', () => ({ assertOfficialPosDevice: mocks.device }));
vi.mock('@/lib/stock/catalog', () => ({ RKJ_MANUFACTURING_OWN_PRODUCT_CODES: [] }));
vi.mock('@/lib/inventory/stock-guard', () => ({ isStockRecordId: (value: unknown) => typeof value === 'string' && value.length === 36 }));

import { POST } from './route';

const LOCATION = { id: 'location-fixture', branch_id: 'branch', organization_id: 'org', name: 'Test location' };
const REJECTED = '00000000-0000-0000-0000-000000000001';
const ACTIVE_SHIFT = 'synthetic-shift';
const ITEMS = [{ stock_item_id: 'item', item_code: 'ST-BUTTER', counted_quantity: 10, unit: 'GRAM' }];

function query(data: unknown) {
 const result = { data, error: null };
 return {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue(result), upsert: vi.fn().mockResolvedValue(result),
  then: (accept: (value: typeof result) => void) => Promise.resolve(result).then(accept),
 };
}

function request(recountOf?: string) {
 return new Request('http://localhost/api/pos/stock-sop', {
  method: 'POST',
  body: JSON.stringify({
   branch_id: LOCATION.branch_id, shift_id: ACTIVE_SHIFT, action: 'stock_check',
   check_type: 'MID_SHIFT', items: ITEMS, recount_of: recountOf,
  }),
 });
}

beforeEach(() => {
 vi.resetAllMocks();
 mocks.getProfile.mockResolvedValue({ role: 'STAFF', organization_id: LOCATION.organization_id, id: 'synthetic-staff' });
 mocks.createClient.mockResolvedValue({ from: mocks.from });
 mocks.rpc.mockResolvedValue({ data: { count_id: 'new-count' }, error: null });
 const tables = {
  inventory_locations: query(LOCATION),
  pos_shift_stock_check_logs: query(null),
  pos_shifts: query({ id: ACTIVE_SHIFT }),
  stock_items: query([{ id: 'item', item_code: 'ST-BUTTER', name: 'Butter', base_unit: 'GRAM' }]),
  inventory_balances: query([{ stock_item_id: 'item', quantity: 10, unit: 'GRAM' }]),
 };
 mocks.from.mockImplementation((table: keyof typeof tables) => {
  if (!(table in tables)) throw new Error(`Unexpected database table: ${table}`);
  return tables[table];
 });
});

describe('POS staff count review', () => {
 it('keeps an exact AI match pending without invoking the approval RPC', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   result: { count_id: 'new-count', requires_manager_approval: true, ai_variance_items: [] },
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'submit_stock_count', {
   p_location_id: LOCATION.id, p_items: ITEMS, p_notes: expect.stringContaining('Beza AI: tiada'),
  });
  expect(mocks.from('pos_shift_stock_check_logs').upsert).toHaveBeenCalledOnce();
 });

 it('links a recount without rewriting the original shift stock check', async () => {
  const response = await POST(request(REJECTED));
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'submit_stock_count', {
   p_location_id: LOCATION.id, p_items: ITEMS, p_notes: expect.stringMatching(/^POS_RECOUNT/), p_recount_of: REJECTED,
  });
  expect(mocks.from('pos_shift_stock_check_logs').upsert).not.toHaveBeenCalled();
 });
});
