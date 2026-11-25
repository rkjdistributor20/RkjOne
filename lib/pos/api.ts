import type { RotiExpirySummary } from '@/lib/stock/expiry';
import { ClientJsonError, fetchJson } from '../client/fetch-json';
import type {
 CreateSalePayload,
 DailySummary,
 MenuStockBalance,
 OfflineSalePayload,
 PosPresenceReason,
 PosQrConfig,
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
 PosFiuuVtAppStatus,
 SaleResult,
} from './types';
import type { Product } from '@/types/database';
import type { FiuuVtOperation } from '@/lib/pos/fiuu-vt';

export type FiuuVtActiveOperation = {
 id: string;
 callbackHost: string;
 expiresAt: string;
 opType: FiuuVtOperation;
 state: string;
 generation: number;
};

export type FiuuVtRetryLimitReason =
 | 'PAYMENT_EXPIRED'
 | 'STATUS_ATTEMPT_BUDGET_EXHAUSTED';

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

function parseFiuuVtRetryLimitReason(input: unknown): FiuuVtRetryLimitReason | null {
 if (!input || typeof input !== 'object' || Array.isArray(input) || !('reason' in input)) {
  return null;
 }
 const reason = input.reason;
 return reason === 'PAYMENT_EXPIRED' || reason === 'STATUS_ATTEMPT_BUDGET_EXHAUSTED'
  ? reason
  : null;
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

export async function syncPosDeviceFiuuVtStatus(
 status: Omit<PosFiuuVtAppStatus, 'reportedAt'>,
) {
 return fetchJson<{ success: true; fiuuVt: PosFiuuVtAppStatus }>('/api/pos/device', {
  method: 'PUT',
  body: JSON.stringify({ fiuu_vt_status: status }),
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

export async function fetchShiftMembers(branchId: string, shiftId?: string, signal?: AbortSignal) {
 const params = new URLSearchParams({ branch_id: branchId });
 if (shiftId) params.set('shift_id', shiftId);
 return fetchJson<{
 shift: { id: string; shift_number: string; branch_id: string; organization_id: string } | null;
 members: PosShiftStaffMember[];
 availableStaff: PosShiftAvailableStaff[];
  viewerProfileId: string;
 }>(`/api/pos/shift-members?${params}`, { cache: 'no-store', signal }, { dedupe: false });
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
 return fetchJson<{
  result: SaleResult;
  manual_payment_review: Record<string, unknown> | null;
  manual_payment_review_error: string | null;
 }>('/api/pos/transactions', {
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
 try {
  return await fetchJson<{
   reused_reason?: 'IDEMPOTENCY_KEY_REUSED' | 'FIUU_ACTIVE_ATTEMPT_EXISTS';
   payment: {
    id: string;
    status: 'PENDING' | 'REPORTED' | 'PAID';
    amount_rm: number;
    qr_image_url: string | null;
    gateway_ref: string | null;
    expires_at: string | null;
    environment: 'sandbox' | 'production';
    integration: 'opa' | 'vt_app' | 'cloudecr';
    provider_order_id: string | null;
    reused: boolean;
   };
  }>('/api/pos/qr-payments', {
   method: 'POST',
   body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   const retryAfterMs =
    typeof data === 'object' && data !== null
     && 'retry_after_ms' in data && typeof data.retry_after_ms === 'number'
     && Number.isFinite(data.retry_after_ms)
     ? Math.max(0, Math.min(30_000, Math.ceil(data.retry_after_ms)))
     : null;
   throw new PosQrPaymentError(error.message, error.status, mode, retryAfterMs);
  }
  throw error;
 }
}

export async function submitFiuuVtResult(
 paymentId: string,
 result: unknown,
) {
 try {
  return await fetchJson<{
   payment: { id: string; status: 'PENDING' | 'REPORTED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' };
   next_action: 'CHECK_STATUS' | 'CHECK_STATUS_LATER' | 'PARK_AVAILABLE' | 'AUTO_CONFIRMATION' | 'COMPLETE' | 'ACK_ONLY' | 'ACK_AND_QUARANTINE';
   warning?: string;
  }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-result`, {
   method: 'POST',
   body: JSON.stringify({ result }),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   const retryAfterMs =
    typeof data === 'object' && data !== null
     && 'retry_after_ms' in data && typeof data.retry_after_ms === 'number'
     && Number.isFinite(data.retry_after_ms)
     ? Math.max(0, Math.min(30_000, Math.ceil(data.retry_after_ms)))
     : null;
   throw new PosQrPaymentError(error.message, error.status, mode, retryAfterMs);
  }
  throw error;
 }
}

export async function createFiuuVtAttempt(
 paymentId: string,
 opType: FiuuVtOperation,
) {
 try {
  return await fetchJson<{
   attempt: {
    id: string;
    callback_host: string;
    expires_at: string;
    op_type: FiuuVtOperation;
    lease_generation: number;
   };
   reused?: boolean;
   retry_lease?: {
    generation: number;
    expires_at: string;
   };
  }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-attempt`, {
   method: 'POST',
   body: JSON.stringify({ op_type: opType }),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   const retryAfterMs =
    typeof data === 'object' && data !== null
     && 'retry_after_ms' in data && typeof data.retry_after_ms === 'number'
     && Number.isFinite(data.retry_after_ms)
     ? Math.max(0, Math.min(30_000, Math.ceil(data.retry_after_ms)))
     : null;
   const reason = parseFiuuVtRetryLimitReason(data);
   const rawActiveOperation = typeof data === 'object' && data !== null
    && 'active_operation' in data
    && typeof data.active_operation === 'object'
    && data.active_operation !== null
    && !Array.isArray(data.active_operation)
    ? data.active_operation
    : null;
   const activeId = rawActiveOperation && 'id' in rawActiveOperation
    ? rawActiveOperation.id
    : null;
   const activeCallbackHost = rawActiveOperation && 'callback_host' in rawActiveOperation
    ? rawActiveOperation.callback_host
    : null;
   const activeExpiresAt = rawActiveOperation && 'expires_at' in rawActiveOperation
    ? rawActiveOperation.expires_at
    : null;
   const activeOpType = rawActiveOperation && 'op_type' in rawActiveOperation
    ? rawActiveOperation.op_type
    : null;
   const activeState = rawActiveOperation && 'state' in rawActiveOperation
    ? rawActiveOperation.state
    : null;
   const activeGeneration = rawActiveOperation && 'lease_generation' in rawActiveOperation
    ? rawActiveOperation.lease_generation
    : null;
   const activeOperation: FiuuVtActiveOperation | null =
    typeof activeId === 'string'
    && typeof activeCallbackHost === 'string'
    && typeof activeExpiresAt === 'string'
    && Number.isFinite(Date.parse(activeExpiresAt))
    && (activeOpType === 'SALE' || activeOpType === 'STATUS' || activeOpType === 'VOID')
    && typeof activeState === 'string'
    && Number.isInteger(activeGeneration)
    && Number(activeGeneration) >= 0
     ? {
      id: activeId,
      callbackHost: activeCallbackHost,
      expiresAt: activeExpiresAt,
      opType: activeOpType,
      state: activeState,
      generation: Number(activeGeneration),
     }
     : null;
   throw new PosQrPaymentError(
    error.message,
    error.status,
    mode,
    retryAfterMs,
    activeOperation,
    reason,
   );
  }
  throw error;
 }
}

async function updateFiuuVtAttempt(
 paymentId: string,
 payload: {
  action: 'MARK_LAUNCHED' | 'ABANDON_UNLAUNCHED';
  attempt_id: string;
  error_code?: string;
 },
) {
 try {
  return await fetchJson<{
   attempt: {
    id: string;
    state: string;
    op_type: FiuuVtOperation;
    launched_at: string | null;
    abandoned_at: string | null;
    launch_error_code: string | null;
   };
   reused?: boolean;
  }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-attempt`, {
   method: 'PATCH',
   body: JSON.stringify(payload),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   throw new PosQrPaymentError(error.message, error.status, mode);
  }
  throw error;
 }
}

export async function markFiuuVtAttemptLaunched(paymentId: string, attemptId: string) {
 return updateFiuuVtAttempt(paymentId, {
  action: 'MARK_LAUNCHED',
  attempt_id: attemptId,
 });
}

export async function abandonUnlaunchedFiuuVtAttempt(
 paymentId: string,
 attemptId: string,
 errorCode: string,
) {
 return updateFiuuVtAttempt(paymentId, {
  action: 'ABANDON_UNLAUNCHED',
  attempt_id: attemptId,
  error_code: errorCode,
 });
}

export async function cancelUnlaunchedFiuuVtPayment(
 paymentId: string,
 attemptId: string,
 errorCode: string,
) {
 try {
  return await fetchJson<{
   payment: { id: string; status: 'CANCELLED' };
   reused?: boolean;
  }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-prelaunch-cancel`, {
   method: 'POST',
   body: JSON.stringify({
    attempt_id: attemptId,
    error_code: errorCode,
   }),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   throw new PosQrPaymentError(error.message, error.status, mode);
  }
  throw error;
 }
}

export async function releaseFiuuVtCashierAfterVoidLaunch(
 paymentId: string,
 attemptId: string,
) {
 try {
  return await fetchJson<{
   outcome: 'RELEASED' | 'TERMINAL';
   payment: {
    id: string;
    status: string;
    cancellation_phase: 'CANCEL_REQUESTED' | 'CANCELLED_CONFIRMED' | 'TERMINAL';
    cancel_requested_at?: string | null;
    cashier_released_at?: string | null;
   };
   reused?: boolean;
  }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-cashier-release`, {
   method: 'POST',
   body: JSON.stringify({ attempt_id: attemptId }),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   throw new PosQrPaymentError(error.message, error.status, mode);
  }
  throw error;
 }
}

export async function parkFiuuVtProviderErrorPayment(
 paymentId: string,
 reason:
  | 'PROVIDER_STATUS_ERROR'
  | 'NATIVE_CALLBACK_REGISTRY'
  | 'STATUS_RETRY_LIMIT' = 'PROVIDER_STATUS_ERROR',
) {
 try {
  return await fetchJson<{
   payment: {
    id: string;
    status: 'QUARANTINED';
    fiuu_vt_review_required: true;
    fiuu_vt_reconciliation_state: 'PROVIDER_ERROR_REVIEW';
   };
   reused?: boolean;
   warning?: string;
  }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-park`, {
   method: 'POST',
   body: JSON.stringify({ reason }),
  });
 } catch (error) {
  if (error instanceof ClientJsonError) {
   const data = error.data;
   const mode =
    typeof data === 'object' && data !== null && 'mode' in data && typeof data.mode === 'string'
     ? data.mode
     : null;
   const retryAfterMs =
    typeof data === 'object' && data !== null
     && 'retry_after_ms' in data && typeof data.retry_after_ms === 'number'
     && Number.isFinite(data.retry_after_ms)
     ? Math.max(0, Math.min(30_000, Math.ceil(data.retry_after_ms)))
     : null;
   throw new PosQrPaymentError(error.message, error.status, mode, retryAfterMs);
  }
  throw error;
 }
}

export async function confirmFiuuVtPayment(paymentId: string) {
 return fetchJson<{
  payment: { id: string; status: 'PAID' };
  result?: SaleResult;
  reused?: boolean;
 }>(`/api/pos/qr-payments/${encodeURIComponent(paymentId)}/vt-confirm`, {
  method: 'POST',
  body: JSON.stringify({ confirm: true }),
 });
}

export async function fetchPosQrConfig(branchId: string) {
 return fetchJson<PosQrConfig>(
  `/api/pos/qr-config?branch_id=${encodeURIComponent(branchId)}`,
  { cache: 'no-store' },
 );
}

export class PosQrPaymentError extends Error {
 constructor(
  message: string,
  readonly status: number,
  readonly mode: string | null,
  readonly retryAfterMs: number | null = null,
  readonly activeOperation: FiuuVtActiveOperation | null = null,
  readonly reason: FiuuVtRetryLimitReason | null = null,
 ) {
  super(message);
  this.name = 'PosQrPaymentError';
 }
}

export async function fetchPosQrPayment(paymentId: string) {
 return fetchJson<{
 payment: {
 id: string;
  branch_id: string;
  shift_id: string;
  provider: 'fiuu' | 'fiuu_vt' | 'fiuu_cloudecr';
  provider_order_id: string | null;
  status: 'PENDING' | 'REPORTED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'QUARANTINED';
 amount_rm: number;
 transaction_id: string | null;
 expires_at: string | null;
  reconciliation_expired: boolean;
  fiuu_vt_review_required: boolean;
  fiuu_vt_reconciliation_state: string | null;
  fiuu_vt_cancel_requested_at: string | null;
  fiuu_vt_cashier_released_at: string | null;
  cancellation_phase: 'NONE' | 'CANCEL_REQUESTED' | 'CANCELLED_CONFIRMED' | 'TERMINAL';
  cart_fingerprint: string | null;
 };
 result: SaleResult | null;
 }>('/api/pos/qr-payments/' + encodeURIComponent(paymentId), {
  cache: 'no-store',
 });
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
