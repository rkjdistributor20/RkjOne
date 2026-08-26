import type { RotiExpirySummary } from '@/lib/stock/expiry';
import type {
 CreateSalePayload,
 DailySummary,
 MenuStockBalance,
 OfflineSalePayload,
 PosPresenceReason,
 PosShiftSummary,
 PosShiftAvailableStaff,
 PosShiftStaffMember,
 PosShiftMemberRole,
 PosStockSopResponse,
 PosShiftStockCheckType,
 PosTransactionRow,
 ProductStockInfo,
 PosDeviceContext,
 PosDeviceManagementStatus,
 SaleResult,
} from './types';
import type { Product } from '@/types/database';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
 const res = await fetch(url, {
 headers: { 'Content-Type': 'application/json' },...options,
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Request failed');
 return data;
}

const referenceCache = new Map<string, { expiresAt: number; value: unknown }>();

async function fetchCachedJson<T>(
 url: string,
 ttlMs: number,
 options?: RequestInit): Promise<T> {
 const now = Date.now();
 const cached = referenceCache.get(url);
 if (cached && cached.expiresAt > now) {
 return cached.value as T;
 }

 const value = await fetchJson<T>(url, options);
 referenceCache.set(url, { expiresAt: now + ttlMs, value });
 return value;
}

export function clearPosReferenceCache() {
 referenceCache.clear();
}

export async function fetchPosDeviceContext() {
 return fetchJson<PosDeviceContext>('/api/pos/device');
}

export async function enrollPosDevice(enrollmentCode: string) {
 return fetchJson<{ success: true; device: PosDeviceContext['device'] }>('/api/pos/device', {
  method: 'POST',
  body: JSON.stringify({ enrollment_code: enrollmentCode }),
 });
}

export async function syncPosDeviceManagement(status: PosDeviceManagementStatus) {
 return fetchJson<{ success: true; management: PosDeviceManagementStatus }>('/api/pos/device', {
  method: 'PUT',
  body: JSON.stringify({ status }),
 });
}

export async function fetchProducts(branchId: string) {
 return fetchCachedJson<{ products: Product[]; categories: string[] }>(
 `/api/pos/products?branch_id=${branchId}`,
 5 * 60 * 1000);
}

export async function fetchStockAvailability(branchId: string) {
 return fetchJson<{
 availability: Record<string, ProductStockInfo>;
 menuBalances: Record<string, MenuStockBalance>;
 supplementBalances: MenuStockBalance[];
 warning?: string;
 }>(`/api/pos/stock?branch_id=${branchId}`);
}

export async function fetchShift(branchId: string) {
 return fetchJson<{ shift: PosShiftSummary | null }>(
 `/api/pos/shift?branch_id=${branchId}`);
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
 notes?: string,
 actualWorkEndedAt?: string) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/pos/shift', {
 method: 'PATCH',
 body: JSON.stringify({
 shift_id: shiftId,
 closing_cash: closingCash,
 notes,
 actual_work_ended_at: actualWorkEndedAt,
 }),
 });
}

export async function fetchShiftMembers(branchId: string, shiftId?: string) {
 const params = new URLSearchParams({ branch_id: branchId });
 if (shiftId) params.set('shift_id', shiftId);
 return fetchJson<{
 shift: { id: string; shift_number: string; branch_id: string; organization_id: string } | null;
 members: PosShiftStaffMember[];
 availableStaff: PosShiftAvailableStaff[];
 }>(`/api/pos/shift-members?${params}`);
}

export async function joinPosShiftMember(payload: {
 branch_id: string;
 shift_id?: string | null;
 profile_id?: string | null;
 staff_id?: string | null;
 full_name?: string;
 role_in_shift?: PosShiftMemberRole;
 started_at?: string;
 notes?: string;
}) {
 return fetchJson<{ member: PosShiftStaffMember; alreadyActive?: boolean; requiresApproval?: boolean }>(
 '/api/pos/shift-members',
 {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function approvePosShiftMember(payload: {
 member_id: string;
 notes?: string;
}) {
 return fetchJson<{ member: PosShiftStaffMember }>('/api/pos/shift-members', {
 method: 'PATCH',
 body: JSON.stringify({ action: 'approve',...payload }),
 });
}

export async function rejectPosShiftMember(payload: {
 member_id: string;
 notes?: string;
}) {
 return fetchJson<{ member: PosShiftStaffMember }>('/api/pos/shift-members', {
 method: 'PATCH',
 body: JSON.stringify({ action: 'reject',...payload }),
 });
}

export async function endPosShiftMember(payload: {
 member_id: string;
 ended_at?: string;
 notes?: string;
}) {
 return fetchJson<{ member: PosShiftStaffMember }>('/api/pos/shift-members', {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}

export async function fetchTransactions(branchId: string, shiftId?: string) {
 const params = new URLSearchParams({ branch_id: branchId });
 if (shiftId) params.set('shift_id', shiftId);
 return fetchJson<{ transactions: PosTransactionRow[] }>(
 `/api/pos/transactions?${params}`);
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
 { method: 'POST', body: JSON.stringify({ sales }) });
}

export async function fetchBranches() {
 return fetchCachedJson<{
 branches: Array<{
 id: string;
 branch_code: string;
 branch_name: string;
 area?: string | null;
 manager_name?: string | null;
 status?: string | null;
 region_id?: string | null;
 region_name?: string | null;
 }>;
 }>('/api/branches', 5 * 60 * 1000);
}

export async function fetchStockItems() {
 return fetchCachedJson<{
 items: Array<{
 id: string;
 item_code: string;
 name: string;
 base_unit: string;
 pack_quantity?: number | null;
 conversion_text?: string | null;
 }>;
 }>('/api/inventory/stock-items', 5 * 60 * 1000);
}

export async function fetchExpiredStock(branchId: string) {
 return fetchJson<{ summary: RotiExpirySummary | null }>(
 `/api/pos/expired-stock?branch_id=${branchId}`);
}

export async function submitPosRejectStock(
 branchId: string,
 reason: string,
 items: Array<{ stock_item_id: string; quantity: number; unit?: string; production_date?: string; note?: string }>) {
 return fetchJson<{ result: Record<string, string> }>('/api/pos/reject-stock', {
 method: 'POST',
 body: JSON.stringify({ branch_id: branchId, reason, items }),
 });
}


export async function createPosQrPayment(
 payload: CreateSalePayload,
 idempotencyKey: string,
) {
 const response = await fetch('/api/pos/qr-payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
 });
 const data = await response.json();
 if (!response.ok) {
  throw new PosQrPaymentError(
   data.error ?? 'QR payment request failed',
   response.status,
   typeof data.mode === 'string' ? data.mode : null,
  );
 }
 return data as {
  payment: {
   id: string;
   status: 'PENDING' | 'PAID';
   amount_rm: number;
   qr_image_url: string | null;
   gateway_ref: string | null;
   expires_at: string | null;
   environment: 'sandbox' | 'production';
   reused: boolean;
  };
 };
}

export class PosQrPaymentError extends Error {
 constructor(
  message: string,
  readonly status: number,
  readonly mode: string | null,
 ) {
  super(message);
  this.name = 'PosQrPaymentError';
 }
}

export async function fetchPosQrPayment(paymentId: string) {
 return fetchJson<{
 payment: {
 id: string;
 status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
 amount_rm: number;
 transaction_id: string | null;
 expires_at: string | null;
 };
 result: SaleResult | null;
 }>('/api/pos/qr-payments/' + encodeURIComponent(paymentId));
}

export async function fetchPosStockSop(branchId: string) {
 return fetchJson<PosStockSopResponse>(
 `/api/pos/stock-sop?branch_id=${branchId}`);
}

export async function confirmPosStockDelivery(payload: {
 branch_id: string;
 receipt_id: string;
 items: Array<{
 receipt_item_id: string;
 stock_item_id: string;
 actual_quantity: number;
 note?: string;
 }>;
 notes?: string;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/pos/stock-sop', {
 method: 'POST',
 body: JSON.stringify({ action: 'confirm_delivery',...payload }),
 });
}

export async function submitPosStockCheck(payload: {
 branch_id: string;
 shift_id?: string | null;
 check_type: PosShiftStockCheckType;
 production_date?: string;
 notes?: string;
 items: Array<{
 stock_item_id: string;
 counted_quantity: number;
 unit?: string;
 item_code?: string;
 production_date?: string;
 }>;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/pos/stock-sop', {
 method: 'POST',
 body: JSON.stringify({ action: 'stock_check',...payload }),
 });
}

export async function startPosPresenceLeave(payload: {
 branch_id: string;
 shift_id?: string | null;
 reason: PosPresenceReason;
 notes?: string;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/pos/stock-sop', {
 method: 'POST',
 body: JSON.stringify({ action: 'leave_start',...payload }),
 });
}

export async function returnPosPresenceLeave(payload: {
 branch_id: string;
 presence_id: string;
}) {
 return fetchJson<{ result: { duration_minutes?: number; excess_minutes?: number; payroll_deductible?: boolean } }>(
 '/api/pos/stock-sop',
 {
 method: 'POST',
 body: JSON.stringify({ action: 'leave_return',...payload }),
 });
}

export async function submitPosPresenceCheck(payload: {
 branch_id: string;
 shift_id?: string | null;
 status?: 'CONFIRMED' | 'MISSED';
 prompt_reason?: string;
 prompted_at?: string;
 notes?: string;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/pos/stock-sop', {
 method: 'POST',
 body: JSON.stringify({ action: 'presence_check',...payload }),
 });
}

export async function submitPosSupplyRequest(payload: {
 branch_id: string;
 priority: 'LOW' | 'NORMAL' | 'URGENT';
 needed_by?: string;
 notes?: string;
 items: Array<{
 stock_item_id?: string;
 item_code?: string;
 item_name?: string;
 request_category?: string;
 quantity: number;
 unit?: string;
 note?: string;
 }>;
}) {
 return fetchJson<{ result: Record<string, unknown> }>('/api/pos/stock-sop', {
 method: 'POST',
 body: JSON.stringify({ action: 'supply_request',...payload }),
 });
}
