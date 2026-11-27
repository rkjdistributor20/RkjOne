import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createClient: vi.fn(), getProfile: vi.fn(), rpc: vi.fn(),
 access: vi.fn(), device: vi.fn(), from: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ trusted: true }) }));
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
const CAPTURE = '00000000-0000-0000-0000-000000000002';
const CAPTURED_AT = '2026-11-27T07:00:00.000Z';
const ITEM = '00000000-0000-0000-0000-000000000003';
const ITEMS = [{ stock_item_id: ITEM, item_code: 'ST-BUTTER', counted_quantity: 10, unit: 'GRAM' }];

function query(data: unknown) {
 const result = { data, error: null };
 return {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue(result), upsert: vi.fn().mockResolvedValue(result),
  then: (accept: (value: typeof result) => void) => Promise.resolve(result).then(accept),
 };
}

function request(payload: Record<string, unknown> = {}) {
 return new Request('http://localhost/api/pos/stock-sop', {
  method: 'POST',
  body: JSON.stringify({
   branch_id: LOCATION.branch_id, shift_id: ACTIVE_SHIFT, action: 'stock_check',
   check_type: 'MID_SHIFT', items: ITEMS, capture_id: CAPTURE, ...payload,
  }),
 });
}

beforeEach(() => {
 vi.resetAllMocks();
 mocks.getProfile.mockResolvedValue({ role: 'STAFF', organization_id: LOCATION.organization_id, id: 'synthetic-staff' });
 mocks.createClient.mockResolvedValue({ from: mocks.from });
 mocks.device.mockResolvedValue({ id: 'synthetic-tablet', enrollmentGeneration: 3 });
 mocks.rpc.mockResolvedValue({ data: {
  count_id: 'new-count', status: 'PENDING', captured_at: CAPTURED_AT, capture_shift_id: ACTIVE_SHIFT, shift_check_recorded: true,
 }, error: null });
 const tables = {
  inventory_locations: query(LOCATION),
  pos_shift_stock_check_logs: query(null),
  pos_shifts: query({ id: ACTIVE_SHIFT }),
  stock_items: query([{ id: ITEM, item_code: 'ST-BUTTER', name: 'Butter', base_unit: 'GRAM' }]),
  inventory_balances: query([{ stock_item_id: ITEM, quantity: 10, unit: 'GRAM' }]),
 };
 mocks.from.mockImplementation((table: keyof typeof tables) => {
  if (!(table in tables)) throw new Error(`Unexpected database table: ${table}`);
  return tables[table];
 });
});

describe('POS staff count review', () => {
 it('captures server-side for the resolved branch location, not supplied time or shift', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: CAPTURE, captured_at: CAPTURED_AT }, error: null });
  const response = await POST(request({ action: 'capture_stock_count', stock_item_ids: [ITEM, ITEM], captured_at: 'forged' }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ capture: { id: CAPTURE, captured_at: CAPTURED_AT } });
  expect(mocks.device).toHaveBeenCalledWith(expect.anything(), LOCATION.branch_id);
  expect(mocks.access).toHaveBeenCalledWith(expect.anything(), expect.anything(), LOCATION.branch_id);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'capture_pos_stock_count', {
   p_location_id: LOCATION.id, p_stock_item_ids: [ITEM],
  });
 });

 it('keeps staff pending without invoking the approval RPC and records the trusted shift check', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   result: { count_id: 'new-count', requires_manager_approval: true, ai_variance_items: [] },
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith({ trusted: true }, 'record_verified_pos_staff_stock_check', {
   p_actor: 'synthetic-staff', p_device: 'synthetic-tablet', p_generation: 3, p_branch: LOCATION.branch_id,
   p_location: LOCATION.id, p_items: ITEMS, p_count_notes: 'POS_MID_SHIFT', p_recount: null, p_capture: CAPTURE,
   p_check_type: 'MID_SHIFT', p_production_date: null, p_shift_notes: null,
  });
  expect(mocks.from).not.toHaveBeenCalledWith('pos_shift_stock_check_logs');
 });

 it('links a recount without rewriting the original shift stock check', async () => {
  const response = await POST(request({ recount_of: REJECTED }));
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith({ trusted: true }, 'record_verified_pos_staff_stock_check',
   expect.objectContaining({ p_location: LOCATION.id, p_items: ITEMS, p_count_notes: expect.stringMatching(/^POS_RECOUNT/),
    p_recount: REJECTED, p_capture: CAPTURE }));
  expect(mocks.from('pos_shift_stock_check_logs').upsert).not.toHaveBeenCalled();
 });

 it('accepts an offline count for correction without querying shift, receipts, or current estimates', async () => {
  mocks.rpc.mockResolvedValue({ data: { count_id: 'stale-count', status: 'REJECTED', correction_required: true }, error: null });
  const response = await POST(request({ check_type: 'OPENING', shift_id: null, capture_id: null, counted_at: CAPTURED_AT }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   result: { correction_required: true, approval_status: 'RECOUNT_REQUIRED', requires_manager_approval: false },
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith({ trusted: true }, 'record_verified_pos_staff_stock_check',
   expect.objectContaining({ p_location: LOCATION.id, p_items: ITEMS, p_count_notes: 'POS_OPENING',
    p_recount: null, p_capture: null }));
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('inventory_locations');
 });

 it('keeps a valid delayed count off a newer shift', async () => {
  mocks.rpc.mockResolvedValue({ data: {
   count_id: 'old-shift-count', status: 'PENDING', captured_at: CAPTURED_AT, capture_shift_id: 'old-shift',
  }, error: null });
  const response = await POST(request({ shift_id: ACTIVE_SHIFT }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   result: { shift_check_recorded: false, approval_status: 'PENDING_AM_OM' },
  });
  expect(mocks.from).not.toHaveBeenCalledWith('pos_shift_stock_check_logs');
 });

 it('maps a reused snapshot to conflict without resubmitting or updating any shift', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'Versi kiraan ini sudah dihantar.' } });
  expect((await POST(request())).status).toBe(409);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('inventory_locations');
 });
});
