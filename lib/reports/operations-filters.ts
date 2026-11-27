import { parseReportFilters } from './filters';
import { OPERATIONS_REPORT_DATA, OPERATIONS_REPORT_VIEWS } from './operations-types';

const queryKeys = [
 'view', 'from', 'to', 'branch_id', 'am_id', 'staff_id', 'shift_id',
 'transaction_id', 'data', 'page', 'limit', 'format', 'case_type',
] as const;
const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function optionalId(params: URLSearchParams, key: string) {
 const value = params.get(key);
 if (value !== null && !uuidPattern.test(value)) throw new Error('ID penapis tidak sah');
 return value?.toLowerCase() ?? null;
}

function enumParam<T extends string>(value: string | null, options: readonly T[], fallback: T, message: string) {
 if (value === null) return fallback;
 const option = options.find((item) => item === value);
 if (option === undefined) throw new Error(message);
 return option;
}

export function parseOperationsReportFilters(params: URLSearchParams) {
 // An ambiguous or blank scope must not become an unfiltered request.
 if (queryKeys.some((key) => params.getAll(key).length > 1)) throw new Error('Penapis laporan berulang');
 const { from, to, branchId, transactionId, page, limit, format } = parseReportFilters(params);
 const view = enumParam(params.get('view'), OPERATIONS_REPORT_VIEWS, 'summary', 'Paparan laporan tidak sah');
 const data = enumParam(params.get('data'), OPERATIONS_REPORT_DATA, 'operational', 'Jenis data laporan tidak sah');
 const caseType = params.get('case_type');
 if (caseType !== null && (view !== 'actions' || !/^[a-z\d_-]{1,64}$/i.test(caseType))) {
  throw new Error('Jenis kes laporan tidak sah');
 }
 if (view === 'receipt' && !transactionId) throw new Error('Transaksi diperlukan');

 return {
  from, to, branchId, transactionId, page, limit: limit ?? 50, format, view, data, caseType,
  amId: optionalId(params, 'am_id'),
  staffId: optionalId(params, 'staff_id'),
  shiftId: optionalId(params, 'shift_id'),
 };
}

export type ParsedOperationsReportFilters = ReturnType<typeof parseOperationsReportFilters>;
