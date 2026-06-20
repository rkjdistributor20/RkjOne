import type {
  BankInRecord,
  CashReconciliation,
  CollectionType,
  DailyFinancialReport,
  FinanceCollection,
  FinanceSummary,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function fetchFinanceSummary() {
  return fetchJson<{ summary: FinanceSummary }>('/api/finance/summary');
}

export async function fetchCollections(status?: string) {
  const params = status ? `?status=${status}` : '';
  return fetchJson<{ collections: FinanceCollection[] }>(`/api/finance/collections${params}`);
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
  payload?: { collector_name?: string; third_party_name?: string }
) {
  return fetchJson<{ result: unknown }>(`/api/finance/collections/${collectionId}/collect`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

export async function fetchBankIns() {
  return fetchJson<{ records: BankInRecord[] }>('/api/finance/bank-in');
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

export async function fetchReconciliations() {
  return fetchJson<{ reconciliations: CashReconciliation[] }>('/api/finance/reconciliations');
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

export async function fetchDailyReports() {
  return fetchJson<{ reports: DailyFinancialReport[] }>('/api/finance/daily-report');
}

export async function generateDailyReport(reportDate: string, branchId?: string) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/finance/daily-report', {
    method: 'POST',
    body: JSON.stringify({ report_date: reportDate, branch_id: branchId }),
  });
}
