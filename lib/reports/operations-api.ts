import type { OperationsReportParams } from './operations-types';

/** Shared URL for table requests, drilldowns, and full filtered CSV downloads. */
export function operationsReportUrl(filters: OperationsReportParams) {
 const entries = {
  view: filters.view,
  from: filters.from,
  to: filters.to,
  branch_id: filters.branchId,
  am_id: filters.amId,
  staff_id: filters.staffId,
  shift_id: filters.shiftId,
  transaction_id: filters.transactionId,
  data: filters.data,
  page: filters.page,
  limit: filters.limit,
  format: filters.format,
  case_type: filters.caseType,
 };
 const params = new URLSearchParams();
 for (const [key, value] of Object.entries(entries)) {
  if (value != null && String(value).trim()) params.set(key, String(value));
 }
 return `/api/reports/operations?${params}`;
}
