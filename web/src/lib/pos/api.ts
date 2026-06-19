import type {
  CreateSalePayload,
  DailySummary,
  OfflineSalePayload,
  PosShiftSummary,
  PosTransactionRow,
  SaleResult,
} from './types';
import type { Product } from '@/types/database';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function fetchProducts(branchId: string) {
  return fetchJson<{ products: Product[]; categories: string[] }>(
    `/api/pos/products?branch_id=${branchId}`
  );
}

export async function fetchShift(branchId: string) {
  return fetchJson<{ shift: PosShiftSummary | null }>(
    `/api/pos/shift?branch_id=${branchId}`
  );
}

export async function openShift(branchId: string, openingCash: number) {
  return fetchJson<{ shift: PosShiftSummary }>('/api/pos/shift', {
    method: 'POST',
    body: JSON.stringify({ branch_id: branchId, opening_cash: openingCash }),
  });
}

export async function closeShift(
  shiftId: string,
  closingCash: number,
  notes?: string
) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/pos/shift', {
    method: 'PATCH',
    body: JSON.stringify({ shift_id: shiftId, closing_cash: closingCash, notes }),
  });
}

export async function fetchTransactions(branchId: string, shiftId?: string) {
  const params = new URLSearchParams({ branch_id: branchId });
  if (shiftId) params.set('shift_id', shiftId);
  return fetchJson<{ transactions: PosTransactionRow[] }>(
    `/api/pos/transactions?${params}`
  );
}

export async function createSale(payload: CreateSalePayload) {
  return fetchJson<{ result: SaleResult }>('/api/pos/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function voidTransaction(id: string, reason: string) {
  return fetchJson<{ result: unknown }>(`/api/pos/transactions/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function refundTransaction(id: string, reason: string) {
  return fetchJson<{ result: unknown }>(`/api/pos/transactions/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function fetchDailySummary(branchId: string, date?: string) {
  const params = new URLSearchParams({ branch_id: branchId });
  if (date) params.set('date', date);
  return fetchJson<{ summary: DailySummary }>(`/api/pos/summary?${params}`);
}

export async function syncOfflineSales(sales: OfflineSalePayload[]) {
  return fetchJson<{ synced: string[]; failed: Array<{ offlineId: string; error: string }> }>(
    '/api/pos/sync',
    { method: 'POST', body: JSON.stringify({ sales }) }
  );
}

export async function fetchBranches() {
  return fetchJson<{
    branches: Array<{
      id: string;
      branch_code: string;
      branch_name: string;
    }>;
  }>('/api/pos/sync');
}
