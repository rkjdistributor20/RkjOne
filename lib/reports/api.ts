import type {
 BranchPerformanceRow,
 FleetReportSummary,
 InventoryReportRow,
 ProductPerformanceRow,
 ReportOverview,
 SalesTrendRow,
 StaffPerformanceRow,
} from './types';
import { fetchJson } from '@/lib/client/fetch-json';

function qs(from: string, to: string, extra?: Record<string, string>) {
 const params = new URLSearchParams({ from, to,...extra });
 return params.toString();
}

export async function fetchReportOverview(from: string, to: string) {
 return fetchJson<{ overview: ReportOverview }>(
 `/api/reports/overview?${qs(from, to)}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchSalesTrend(from: string, to: string, groupBy = 'day') {
 return fetchJson<{ trend: SalesTrendRow[] }>(
 `/api/reports/sales?${qs(from, to, { group_by: groupBy })}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchBranchPerformance(from: string, to: string, limit = 50) {
 return fetchJson<{ branches: BranchPerformanceRow[] }>(
 `/api/reports/branches?${qs(from, to, { limit: String(limit) })}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchProductPerformance(from: string, to: string, limit = 15) {
 return fetchJson<{ products: ProductPerformanceRow[] }>(
 `/api/reports/products?${qs(from, to, { limit: String(limit) })}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchStaffPerformance(from: string, to: string, limit = 50) {
 return fetchJson<{ staff: StaffPerformanceRow[] }>(
 `/api/reports/staff?${qs(from, to, { limit: String(limit) })}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchInventoryReport(limit = 100) {
 return fetchJson<{ items: InventoryReportRow[] }>(
 `/api/reports/inventory?limit=${limit}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchFleetReport(from: string, to: string) {
 return fetchJson<{ fleet: FleetReportSummary }>(
 `/api/reports/fleet?${qs(from, to)}`,
 undefined,
 { ttlMs: 30_000 });
}
