import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 reconcileFiuuOpaPayment: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/pos/fiuu-opa-reconciliation', () => ({
 reconcileFiuuOpaPayment: mocks.reconcileFiuuOpaPayment,
}));

import { POST } from './route';

const ORIGINAL_ENV = { ...process.env };
const SECRET = 'a-secure-worker-secret-with-32-characters';

function request(token = SECRET) {
 return new Request('http://localhost/api/internal/pos/fiuu-opa/reconcile', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
 });
}

function queue(rows: Array<Record<string, unknown>>) {
 const query = {
  select: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  limit: vi.fn().mockResolvedValue({
   data: rows,
   error: null,
  }),
 };
 query.select.mockReturnValue(query);
 query.eq.mockReturnValue(query);
 query.or.mockReturnValue(query);
 query.order.mockReturnValue(query);
 return query;
}

function arrangeQueues(input: {
 pendingIds: string[];
 reported?: Array<{ id: string; gateway_ref: string | null; amount_rm: number }>;
}) {
 const reportedQuery = queue(input.reported ?? []);
 const pendingQuery = queue(input.pendingIds.map((id) => ({ id })));
	const updateQuery = {
		update: vi.fn(),
		eq: vi.fn(),
		error: null,
	};
	updateQuery.update.mockReturnValue(updateQuery);
	updateQuery.eq.mockReturnValue(updateQuery);
 const service = {
  from: vi.fn()
   .mockReturnValueOnce(reportedQuery)
			.mockReturnValueOnce(pendingQuery)
			.mockReturnValue(updateQuery),
  rpc: vi.fn().mockResolvedValue({ data: { status: 'PAID' }, error: null }),
 };
 mocks.createAdminClient.mockReturnValue(service);
	return { pendingQuery, reportedQuery, service, updateQuery };
}

beforeEach(() => {
 vi.clearAllMocks();
 process.env = {
  ...ORIGINAL_ENV,
  FIUU_RECONCILIATION_ENABLED: 'true',
  FIUU_RECONCILIATION_SECRET: SECRET,
 };
 mocks.reconcileFiuuOpaPayment.mockResolvedValue('terminal');
});

afterEach(() => {
 vi.useRealTimers();
 process.env = { ...ORIGINAL_ENV };
});

describe('BR001 Fiuu OPA reconciliation worker', () => {
 it('is fail-closed until the dedicated worker flag is enabled', async () => {
  delete process.env.FIUU_RECONCILIATION_ENABLED;

  const response = await POST(request());

  expect(response.status).toBe(503);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('requires a configured long server secret', async () => {
  delete process.env.FIUU_RECONCILIATION_SECRET;

  const response = await POST(request());

  expect(response.status).toBe(503);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('rejects an invalid bearer token before opening the service client', async () => {
  const response = await POST(request('wrong-token'));

  expect(response.status).toBe(401);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('processes only the bounded BR001 due-payment queue', async () => {
  const ids = ['11111111-1111-4111-8111-111111111111'];
  const { pendingQuery, service } = arrangeQueues({ pendingIds: ids });

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   branch: 'BR001',
   examined: 1,
   results: { terminal: 1 },
  });
  expect(pendingQuery.eq).toHaveBeenCalledWith('sale_payload->>fiuu_branch_code', 'BR001');
  expect(pendingQuery.limit).toHaveBeenCalledWith(1);
  expect(mocks.reconcileFiuuOpaPayment).toHaveBeenNthCalledWith(1, {
   service,
   paymentId: ids[0],
  });
  expect(mocks.reconcileFiuuOpaPayment).toHaveBeenCalledTimes(1);
 });

 it('runs exactly six pending inquiries at ten-second intervals', async () => {
  vi.useFakeTimers();
  const ids = ['11111111-1111-4111-8111-111111111111'];
  arrangeQueues({ pendingIds: ids });
  mocks.reconcileFiuuOpaPayment.mockResolvedValue('pending');

  const responsePromise = POST(request());
  await vi.advanceTimersByTimeAsync(50_000);
  const response = await responsePromise;

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   branch: 'BR001',
   examined: 1,
   results: { pending: 6 },
  });
  expect(mocks.reconcileFiuuOpaPayment).toHaveBeenCalledTimes(6);
 });

 it('retries durable REPORTED fulfillment without blocking a due inquiry', async () => {
  const pendingId = '11111111-1111-4111-8111-111111111111';
  const reportedId = '22222222-2222-4222-8222-222222222222';
  const { service } = arrangeQueues({
   pendingIds: [pendingId],
   reported: [{ id: reportedId, gateway_ref: 'TXN001', amount_rm: 12.5 }],
  });

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   examined: 2,
   results: { terminal: 2 },
  });
  expect(service.rpc).toHaveBeenCalledWith('fulfill_pos_fiuu_payment', {
   p_payment_id: reportedId,
   p_gateway_ref: 'TXN001',
   p_amount: 12.5,
   p_currency: 'MYR',
   p_channel_id: '24',
  });
  expect(mocks.reconcileFiuuOpaPayment).toHaveBeenCalledWith({
   service,
   paymentId: pendingId,
  });
 });

	it('rotates a failed REPORTED fulfillment behind newer work', async () => {
		const reportedId = '22222222-2222-4222-8222-222222222222';
		const { reportedQuery, service, updateQuery } = arrangeQueues({
			pendingIds: [],
			reported: [{ id: reportedId, gateway_ref: 'TXN001', amount_rm: 12.5 }],
		});
		service.rpc.mockResolvedValueOnce({ data: null, error: { message: 'price conflict' } });

		const response = await POST(request());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			examined: 1,
			results: { recorded_unknown: 1 },
		});
		expect(reportedQuery.order).toHaveBeenNthCalledWith(
			1,
			'provider_status_checked_at',
			{ ascending: true, nullsFirst: true },
		);
		expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
			provider_status_checked_at: expect.any(String),
			updated_at: expect.any(String),
		}));
		expect(updateQuery.eq).toHaveBeenCalledWith('id', reportedId);
	});
});
