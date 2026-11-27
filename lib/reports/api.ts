import { fetchJson } from '@/lib/client/fetch-json';
import type { ReportFilters } from './filters';

export function reportUrl(report: string, filters?: ReportFilters, extra?: Record<string, string>) {
 const params = new URLSearchParams(extra);
 if (filters) {
  params.set('from', filters.from);
  params.set('to', filters.to);
  if (filters.branchId) params.set('branch_id', filters.branchId);
 }
 return `/api/reports/${report}?${params}`;
}

export function fetchReport<T>(url: string, signal: AbortSignal) {
 // Do not reuse report results across requests; the user's grants may change.
 return fetchJson<T>(url, { cache: 'no-store', signal }, { dedupe: false });
}
