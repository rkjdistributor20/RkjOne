import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertAreaManagerScheduledForPos: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 callRpc: vi.fn(),
 createClient: vi.fn(),
 getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/access', () => ({
 assertActivePosShiftMember: mocks.assertActivePosShiftMember,
 assertAreaManagerScheduledForPos: mocks.assertAreaManagerScheduledForPos,
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
}));
vi.mock('@/lib/pos/device-auth', () => ({
 assertOfficialPosDevice: mocks.assertOfficialPosDevice,
}));
vi.mock('@/lib/supabase/rpc', () => ({ callRpc: mocks.callRpc }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ trusted: true }) }));

import { POST } from './route';

const PROFILE = {
 id: 'actor-1',
 organization_id: 'org-1',
 role: 'STAFF',
 region_id: null,
 branch_id: 'branch-1',
};

function sale(overrides: Record<string, unknown> = {}) {
 return {
  offlineId: 'offline-20261123-0001',
  actorId: PROFILE.id,
  deviceId: 'device-1',
  enrollmentGeneration: 7,
  branchId: 'branch-1',
  shiftId: 'shift-1',
  items: [{ product_id: 'product-1', quantity: 1 }],
  payment_method: 'CASH',
  cash_amount: 10,
  qr_amount: 0,
  discount: 0,
  created_at: '2026-11-23T00:00:00.000Z',
  ...overrides,
 };
}

function invoke(sales: unknown[]) {
 return POST(new Request('http://localhost/api/pos/sync', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sales }),
 }));
}

describe('POST /api/pos/sync offline sale boundary', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.createClient.mockResolvedValue({});
  mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
  mocks.assertAreaManagerScheduledForPos.mockResolvedValue(undefined);
  mocks.assertActivePosShiftMember.mockResolvedValue({ id: 'member-1' });
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: 'device-1',
   enrollmentGeneration: 7,
  });
  mocks.callRpc.mockResolvedValue({ data: {}, error: null });
 });

 it.each([
  ['QR', 0, 10],
  ['MIXED', 5, 5],
  ['CASH', 10, 1],
 ])('rejects offline %s/provider money before any sale RPC', async (
  paymentMethod,
  cashAmount,
  qrAmount,
 ) => {
  const response = await invoke([sale({
   payment_method: paymentMethod,
   cash_amount: cashAmount,
   qr_amount: qrAmount,
  })]);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   synced: [],
   failed: [{ offlineId: 'offline-20261123-0001' }],
  });
  expect(mocks.callRpc).not.toHaveBeenCalled();
  expect(mocks.assertOfficialPosDevice).not.toHaveBeenCalled();
 });

 it('rejects a queue entry created by another logged-in actor', async () => {
  const response = await invoke([sale({ actorId: 'actor-2' })]);

  expect(await response.json()).toMatchObject({
   synced: [],
   failed: [{ offlineId: 'offline-20261123-0001' }],
  });
  expect(mocks.callRpc).not.toHaveBeenCalled();
 });

 it.each([
  [{ deviceId: 'device-2' }],
  [{ enrollmentGeneration: 6 }],
 ])('rejects a stale or foreign tablet binding', async (override) => {
  const response = await invoke([sale(override)]);

  expect(await response.json()).toMatchObject({
   synced: [],
   failed: [{ offlineId: 'offline-20261123-0001' }],
  });
  expect(mocks.callRpc).not.toHaveBeenCalled();
 });

 it('rejects a cashier who is no longer active in the queued shift', async () => {
  mocks.assertActivePosShiftMember.mockRejectedValueOnce(
   new Error('Keahlian syif aktif diperlukan'),
  );

  const response = await invoke([sale()]);

  expect(await response.json()).toMatchObject({
   synced: [],
   failed: [{
    offlineId: 'offline-20261123-0001',
    error: 'Keahlian syif aktif diperlukan',
   }],
  });
  expect(mocks.callRpc).not.toHaveBeenCalled();
 });

 it('syncs a cash-only queue entry bound to the current actor, tablet and shift', async () => {
  const response = await invoke([sale()]);

  expect(await response.json()).toEqual({
   synced: ['offline-20261123-0001'],
   failed: [],
  });
  expect(mocks.assertActivePosShiftMember).toHaveBeenCalledWith(
   {},
   PROFILE,
   'shift-1',
   'branch-1',
  );
  expect(mocks.callRpc).toHaveBeenCalledWith({ trusted: true }, 'process_registered_pos_cash_sale', {
   p_actor_id: PROFILE.id,
   p_device_id: 'device-1',
   p_enrollment_generation: 7,
   p_shift_id: 'shift-1',
   p_branch_id: 'branch-1',
   p_sale: {
    items: [{ product_id: 'product-1', quantity: 1 }],
    payment_method: 'CASH', cash_amount: 10, qr_amount: 0, discount: 0,
    offline_id: 'offline-20261123-0001',
   },
  });
 });

 it('caches branch, device and shift checks within one bound batch', async () => {
  const response = await invoke([
   sale(),
   sale({ offlineId: 'offline-20261123-0002' }),
  ]);

  expect(await response.json()).toEqual({
   synced: ['offline-20261123-0001', 'offline-20261123-0002'],
   failed: [],
  });
  expect(mocks.assertCanAccessPosBranch).toHaveBeenCalledTimes(1);
  expect(mocks.assertOfficialPosDevice).toHaveBeenCalledTimes(1);
  expect(mocks.assertActivePosShiftMember).toHaveBeenCalledTimes(1);
  expect(mocks.callRpc).toHaveBeenCalledTimes(2);
 });
});
