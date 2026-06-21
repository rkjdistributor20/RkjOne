import type {
  FactoryProductionWeek,
  HqFactoryOrder,
  PublishedProductionDate,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Permintaan gagal');
  return data;
}

export async function fetchProductionCalendar(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return fetchJson<{ dates: PublishedProductionDate[] }>(
    `/api/production/calendar?${params}`
  );
}

export async function fetchProductionWeek(weekStart: string) {
  return fetchJson<{ week: FactoryProductionWeek | null }>(
    `/api/production/weeks?week_start=${weekStart}`
  );
}

export async function saveProductionWeek(payload: {
  week_start: string;
  production_dates: string[];
  notes?: string;
  publish?: boolean;
}) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/production/weeks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchHqFactoryOrders(status?: string) {
  const params = status ? `?status=${status}` : '';
  return fetchJson<{ orders: HqFactoryOrder[] }>(`/api/production/orders${params}`);
}

export async function createHqFactoryOrder(payload: {
  production_date: string;
  items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
  notes?: string;
}) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/production/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function acknowledgeHqFactoryOrder(orderId: string) {
  return fetchJson<{ result: Record<string, unknown> }>(
    `/api/production/orders/${orderId}/acknowledge`,
    { method: 'POST' }
  );
}
