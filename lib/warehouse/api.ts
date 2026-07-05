import type { WarehouseAudit, WarehouseSummary } from './types';
import type { LineItemInput } from '@/lib/inventory/types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
 const res = await fetch(url, {
 headers: { 'Content-Type': 'application/json' },...options,
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Request failed');
 return data;
}

export async function fetchWarehouseSummary() {
 return fetchJson<{ summary: WarehouseSummary }>('/api/warehouse/summary');
}

export async function fetchWarehouseAudits() {
 return fetchJson<{ audits: WarehouseAudit[] }>('/api/warehouse/audits');
}

export async function submitWarehouseAudit(
 locationId: string,
 items: Array<{ stock_item_id: string; audited_quantity: number; unit?: string }>,
 notes?: string) {
 return fetchJson<{ result: Record<string, string> }>('/api/warehouse/audits', {
 method: 'POST',
 body: JSON.stringify({ location_id: locationId, items, notes }),
 });
}

export async function approveWarehouseAudit(auditId: string) {
 return fetchJson<{ result: unknown }>(`/api/warehouse/audits/${auditId}/approve`, {
 method: 'POST',
 });
}

export { receiveStock, createTransfer, dispatchTransfer, completeTransfer } from '@/lib/inventory/api';
export type { LineItemInput };
