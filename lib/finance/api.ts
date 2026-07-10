import type {
 BankInRecord,
 BranchSupplyRequest,
 CashReconciliation,
 CashUsageStatus,
 CashUsageType,
 CollectionCashUsage,
 CollectionType,
 DailyFinancialReport,
 FinanceCollection,
 FinanceSummary,
 ManualQrPayment,
} from './types';
import { fetchJson } from '@/lib/client/fetch-json';

export async function fetchFinanceSummary() {
 return fetchJson<{ summary: FinanceSummary }>(
 '/api/finance/summary',
 undefined,
 { ttlMs: 10_000 });
}

export async function fetchCollections(status?: string, limit = 50) {
 const params = new URLSearchParams({ limit: String(limit) });
 if (status) params.set('status', status);
 return fetchJson<{ collections: FinanceCollection[] }>(
 `/api/finance/collections?${params}`,
 undefined,
 { ttlMs: 10_000 });
}

export async function createCollection(payload: {
 collection_type: CollectionType;
 amount: number;
 branch_id?: string;
 shift_id?: string;
 collected_from?: string;
 notes?: string;
}) {
 return fetchJson<{ result: Record<string, string> }>('/api/finance/collections', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function markCollected(
 collectionId: string,
 payload?: { collector_name?: string; third_party_name?: string }) {
 return fetchJson<{ result: unknown }>(`/api/finance/collections/${collectionId}/collect`, {
 method: 'POST',
 body: JSON.stringify(payload ?? {}),
 });
}

export async function fetchBankIns(limit = 30) {
 return fetchJson<{ records: BankInRecord[] }>(
 `/api/finance/bank-in?limit=${limit}`,
 undefined,
 { ttlMs: 10_000 });
}

export async function fetchCollectionCashUsages(limit = 50) {
 return fetchJson<{ usages: CollectionCashUsage[] }>(
 `/api/finance/collection-usages?limit=${limit}`,
 undefined,
 { ttlMs: 10_000 });
}

export async function recordCollectionCashUsage(payload: {
 collection_id: string;
 usage_type: CashUsageType;
 amount: number;
 description: string;
 proof_url?: string;
 receipt_number?: string;
 supply_request_id?: string;
 vehicle_reference?: string;
 vendor_name?: string;
 spent_at?: string;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/finance/collection-usages', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function reviewCollectionCashUsage(payload: {
 usage_id: string;
 status: Extract<CashUsageStatus, 'ACCEPTED' | 'REJECTED'>;
 review_notes?: string;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/finance/collection-usages', {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}

export async function fetchBranchSupplyRequests(status?: string, limit = 50) {
 const params = new URLSearchParams({ limit: String(limit) });
 if (status) params.set('status', status);
 return fetchJson<{ requests: BranchSupplyRequest[] }>(
 `/api/finance/supply-requests?${params}`,
 undefined,
 { ttlMs: 15_000 });
}

export async function recordBankIn(payload: {
 amount: number;
 collection_id?: string;
 bank_name?: string;
 reference_number?: string;
 slip_url?: string;
 notes?: string;
}) {
 return fetchJson<{ result: Record<string, string> }>('/api/finance/bank-in', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function fetchReconciliations(limit = 20) {
 return fetchJson<{ reconciliations: CashReconciliation[] }>(
 `/api/finance/reconciliations?limit=${limit}`,
 undefined,
 { ttlMs: 15_000 });
}

export async function submitReconciliation(payload: {
 branch_id: string;
 reconciliation_date: string;
 expected_cash: number;
 actual_cash: number;
 notes?: string;
}) {
 return fetchJson<{ result: Record<string, string> }>('/api/finance/reconciliations', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function approveReconciliation(id: string) {
 return fetchJson<{ result: unknown }>(`/api/finance/reconciliations/${id}/approve`, {
 method: 'POST',
 });
}

export async function fetchDailyReports(limit = 20) {
 return fetchJson<{ reports: DailyFinancialReport[] }>(
 `/api/finance/daily-report?limit=${limit}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function generateDailyReport(reportDate: string, branchId?: string) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/finance/daily-report', {
 method: 'POST',
 body: JSON.stringify({ report_date: reportDate, branch_id: branchId }),
 });
}

export async function fetchManualQrPayments(status?: string, limit = 30) {
 const params = new URLSearchParams({ limit: String(limit) });
 if (status) params.set('status', status);
 return fetchJson<{ payments: ManualQrPayment[] }>(
 `/api/finance/qr-manual?${params}`,
 undefined,
 { ttlMs: 10_000 });
}

export async function updateManualQrPayment(payload: {
 payment_id: string;
 status: 'PAID' | 'FAILED' | 'CANCELLED';
 notes?: string;
}) {
 return fetchJson<{ payment: ManualQrPayment }>('/api/finance/qr-manual', {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}
