import type {
  DeliveryRoutePlan,
  FactoryOrderReport,
  FactoryProductionWeek,
  HqFactoryOrder,
  OrderSuggestion,
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

export async function fetchOrderSuggestion(productionDate: string) {
  return fetchJson<{ suggestion: OrderSuggestion }>(
    `/api/production/suggest?production_date=${productionDate}`
  );
}

export async function fetchFactoryOrderReport(orderId: string) {
  return fetchJson<{ report: FactoryOrderReport }>(
    `/api/production/reports?order_id=${orderId}`
  );
}

export async function createHqFactoryOrder(payload: {
  production_date: string;
  items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
  branch_items?: Array<{
    branch_id: string;
    stock_item_id: string;
    quantity: number;
    unit?: string;
  }>;
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

export async function createDeliveryRoutesForOrder(orderId: string) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/production/routes', {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId }),
  });
}

export async function fetchDeliveryRoutePlans(orderId?: string) {
  const params = orderId ? `?order_id=${orderId}` : '';
  return fetchJson<{ routes: DeliveryRoutePlan[] }>(`/api/production/routes${params}`);
}
