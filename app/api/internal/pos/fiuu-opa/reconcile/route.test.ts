import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getFiuuOpaConfiguredTargets: vi.fn(),
 reconcileFiuuOpaPayment: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/pos/fiuu-opa-reconciliation', () => ({
 reconcileFiuuOpaPayment: mocks.reconcileFiuuOpaPayment,
}));
vi.mock('@/lib/pos/fiuu-opa-server', () => ({
 getFiuuOpaConfiguredTargets: mocks.getFiuuOpaConfiguredTargets,
}));

import { POST } from './route';

const ORIGINAL_ENV = { ...process.env };
const SECRET = 'a-secure-worker-secret-with-32-characters';
const ORGANIZATION_ID = '66666666-6666-4666-8666-666666666666';
const ORGANIZATION_ID_2 = '77777777-7777-4777-8777-777777777777';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID_36 = '36363636-3636-4636-8636-363636363636';

const BR001_TARGET = {
 organizationId: ORGANIZATION_ID,
 branchId: BRANCH_ID,
 branchCode: 'BR001',
};
const BR036_TARGET = {
 organizationId: ORGANIZATION_ID_2,
 branchId: BRANCH_ID_36,
 branchCode: 'BR036',
};

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
  in: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  limit: vi.fn().mockResolvedValue({
   data: rows,
   error: null,
  }),
 };
 query.select.mockReturnValue(query);
 query.eq.mockReturnValue(query);
 query.in.mockReturnValue(query);
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
 mocks.getFiuuOpaConfiguredTargets.mockReturnValue([BR001_TARGET]);
});

afterEach(() => {
 vi.useRealTimers();
 process.env = { ...ORIGINAL_ENV };
});

describe('Fiuu OPA reconciliation worker', () => {
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

 it('fails closed before opening the service client when no branch is configured', async () => {
  mocks.getFiuuOpaConfiguredTargets.mockReturnValue([]);

  const response = await POST(request());

  expect(response.status).toBe(503);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });

 it('fails closed when the allowlist has a partial or invalid target mapping', async () => {
  mocks.getFiuuOpaConfiguredTargets.mockImplementation(() => {
   throw new Error('Pemetaan Fiuu OPA BR036 tiada');
  });

  const response = await POST(request());

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
   error: 'Fiuu reconciliation branch configuration is invalid',
  });
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
  expect(pendingQuery.in).toHaveBeenCalledWith('organization_id', [ORGANIZATION_ID]);
  expect(pendingQuery.in).toHaveBeenCalledWith('branch_id', [BRANCH_ID]);
  expect(pendingQuery.in).toHaveBeenCalledWith('sale_payload->>fiuu_branch_code', ['BR001']);
  expect(pendingQuery.limit).toHaveBeenCalledWith(1);
  expect(mocks.reconcileFiuuOpaPayment).toHaveBeenNthCalledWith(1, {
   service,
   paymentId: ids[0],
  });
  expect(mocks.reconcileFiuuOpaPayment).toHaveBeenCalledTimes(1);
 });

 it('filters both recovery queues to the explicit configured branch set', async () => {
  mocks.getFiuuOpaConfiguredTargets.mockReturnValue([BR001_TARGET, BR036_TARGET]);
  const { pendingQuery, reportedQuery } = arrangeQueues({ pendingIds: [] });

  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
   ok: true,
   branch: null,
   branches: ['BR001', 'BR036'],
  });
  expect(reportedQuery.in).toHaveBeenCalledWith(
   'organization_id',
   [ORGANIZATION_ID, ORGANIZATION_ID_2],
  );
  expect(reportedQuery.in).toHaveBeenCalledWith('branch_id', [BRANCH_ID, BRANCH_ID_36]);
  expect(reportedQuery.in).toHaveBeenCalledWith(
   'sale_payload->>fiuu_branch_code',
   ['BR001', 'BR036'],
  );
  expect(pendingQuery.in).toHaveBeenCalledWith(
   'organization_id',
   [ORGANIZATION_ID, ORGANIZATION_ID_2],
  );
  expect(pendingQuery.in).toHaveBeenCalledWith('branch_id', [BRANCH_ID, BRANCH_ID_36]);
  expect(pendingQuery.in).toHaveBeenCalledWith(
   'sale_payload->>fiuu_branch_code',
   ['BR001', 'BR036'],
  );
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
