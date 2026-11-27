import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationsReportUrl } from '@/lib/reports/operations-api';
import type { OperationsReportParams, OperationsReportPayload } from '@/lib/reports/operations-types';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
 profile: vi.fn(),
 client: vi.fn(),
 rpc: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.profile }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));

const branchId = '00000000-0000-0000-0000-0000000000a1';
const amId = '00000000-0000-0000-0000-0000000000a2';
const staffId = '00000000-0000-0000-0000-0000000000a3';
const shiftId = '00000000-0000-0000-0000-0000000000a4';
const transactionId = '00000000-0000-0000-0000-0000000000a5';
const request = (query = '') =>
 new Request(`http://localhost/api/reports/operations?from=2026-11-27&to=2026-11-28${query}`);

const totals = {
 recorded_sales: 102.5, net_sales: 100, cash: 60, qr: 40, other: 0, confirmed: 100,
 sales_count: 6, shift_count: 2, review_count: 3,
};

function report(overrides: Partial<OperationsReportPayload> = {}): OperationsReportPayload {
 return {
  generated_at: '2026-11-27T16:10:00Z',
  total_rows: 0,
  rows: [],
  totals,
  filters: {
   branches: [{ id: branchId, name: '=Branch, "A"', code: 'BR001' }],
   managers: [{ id: amId, name: 'Manager A' }],
   staff: [{ id: staffId, name: 'Cashier A' }],
   shifts: [{ id: shiftId, number: 'S-1', branch_id: branchId }],
  },
  data_state: 'available_records',
  settlement: { status: 'not_recorded', amount: null },
  ...overrides,
 };
}

function csvRows(body: string) {
 return body.replace(/^\uFEFF/, '').trimEnd().split('\r\n').map((line) =>
  line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) =>
   cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell));
}

beforeEach(() => {
 vi.resetAllMocks();
 mocks.profile.mockResolvedValue({ id: amId, role: 'AREA_MANAGER', organization_id: 'user-org' });
 mocks.client.mockResolvedValue({ rpc: mocks.rpc });
 mocks.rpc.mockResolvedValue({ data: report() });
});

describe('operations report auth and scope', () => {
 it('rejects anonymous and ineligible roles before creating a report client', async () => {
  mocks.profile.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'STAFF' })
   .mockResolvedValueOnce({ role: 'FINANCE' });
  const anonymous = await GET(request('&format=csv'));
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers.get('cache-control')).toBe('private, no-store');
  expect((await GET(request('&view=receipt'))).status).toBe(403);
  expect((await GET(request())).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
 });

 it.each(['SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER'])('passes %s reads to the user client without client-supplied organization or role', async (role) => {
  mocks.profile.mockResolvedValue({ role, organization_id: 'user-org' });
  expect((await GET(request('&organization_id=attacker-org&role=SUPER_ADMIN'))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('read_operational_report', {
   p_view: 'summary', p_from: '2026-11-27', p_to: '2026-11-28', p_branch_id: null,
   p_am_id: null, p_staff_id: null, p_shift_id: null, p_transaction_id: null,
   p_data: 'operational', p_limit: 50, p_offset: 0,
  });
 });

 it.each(['summary', 'daily', 'shifts', 'actions', 'transactions', 'receipt'])(
  'lets SQL deny a revoked/out-of-scope %s read in JSON and CSV', async (view) => {
   mocks.rpc.mockResolvedValue({ error: { code: '42501', message: 'private SQL details' } });
   const query = `&view=${view}&branch_id=${branchId}&transaction_id=${transactionId}`;
   const json = await GET(request(query));
   const csv = await GET(request(query + '&format=csv'));
   expect(json.status).toBe(403);
   expect(csv.status).toBe(403);
   expect(csv.headers.get('content-type')).not.toContain('text/csv');
   expect(csv.headers.get('cache-control')).toBe('private, no-store');
   expect(await json.text()).not.toContain('private SQL details');
   expect(mocks.rpc).toHaveBeenCalledTimes(2);
  },
 );

 it('returns 404 for an absent or invisible receipt, but accepts a scoped receipt-only result', async () => {
  const query = `&view=receipt&transaction_id=${transactionId}`;
  mocks.rpc.mockResolvedValueOnce({ data: report({ receipt: null }) });
  expect((await GET(request(query))).status).toBe(404);
  expect(mocks.rpc).toHaveBeenLastCalledWith('read_operational_report', expect.objectContaining({
   p_transaction_id: transactionId, p_limit: 1, p_offset: 0,
  }));

  const receipt = {
   transaction_id: transactionId, transaction_number: 'T001',
   items: [{ sku: 'SKU01', name: '+Pastry', quantity: 2, unit_price: 3, line_total: 6 }],
  };
  mocks.rpc.mockResolvedValue({ data: report({ receipt, total_rows: 1 }) });
  expect(await (await GET(request(query))).json()).toMatchObject({ receipt, has_more: false });
  const [columns, ...rows] = csvRows(await (await GET(request(query + '&format=csv'))).text());
  expect(rows.find((row) => row[0] === 'Butiran')?.[columns.indexOf('ID transaksi')]).toBe(transactionId);
  expect(rows.find((row) => row[0] === 'Item resit')?.[columns.indexOf('Nama item resit')]).toBe("'+Pastry");
  expect(rows.find((row) => row[0] === 'Item resit')?.[columns.indexOf('Jumlah item (RM)')]).toBe('6');
 });
});

describe('operations report URL and validation', () => {
 it('omits blank optional values but includes all nonblank filters and pagination', () => {
  const args: OperationsReportParams = {
   view: 'actions', from: '2026-11-27', to: '2026-11-28',
   data: 'trial', branchId: '', amId, staffId: null, shiftId: ' ', transactionId,
   caseType: 'payment_review', page: 2, limit: 1, format: 'csv',
  };
  const url = new URL(operationsReportUrl(args), 'http://localhost');
  expect(url.pathname).toBe('/api/reports/operations');
  expect(Object.fromEntries(url.searchParams)).toEqual({
   view: 'actions', from: args.from, to: args.to, data: 'trial', am_id: amId, transaction_id: transactionId,
   case_type: 'payment_review', page: '2', limit: '1', format: 'csv',
  });
 });

 it.each([
  'from=2026-02-30&to=2026-03-01',
  'from=2026-11-28&to=2026-11-27',
  'from=2025-01-01&to=2026-11-28',
  'view=inventory', 'view=receipt', 'data=testing', 'format=xml',
  'branch_id=', 'am_id=not-a-uuid', 'staff_id=not-a-uuid', 'shift_id=not-a-uuid', 'transaction_id=not-a-uuid',
  `branch_id=${branchId}&branch_id=${branchId}`,
  'page=0', 'page=5001', 'page=1.5', 'limit=201', 'limit=1e2',
  'view=actions&case_type=', 'view=actions&case_type=x%3By', 'view=summary&case_type=payment_review',
 ])('returns 400 without reading for %s', async (query) => {
  expect((await GET(new Request(`http://localhost/api/reports/operations?${query}`))).status).toBe(400);
  expect(mocks.client).not.toHaveBeenCalled();
 });

 it('lets SQL validate otherwise well-formed filters and hides SQL error details', async () => {
  mocks.rpc.mockResolvedValue({ error: { code: '22023', message: 'DB filter details' } });
  const response = await GET(request('&view=actions&case_type=unsupported_case'));
  expect(mocks.rpc).toHaveBeenCalledWith('read_operational_report', expect.objectContaining({
   p_case_type: 'unsupported_case',
  }));
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain('DB filter details');
 });
});

describe('operations report pagination and full export', () => {
 it('reuses the exact RPC filters and exports the matching cases without unrelated sales totals', async () => {
  const firstRow = {
   branch_name: '=Branch, "A"', branch_id: branchId, manager_names: ['Manager A'],
   cashier_name: '\u200b＠stored', cashier_id: staffId, shift_id: shiftId,
   case_type: 'payment_review', case_at: '2026-11-27T16:01:00Z', reference: ' +possible formula',
   transaction_id: transactionId, net_sales: 3, cash_variance: -5, counted_cash: null, other: 0,
  };
  const secondRow = { ...firstRow, reference: 'second result', cash_variance: null };
  const full = report({ total_rows: 2, rows: [firstRow, secondRow] });
  mocks.rpc.mockResolvedValueOnce({ data: { ...full, rows: [firstRow] } })
   .mockResolvedValueOnce({ data: { ...full, rows: [secondRow] } })
   .mockResolvedValueOnce({ data: full });
  const query = `&view=actions&branch_id=${branchId.toUpperCase()}&am_id=${amId}&staff_id=${staffId}`
   + `&shift_id=${shiftId}&transaction_id=${transactionId}&data=trial&case_type=payment_review&limit=1`;

  const first = await GET(request(query));
  expect(await first.json()).toEqual({ ...full, rows: [firstRow], page: 1, limit: 1, has_more: true });
  const second = await GET(request(query + '&page=2'));
  expect(await second.json()).toEqual({ ...full, rows: [secondRow], page: 2, limit: 1, has_more: false });
  const exportResponse = await GET(request(query + '&page=2&format=csv'));
  expect(exportResponse.status).toBe(200);
  expect(exportResponse.headers.get('cache-control')).toBe('private, no-store');
  expect(exportResponse.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  expect(exportResponse.headers.get('content-disposition')).toContain('rkj-operations-actions-2026-11-27_2026-11-28.csv');

  const [rpcName, args] = mocks.rpc.mock.calls[0];
  expect(rpcName).toBe('read_operational_report');
  expect(args).toEqual({
   p_view: 'actions', p_from: '2026-11-27', p_to: '2026-11-28', p_branch_id: branchId,
   p_am_id: amId, p_staff_id: staffId, p_shift_id: shiftId, p_transaction_id: transactionId,
   p_data: 'trial', p_case_type: 'payment_review', p_limit: 1, p_offset: 0,
  });
  expect(mocks.rpc.mock.calls[1]).toEqual([rpcName, { ...args, p_offset: 1 }]);
  expect(mocks.rpc.mock.calls[2]).toEqual([rpcName, { ...args, p_limit: 5001 }]);

  const [columns, ...rows] = csvRows(await exportResponse.text());
  expect(rows.every((row) => row.length === columns.length)).toBe(true);
  const metadata = Object.fromEntries(rows.filter((row) => row[0] === 'Metadata').map((row) => [row[1], row[2]]));
  expect(metadata).toEqual(expect.objectContaining({
   'Dari (MYT)': '2026-11-27', 'Hingga (MYT)': '2026-11-28', 'Zon waktu': 'MYT (Asia/Kuala_Lumpur)',
   'Dijana pada (MYT)': '2026-11-28 00:10:00', 'Jenis data': 'trial', 'Bilangan baris': '2',
   'Keadaan data': 'available_records',
   branch_id: branchId, am_id: amId, staff_id: staffId, shift_id: shiftId, transaction_id: transactionId,
   case_type: 'payment_review', 'Cawangan dipilih': `'=Branch, "A"`,
  }));
  const records = rows.filter((row) => row[0] === 'Butiran');
  const total = rows.find((row) => row[0] === 'Jumlah kes');
  expect(records).toHaveLength(2);
  expect(total?.slice(0, 3)).toEqual(['Jumlah kes', 'Kes sepadan dengan penapis aktif', '2']);
  expect(columns).not.toContain('Jualan bersih disahkan (RM)');
  expect(columns).not.toContain('Kutipan disahkan (RM)');
  expect(records[0][columns.indexOf('Perbezaan tunai (RM)')]).toBe('-5');
  expect(records[0][columns.indexOf('Tunai dikira (RM)')]).toBe('');
  expect(records[0][columns.indexOf('Masa kes (MYT)')]).toBe('2026-11-28 00:01:00');
  expect(records[0][columns.indexOf('Juruwang')]).toBe("'\u200b＠stored");
  expect(records[0][columns.indexOf('Rujukan')]).toBe("' +possible formula");
 });

 it('exports canonical unpaginated sales totals for a monetary view', async () => {
  mocks.rpc.mockResolvedValue({ data: report({ total_rows: 1, rows: [{ recorded_sales: 102.5, net_sales: 100 }] }) });
  const [columns, ...rows] = csvRows(await (await GET(request('&view=summary&format=csv'))).text());
  const total = rows.find((row) => row[0] === 'Jumlah keseluruhan');
  expect(total?.slice(columns.indexOf('Jualan bersih direkodkan (RM)'), columns.indexOf('Bilangan kes dalam semakan') + 1))
   .toEqual(['102.5', '100', '60', '40', '0', '100', '6', '2', '3']);
 });

 it('preserves SQL totals and metadata for empty results and for a page past the end', async () => {
  const payload = report({ total_rows: 20 });
  mocks.rpc.mockResolvedValueOnce({ data: payload }).mockResolvedValueOnce({ data: report() });
  const json = await GET(request('&view=daily&page=2&limit=20'));
  expect(await json.json()).toEqual({ ...payload, page: 2, limit: 20, has_more: false });
  const csv = await GET(request('&view=daily&format=csv'));
  expect((await csv.text())).toContain('"Jumlah keseluruhan"');
 });

 it('refuses an oversized or silently capped export instead of serving partial CSV', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: report({ total_rows: 5001 }) })
   .mockResolvedValueOnce({ data: report({ total_rows: 2001, rows: Array.from({ length: 2000 }, () => ({})) }) })
   .mockResolvedValueOnce({ data: report({ total_rows: 1, rows: [{ reference: 'a'.repeat(4 * 1024 * 1024) }] }) });
  const tooMany = await GET(request('&format=csv'));
  expect(tooMany.status).toBe(422);
  expect(tooMany.headers.get('content-disposition')).toBeNull();
  const capped = await GET(request('&format=csv'));
  expect(capped.status).toBe(500);
  expect(capped.headers.get('content-type')).not.toContain('text/csv');
  const tooLarge = await GET(request('&format=csv'));
  expect(tooLarge.status).toBe(422);
  expect(tooLarge.headers.get('content-disposition')).toBeNull();
 });

 it('fails closed when SQL omits the count or totals', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { ...report(), total_rows: undefined } })
   .mockResolvedValueOnce({ data: { ...report(), totals: undefined } });
  expect((await GET(request('&format=csv'))).status).toBe(500);
  expect((await GET(request())).status).toBe(500);
 });
});
