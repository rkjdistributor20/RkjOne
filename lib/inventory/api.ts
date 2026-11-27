import type {
 AdjustmentItemInput,
 CountItemInput,
 InventoryBalanceRow,
 InventoryLocation,
 InventoryOverviewResponse,
 KioskOverviewBranch,
 KioskOverviewSummary,
 LineItemInput,
 PendingInventoryCount,
 StockItemOption,
 StockMovementRow,
 StockTransferRow,
 TransferCreateInput,
 TransferKioskOption,
} from './types';
import { fetchJson } from '@/lib/client/fetch-json';
import { withStockOperationId } from './stock-operation-retry';

export async function fetchLocations(type?: string, branchId?: string) {
 const params = new URLSearchParams();
 if (type) params.set('type', type);
 if (branchId) params.set('branch_id', branchId);
 return fetchJson<{ locations: InventoryLocation[] }>(
 `/api/inventory/locations?${params}`,
 undefined,
 { ttlMs: 30_000 });
}

export async function fetchKioskOverview(branchId?: string) {
 const params = branchId ? `?branch_id=${branchId}` : '';
 return fetchJson<{
 branches: KioskOverviewBranch[];
 summary: KioskOverviewSummary;
 }>(`/api/inventory/kiosk-overview${params}`, undefined, { ttlMs: 10_000 });
}

export async function fetchInventoryOverview() {
 return fetchJson<InventoryOverviewResponse>('/api/inventory/overview', undefined, { ttlMs: 10_000 });
}

export async function fetchStockItems(options?: { hq?: boolean }) {
 const params = options?.hq ? '?hq=1' : '';
 return fetchJson<{ items: StockItemOption[] }>(
 `/api/inventory/stock-items${params}`,
 undefined,
 { ttlMs: 60_000 });
}

export async function fetchBalances(locationId: string) {
 return fetchJson<{ balances: InventoryBalanceRow[] }>(
 `/api/inventory/balances?location_id=${locationId}`,
 undefined,
 { ttlMs: 5_000 });
}

export async function fetchRotiBatches(locationId: string) {
 return fetchJson<import('@/lib/stock/expiry').RotiBatchesResponse>(
 `/api/inventory/roti-batches?location_id=${locationId}`,
 undefined,
 { ttlMs: 10_000 });
}

export async function fetchMovements(
 locationId: string,
 limit = 50,
 filter?: { kind?: string; from?: string; to?: string },
) {
 const params = new URLSearchParams({ location_id: locationId, limit: String(limit) });
 if (filter?.kind) params.set('kind', filter.kind);
 if (filter?.from) params.set('from', filter.from);
 if (filter?.to) params.set('to', filter.to);
 return fetchJson<{ movements: StockMovementRow[] }>(
 `/api/inventory/movements?${params}`,
 undefined,
 { ttlMs: 5_000 });
}

export async function fetchTransfers(locationId?: string) {
 const params = locationId ? `?location_id=${encodeURIComponent(locationId)}` : '';
 return fetchJson<{ transfers: StockTransferRow[] }>(
 `/api/inventory/transfers${params}`,
 undefined,
 { dedupe: false });
}

export async function fetchTransferKioskOptions() {
 return fetchJson<{ origins: TransferKioskOption[]; destinations: TransferKioskOption[] }>(
  '/api/inventory/transfers?options=kiosk');
}

export async function receiveStock(
 locationId: string,
 items: LineItemInput[],
 source?: string,
 notes?: string,
 documentReference?: string) {
 const body = JSON.stringify({ location_id: locationId, items, source, notes, document_reference: documentReference });
 return withStockOperationId('receive', body, id => fetchJson<{ result: Record<string, string> }>('/api/inventory/receive', {
 method: 'POST',
 headers: { 'Idempotency-Key': id },
 body,
 }));
}

export async function createTransfer(payload: TransferCreateInput, requestId: string) {
 return fetchJson<{ result: { transfer_id: string; transfer_number: string } }>('/api/inventory/transfers', {
 method: 'POST',
 headers: { 'Idempotency-Key': requestId },
 body: JSON.stringify(payload),
 });
}

export async function dispatchTransfer(transferId: string) {
 return fetchJson<{ result: unknown }>(
 `/api/inventory/transfers/${transferId}/dispatch`,
 { method: 'POST' });
}

export async function completeTransfer(transferId: string) {
 return fetchJson<{ result: unknown }>(
 `/api/inventory/transfers/${transferId}/complete`,
 { method: 'POST' });
}

export async function cancelTransfer(transferId: string, reason: string) {
 return fetchJson<{ result: unknown }>(
  `/api/inventory/transfers/${transferId}/cancel`,
  { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function submitAdjustment(
 locationId: string,
 reason: string,
 items: AdjustmentItemInput[]) {
 const body = JSON.stringify({ location_id: locationId, reason, items });
 return withStockOperationId('adjustment', body, id => fetchJson<{ result: Record<string, string> }>('/api/inventory/adjustments', {
 method: 'POST',
 headers: { 'Idempotency-Key': id },
 body,
 }));
}

export async function submitCount(
 locationId: string,
 items: CountItemInput[],
 notes?: string) {
 return fetchJson<{ result: Record<string, string> }>('/api/inventory/counts', {
 method: 'POST',
 body: JSON.stringify({ location_id: locationId, items, notes }),
 });
}

export function fetchPendingInventoryCounts(locationId: string) {
 return fetchJson<{ counts: PendingInventoryCount[] }>(
 `/api/inventory/counts?${new URLSearchParams({ location_id: locationId })}`,
 );
}

export function reviewInventoryCount(countId: string, action: 'APPROVE' | 'REJECT', reason?: string) {
 return fetchJson<{ result: unknown }>('/api/inventory/counts', {
 method: 'PATCH',
 body: JSON.stringify({ count_id: countId, action, reason }),
 });
}

export async function submitWriteOff(
 locationId: string,
 reason: string,
 items: LineItemInput[]) {
 return fetchJson<{ result: Record<string, string> }>('/api/inventory/write-offs', {
 method: 'POST',
 body: JSON.stringify({ location_id: locationId, reason, items }),
 });
}

export async function fetchDrivers() {
 return fetchJson<{
 drivers: Array<{ id: string; driver_code: string; full_name: string }>;
 }>('/api/inventory/drivers', undefined, { ttlMs: 60_000 });
}

export async function fetchVehicles() {
 return fetchJson<{
 vehicles: Array<{ id: string; vehicle_code: string; vehicle_type: string }>;
 }>('/api/inventory/vehicles', undefined, { ttlMs: 60_000 });
}
