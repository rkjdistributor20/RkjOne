import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { operationsReportCsv } from '@/lib/reports/operations-csv';
import { parseOperationsReportFilters, type ParsedOperationsReportFilters } from '@/lib/reports/operations-filters';
import { OPERATIONS_REPORT_TOTAL_FIELDS, type OperationsReportPayload, type OperationsReportResponse } from '@/lib/reports/operations-types';
import { createClient } from '@/lib/supabase/server';

const noStore = { 'Cache-Control': 'private, no-store' };
const roles = new Set(['SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER']);
const exportLimit = 5000;
const exportByteLimit = 4 * 1024 * 1024;

function json(data: unknown, status = 200) {
 return NextResponse.json(data, { status, headers: noStore });
}

function isObject(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReport(value: unknown): value is OperationsReportPayload {
 if (!isObject(value)) return false;
 const { rows, total_rows, generated_at, totals, filters, receipt, data_state, settlement } = value;
 return Array.isArray(rows) && rows.every(isObject)
  && typeof total_rows === 'number' && Number.isSafeInteger(total_rows) && total_rows >= 0
  && typeof generated_at === 'string' && Number.isFinite(Date.parse(generated_at))
  && isObject(totals) && OPERATIONS_REPORT_TOTAL_FIELDS.every((field) => totals[field] === null || Number.isFinite(totals[field]))
  && isObject(filters) && ['branches', 'managers', 'staff', 'shifts'].every((key) => {
   const options = filters[key];
   return Array.isArray(options) && options.every(isObject);
  })
  && (receipt == null || (isObject(receipt) && Array.isArray(receipt.items) && receipt.items.every(isObject)))
  && (data_state == null || typeof data_state === 'string')
  && (settlement == null || isObject(settlement));
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return json({ error: 'Unauthorized' }, 401);
 if (!roles.has(profile.role)) return json({ error: 'Tiada akses laporan' }, 403);

 let query: ParsedOperationsReportFilters;
 try {
  query = parseOperationsReportFilters(new URL(request.url).searchParams);
 } catch (error) {
  return json({ error: error instanceof Error ? error.message : 'Penapis laporan tidak sah' }, 400);
 }

 const exporting = query.format === 'csv';
 const receiptView = query.view === 'receipt';
 const page = receiptView || exporting ? 1 : query.page;
 const limit = receiptView ? 1 : exporting ? exportLimit + 1 : query.limit;
 const offset = (page - 1) * limit;
 const supabase = await createClient();
 // This RPC is not in generated database types yet. Only the user's cookie
 // session is used. SQL validates scope and filters in the same snapshot that
 // supplies the rows, filter choices, and full filtered totals.
 const { data, error } = await (supabase as SupabaseClient).rpc('read_operational_report', {
  p_view: query.view,
  p_from: query.from,
  p_to: query.to,
  p_branch_id: query.branchId,
  p_am_id: query.amId,
  p_staff_id: query.staffId,
  p_shift_id: query.shiftId,
  p_transaction_id: query.transactionId,
  p_data: query.data,
  p_limit: limit,
  p_offset: offset,
  ...(query.caseType !== null ? { p_case_type: query.caseType } : {}),
 });
 if (error) {
  if (error.code === '42501') return json({ error: 'Tiada akses kepada laporan atau cawangan ini' }, 403);
  if (error.code === '22023') return json({ error: 'Penapis laporan tidak sah' }, 400);
  if (error.code === 'PGRST301') return json({ error: 'Unauthorized' }, 401);
  console.error('Operations report read failed', { view: query.view, code: error.code });
  return json({ error: 'Laporan tidak dapat dimuatkan' }, 500);
 }
 if (!isReport(data)) return json({ error: 'Respons laporan tidak sah' }, 500);
 if (receiptView && !data.receipt) return json({ error: 'Transaksi tidak dijumpai' }, 404);
 if (exporting && data.total_rows > exportLimit) {
  return json({ error: 'Eksport melebihi 5,000 baris. Kecilkan julat tarikh atau tambah penapis.' }, 422);
 }

 // Receipt items are nested, not a page of transaction rows. Other views
 // must return exactly the requested window, not a silently capped subset.
 const expectedRows = Math.min(limit, Math.max(0, data.total_rows - offset));
 if (receiptView ? data.rows.length > 1 : data.rows.length !== expectedRows) {
  return json({ error: 'Respons laporan tidak lengkap' }, 500);
 }
 if (!exporting) {
  const response: OperationsReportResponse = { ...data, page, limit, has_more: !receiptView && offset + limit < data.total_rows };
  return json(response);
 }

 const csv = operationsReportCsv(data, query);
 if (Buffer.byteLength(csv, 'utf8') > exportByteLimit) {
  return json({ error: 'Fail eksport terlalu besar. Kecilkan julat tarikh atau tambah penapis.' }, 422);
 }
 return new NextResponse(csv, {
  headers: {
   ...noStore,
   'Content-Type': 'text/csv; charset=utf-8',
   'Content-Disposition': `attachment; filename="rkj-operations-${query.view}-${query.from}_${query.to}.csv"`,
   'X-Content-Type-Options': 'nosniff',
  },
 });
}
