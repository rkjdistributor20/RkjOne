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
  params.set(
    'from',
    from ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  );
  params.set(
    'to',
    to ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  );
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
    assigned_driver_id?: string;
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

export async function createDeliveryRoutesForOrder(orderId: string, replace = false) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/production/routes', {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId, replace }),
  });
}

export async function completeRouteHandoff(primaryPlanId: string) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/production/routes/handoff', {
    method: 'POST',
    body: JSON.stringify({ primary_plan_id: primaryPlanId }),
  });
}

export async function updateDeliveryRoutePlan(
  planId: string,
  payload: { driver_id?: string; vehicle_id?: string; stop_order?: string[] }
) {
  return fetchJson<{ result: Record<string, unknown> }>(`/api/production/routes/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function adjustRouteStopItems(
  stopId: string,
  adjustments: Array<{ stock_item_id: string; adjusted_quantity: number }>,
  reason?: string
) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/production/routes/adjust', {
    method: 'POST',
    body: JSON.stringify({ stop_id: stopId, adjustments, reason }),
  });
}

export async function finalizeHqFactoryOrder(orderId: string) {
  return fetchJson<{ result: Record<string, unknown> }>(
    `/api/production/orders/${orderId}/finalize`,
    { method: 'POST' }
  );
}

export async function fetchDriverWorkSchedule(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return fetchJson<{ schedule: import('./types').DriverWorkScheduleEntry[] }>(
    `/api/production/driver-schedule?${params}`
  );
}

export async function fetchDeliveryRoutePlans(orderId?: string) {
  const params = orderId ? `?order_id=${orderId}` : '';
  return fetchJson<{ routes: DeliveryRoutePlan[] }>(`/api/production/routes${params}`);
}

export async function confirmRouteStopDelivery(
  stopId: string,
  payload?: { receiver_name?: string; driver_notes?: string }
) {
  return fetchJson<{ result: Record<string, unknown> }>(
    `/api/production/routes/stops/${stopId}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }
  );
}
