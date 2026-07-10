import type {
 BranchPerformanceRow,
 FleetReportSummary,
 InventoryReportRow,
 ProductPerformanceRow,
 ReportOverview,
 SalesTrendRow,
 StaffPerformanceRow,
} from './types';

async function fetchJson<T>(url: string): Promise<T> {
 const res = await fetch(url);
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Request failed');
 return data;
}

function qs(from: string, to: string, extra?: Record<string, string>) {
 const params = new URLSearchParams({ from, to,...extra });
 return params.toString();
}

export async function fetchReportOverview(from: string, to: string) {
 return fetchJson<{ overview: ReportOverview }>(`/api/reports/overview?${qs(from, to)}`);
}

export async function fetchSalesTrend(from: string, to: string, groupBy = 'day') {
 return fetchJson<{ trend: SalesTrendRow[] }>(
 `/api/reports/sales?${qs(from, to, { group_by: groupBy })}`);
}

export async function fetchBranchPerformance(from: string, to: string, limit = 50) {
 return fetchJson<{ branches: BranchPerformanceRow[] }>(
 `/api/reports/branches?${qs(from, to, { limit: String(limit) })}`);
}

export async function fetchProductPerformance(from: string, to: string, limit = 15) {
 return fetchJson<{ products: ProductPerformanceRow[] }>(
 `/api/reports/products?${qs(from, to, { limit: String(limit) })}`);
}

export async function fetchStaffPerformance(from: string, to: string, limit = 50) {
 return fetchJson<{ staff: StaffPerformanceRow[] }>(
 `/api/reports/staff?${qs(from, to, { limit: String(limit) })}`);
}

export async function fetchInventoryReport(limit = 100) {
 return fetchJson<{ items: InventoryReportRow[] }>(`/api/reports/inventory?limit=${limit}`);
}

export async function fetchFleetReport(from: string, to: string) {
 return fetchJson<{ fleet: FleetReportSummary }>(`/api/reports/fleet?${qs(from, to)}`);
}
