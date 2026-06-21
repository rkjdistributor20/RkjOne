import type {
  AdjustmentItemInput,
  CountItemInput,
  InventoryBalanceRow,
  InventoryLocation,
  KioskOverviewBranch,
  KioskOverviewSummary,
  LineItemInput,
  StockItemOption,
  StockMovementRow,
  StockTransferRow,
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

export async function fetchLocations(type?: string, branchId?: string) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (branchId) params.set('branch_id', branchId);
  return fetchJson<{ locations: InventoryLocation[] }>(
    `/api/inventory/locations?${params}`
  );
}

export async function fetchKioskOverview(branchId?: string) {
  const params = branchId ? `?branch_id=${branchId}` : '';
  return fetchJson<{
    branches: KioskOverviewBranch[];
    summary: KioskOverviewSummary;
  }>(`/api/inventory/kiosk-overview${params}`);
}

export async function fetchStockItems(options?: { hq?: boolean }) {
  const params = options?.hq ? '?hq=1' : '';
  return fetchJson<{ items: StockItemOption[] }>(`/api/inventory/stock-items${params}`);
}

export async function fetchBalances(locationId: string) {
  return fetchJson<{ balances: InventoryBalanceRow[] }>(
    `/api/inventory/balances?location_id=${locationId}`
  );
}

export async function fetchMovements(locationId: string, limit = 50) {
  return fetchJson<{ movements: StockMovementRow[] }>(
    `/api/inventory/movements?location_id=${locationId}&limit=${limit}`
  );
}

export async function fetchTransfers(locationId?: string) {
  const params = locationId ? `?location_id=${locationId}` : '';
  return fetchJson<{ transfers: StockTransferRow[] }>(
    `/api/inventory/transfers${params}`
  );
}

export async function receiveStock(
  locationId: string,
  items: LineItemInput[],
  source?: string,
  notes?: string
) {
  return fetchJson<{ result: Record<string, string> }>('/api/inventory/receive', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, items, source, notes }),
  });
}

export async function createTransfer(payload: {
  from_location_id: string;
  to_location_id: string;
  items: LineItemInput[];
  driver_id?: string;
  vehicle_id?: string;
  notes?: string;
}) {
  return fetchJson<{ result: Record<string, string> }>('/api/inventory/transfers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function dispatchTransfer(transferId: string) {
  return fetchJson<{ result: unknown }>(
    `/api/inventory/transfers/${transferId}/dispatch`,
    { method: 'POST' }
  );
}

export async function completeTransfer(transferId: string) {
  return fetchJson<{ result: unknown }>(
    `/api/inventory/transfers/${transferId}/complete`,
    { method: 'POST' }
  );
}

export async function submitAdjustment(
  locationId: string,
  reason: string,
  items: AdjustmentItemInput[]
) {
  return fetchJson<{ result: Record<string, string> }>('/api/inventory/adjustments', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, reason, items }),
  });
}

export async function submitCount(
  locationId: string,
  items: CountItemInput[],
  notes?: string
) {
  return fetchJson<{ result: Record<string, string> }>('/api/inventory/counts', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, items, notes }),
  });
}

export async function submitWriteOff(
  locationId: string,
  reason: string,
  items: LineItemInput[]
) {
  return fetchJson<{ result: Record<string, string> }>('/api/inventory/write-offs', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, reason, items }),
  });
}

export async function fetchDrivers() {
  return fetchJson<{
    drivers: Array<{ id: string; driver_code: string; full_name: string }>;
  }>('/api/inventory/drivers');
}

export async function fetchVehicles() {
  return fetchJson<{
    vehicles: Array<{ id: string; vehicle_code: string; vehicle_type: string }>;
  }>('/api/inventory/vehicles');
}
