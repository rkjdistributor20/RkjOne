import type {
 AgentDashboardData,
 AgentPaymentPurpose,
 AgentPaymentReceipt,
 AgentPaymentStatus,
 AgentPaymentLifecycleStatus,
 AgentStockOrder,
 AgentSalesStaff,
 AgentSalesStaffPayload,
 AdminAgentPayload,
 AdminSalesAgentAccount,
 AgentPriceGroupOption,
 AgentAccountReportEvent,
 AgentSpecialAssignableStaff,
 AgentSpecialStaffAssignment,
 AdminAgentDriverOption,
 AdminBranchPickupOption,
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
 checkout: { mode: string; provider?: string; checkout_url: string | null; gateway_session_id: string | null };
 session: {
 id: string;
 provider: string;
 mode: string;
 checkout_url: string | null;
 gateway_session_id: string | null;
 status_url: string;
 cancel_url: string;
 return_url: string;
 };
 }>('/api/sales-agent/payments', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
}

export async function confirmAgentPayment(paymentId: string) {
 return fetchJson<{ ok: boolean; result?: unknown; receipt?: AgentPaymentReceipt }>(
 '/api/sales-agent/payments/confirm',
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ payment_id: paymentId }),
 });
}

export async function fetchAgentReceipt(paymentId: string) {
 return fetchJson<{ receipt: AgentPaymentReceipt }>(`/api/sales-agent/receipts/${paymentId}`);
}

export async function fetchPaymentStatus(paymentId: string) {
 return fetchJson<{
 payment: {
 id: string;
 purpose: AgentPaymentPurpose;
 reference_type?: string;
 reference_id?: string;
 amount_rm: number;
 payment_method: OnlinePaymentMethod;
 status: AgentPaymentStatus;
 lifecycle_status: AgentPaymentLifecycleStatus;
 paid_at: string | null;
 created_at: string;
 provider?: string | null;
 gateway_ref?: string | null;
 gateway_session_id?: string | null;
 checkout_url?: string | null;
 failure_reason?: string | null;
 cancelled_at?: string | null;
 refunded_at?: string | null;
 refund_ref?: string | null;
 refund_reason?: string | null;
 next_action?: {
 type: 'checkout';
 checkout_url: string | null;
 cancel_url: string;
 } | null;
 };
 receipt: AgentPaymentReceipt | null;
 }>(`/api/sales-agent/payments/${paymentId}/status`);
}

export async function cancelAgentPaymentSession(paymentId: string, reason?: string) {
 return fetchJson<{ ok: boolean; result?: unknown }>(
 `/api/sales-agent/payments/${paymentId}/cancel`,
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ reason }),
 });
}

export async function refundAgentPaymentSession(
 paymentId: string,
 payload: { refund_ref?: string; reason?: string } = {}) {
 return fetchJson<{ ok: boolean; result?: unknown; refund?: unknown }>(
 `/api/sales-agent/payments/${paymentId}/refund`,
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
}

export async function startOutletSubscription(outletId: string) {
 return fetchJson<{ subscription: { id: string; amount_rm: number; status?: string }; payment_exempt?: boolean; activated?: boolean }>(
 '/api/sales-agent/subscriptions',
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ outlet_id: outletId }),
 });
}

export async function fetchStockCatalog() {
 return fetchJson<{ items: import('./types').StockCatalogItem[] }>('/api/sales-agent/catalog');
}

export async function fetchAgentSalesStaff() {
 return fetchJson<{ staff: AgentSalesStaff[] }>('/api/sales-agent/sales-staff');
}

export async function createAgentSalesStaff(payload: AgentSalesStaffPayload) {
 return fetchJson<{ staff: AgentSalesStaff }>('/api/sales-agent/sales-staff', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
}

export async function updateAgentSalesStaff(id: string, payload: AgentSalesStaffPayload) {
 return fetchJson<{ staff: AgentSalesStaff }>('/api/sales-agent/sales-staff', {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({...payload, id }),
 });
}

export async function fetchAdminAgentAccounts() {
 return fetchJson<{
 accounts: AdminSalesAgentAccount[];
 price_groups: AgentPriceGroupOption[];
 report_events: AgentAccountReportEvent[];
 assignable_staff: AgentSpecialAssignableStaff[];
 special_assignments: AgentSpecialStaffAssignment[];
 drivers: AdminAgentDriverOption[];
 branches: AdminBranchPickupOption[];
 }>('/api/sales-agent/admin/accounts');
}

export async function createAdminAgentAccount(payload: AdminAgentPayload) {
 return fetchJson<{
 account: SalesAgentAccount;
 login: { email: string; password: string };
 }>('/api/sales-agent/admin/accounts', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
}

export async function updateAdminAgentAccount(payload: AdminAgentPayload & { account_id: string }) {
 return fetchJson<{ ok: boolean }>('/api/sales-agent/admin/accounts', {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
}

export async function suspendAdminAgentAccount(accountId: string) {
 return fetchJson<{ ok: boolean }>(`/api/sales-agent/admin/accounts?account_id=${encodeURIComponent(accountId)}`, {
 method: 'DELETE',
 });
}


export async function assignSpecialAgentStaff(payload: {
 agent_account_id: string;
 staff_id: string;
 role_title?: string;
 assignment_note?: string;
}) {
 return fetchJson<{ assignment: AgentSpecialStaffAssignment }>('/api/sales-agent/admin/special-assignments', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
}

export async function endSpecialAgentAssignment(assignmentId: string) {
 return fetchJson<{ ok: boolean }>(`/api/sales-agent/admin/special-assignments?assignment_id=${encodeURIComponent(assignmentId)}`, {
 method: 'DELETE',
 });
}
