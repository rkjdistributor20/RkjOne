import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.profile }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/supabase/inventory-rpc', () => ({ inventoryRpc: mocks.rpc }));
vi.mock('@/lib/inventory/transfer-http', () => import('../../../../lib/inventory/transfer-http'));

import { GET, POST } from './route';
import { POST as dispatch } from './[id]/dispatch/route';
import { POST as complete } from './[id]/complete/route';
import { POST as cancel } from './[id]/cancel/route';
import { POST as reverse } from './[id]/reverse/route';

const from = '10000000-0000-4000-8000-000000000001';
const to = '10000000-0000-4000-8000-000000000002';
const requestId = '10000000-0000-4000-8000-000000000003';
const item = { stock_item_id: '10000000-0000-4000-8000-000000000004', quantity: 2 };
const body = { from_location_id: from, to_location_id: to, items: [item] };
const url = 'https://local.test/api/inventory/transfers';
const context = { params: Promise.resolve({ id: from }) };

function post(payload: unknown, key?: string) {
 return new Request(url, {
  method: 'POST',
  body: JSON.stringify(payload),
  headers: key ? { 'Idempotency-Key': key } : {},
 });
}

describe('transfer handlers', () => {
 beforeEach(() => {
  mocks.profile.mockReset().mockResolvedValue({ role: 'AREA_MANAGER' });
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
 });

 it('requires an active session before querying transfer data', async () => {
  mocks.profile.mockResolvedValue(null);
  expect((await GET(new Request(url))).status).toBe(401);
  expect((await POST(post(body, requestId))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('delegates scoped lists and destination options to dedicated DB functions', async () => {
  expect((await GET(new Request(url + '?location_id=' + from))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'list_stock_transfers', { p_location_id: from });
  expect((await GET(new Request(url + '?options=kiosk'))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'stock_transfer_kiosk_options', {});
  expect((await GET(new Request(url + '?location_id=bad'))).status).toBe(400);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
 });

 it('rejects invalid submissions before calling the DB', async () => {
  expect((await POST(post(body))).status).toBe(400);
  expect((await POST(post({ ...body, items: [] }, requestId))).status).toBe(400);
  expect((await POST(post({ ...body, items: [{ ...item, quantity: -1 }] }, requestId))).status).toBe(400);
  expect((await POST(post({ ...body, to_location_id: from }, requestId))).status).toBe(400);
  expect((await POST(new Request(url, { method: 'POST', body: '{', headers: { 'Idempotency-Key': requestId } }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('provides the caller key and returns a conflict on payload mismatch', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { transfer_id: from }, error: null });
  expect(await (await POST(post(body, requestId))).json()).toEqual({ result: { transfer_id: from } });
  expect(mocks.rpc).toHaveBeenCalledWith({}, 'create_stock_transfer', expect.objectContaining({
   p_request_id: requestId, p_from_location_id: from, p_to_location_id: to, p_items: [expect.objectContaining(item)],
  }));
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'conflict' } });
  expect((await POST(post(body, requestId))).status).toBe(409);
 });

 it('maps dispatch, receipt and reasoned cancellation to distinct scoped actions', async () => {
  expect((await dispatch(post(null), context)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'dispatch_stock_transfer', { p_transfer_id: from });
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
  expect((await complete(new Request(url, { method: 'POST' }), context)).status).toBe(403);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'complete_stock_transfer', { p_transfer_id: from });
  expect((await cancel(post({ reason: '  ' }), context)).status).toBe(400);
  expect((await cancel(post({ reason: '  Salah item ' }), context)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'cancel_stock_transfer', { p_transfer_id: from, p_reason: 'Salah item' });
 });

 it('forwards explicit receipt quantities, version, key and close intent without defaulting missing data to full receipt', async () => {
  const receipt = { receipt_version: 2, items: [{ item_id: item.stock_item_id, quantity: 1.25 }], finalize: false, reason: '  Baki esok ' };
  expect((await complete(post(receipt, requestId), context)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'receive_stock_transfer', {
   p_transfer_id: from, p_request_id: requestId, p_receipt_version: 2,
   p_items: receipt.items, p_finalize: false, p_reason: 'Baki esok',
  });
  expect((await complete(post(receipt), context)).status).toBe(400);
  expect((await complete(post(null, requestId), context)).status).toBe(400);
  expect((await complete(post({ ...receipt, receipt_version: -1 }, requestId), context)).status).toBe(400);
  expect((await complete(post({ ...receipt, items: [...receipt.items, ...receipt.items] }, requestId), context)).status).toBe(400);
  expect((await complete(post({ ...receipt, items: [{ ...receipt.items[0], quantity: 1.23456 }] }, requestId), context)).status).toBe(400);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'Muat semula' } });
  expect((await complete(post(receipt, requestId), context)).status).toBe(409);
 });

 it('requires a reversal reason, then delegates all reversal authorization to the DB', async () => {
  expect((await reverse(post({ reason: ' ' }), context)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
  expect((await reverse(post({ reason: '  Pulang stok ' }), context)).status).toBe(403);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'reverse_stock_transfer', { p_transfer_id: from, p_reason: 'Pulang stok' });
 });
});
