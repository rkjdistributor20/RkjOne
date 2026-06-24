import type {
  AgentDashboardData,
  AgentStockOrder,
  OnlinePaymentMethod,
  SalesAgentAccount,
} from './types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export async function fetchAgentDashboard(): Promise<AgentDashboardData> {
  const res = await fetchJson<{ dashboard: AgentDashboardData }>('/api/sales-agent/dashboard');
  return res.dashboard;
}

export async function registerAgentAccount(payload: Partial<SalesAgentAccount>) {
  return fetchJson<{ account: SalesAgentAccount }>('/api/sales-agent/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function registerAgentOutlet(payload: {
  outlet_code: string;
  outlet_name: string;
  address_line?: string;
  city?: string;
  state?: string;
  postcode?: string;
}) {
  return fetchJson<{ outlet: unknown }>('/api/sales-agent/outlets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function createAgentOrder(payload: {
  production_date: string;
  items: Array<{ stock_item_id: string; quantity: number }>;
  notes?: string;
}) {
  return fetchJson<{ order: AgentStockOrder }>('/api/sales-agent/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function createAgentPayment(payload: {
  purpose: 'STOCK_ORDER' | 'POS_SUBSCRIPTION';
  reference_id: string;
  payment_method: OnlinePaymentMethod;
}) {
  return fetchJson<{
    payment: { id: string; amount_rm: number; status: string };
    checkout: { mode: string; checkout_url: string | null; gateway_session_id: string | null };
  }>('/api/sales-agent/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
  });
}

export async function confirmAgentPayment(paymentId: string) {
  return fetchJson<{ ok: boolean; result?: unknown }>('/api/sales-agent/payments/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: paymentId }),
  });
}

export async function startOutletSubscription(outletId: string) {
  return fetchJson<{ subscription: { id: string; amount_rm: number } }>(
    '/api/sales-agent/subscriptions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outlet_id: outletId }),
    }
  );
}

export async function fetchStockCatalog() {
  return fetchJson<{ items: import('./types').StockCatalogItem[] }>('/api/sales-agent/catalog');
}
