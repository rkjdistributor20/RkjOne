export type PaymentMethod = 'CASH' | 'QR' | 'MIXED';

export type StockStatus = 'OK' | 'LOW' | 'OUT';

export type PosOfficialHardwareProfile = 'SAMSUNG_TAB_S10_LITE_5G_128' | 'HONOR_PAD_X8B_LTE_256';

export interface PosDeviceManagementStatus {
 nativeApp: boolean;
 packageName: string | null;
 manufacturer: string | null;
 model: string | null;
 androidVersion: string | null;
 sdkLevel: number | null;
 deviceOwner: boolean;
 lockTaskPermitted: boolean;
 lockTaskActive: boolean;
 screenLockSecure: boolean;
 kioskRequested: boolean;
 reportedAt: string | null;
}

export interface PosDeviceContext {
 mode: 'PRODUCTION' | 'TRAINING';
 device: {
  id: string;
  deviceCode: string;
  deviceName: string;
  branchId: string;
  branchCode: string | null;
  branchName: string | null;
  lastSeenAt: string | null;
  hardwareProfile: PosOfficialHardwareProfile | null;
  management: PosDeviceManagementStatus | null;
 } | null;
 reason?: string;
}

export interface MenuStockBalance {
 key: string;
 label: string;
 itemCode: string;
 name: string;
 quantity: number;
 unit: string;
 displayQuantity: number;
 displayUnit: string;
 /** Paparan bag (mod bag_pcs) */
 displayBags?: number;
 /** Baki pcs selepas bag penuh (mod bag_pcs) */
 displayRemainderPcs?: number;
 /** pcs per bag - untuk format semula di client */
 packQuantity?: number;
 status: StockStatus;
 group: 'menu' | 'supplement';
 pendingCount?: {
 countId: string;
 countNumber: string;
 checkType: PosShiftStockCheckType | null;
 createdAt: string;
 quantity: number;
 unit: string;
 displayQuantity: number;
 displayUnit: string;
 displayBags?: number;
 displayRemainderPcs?: number;
 packQuantity?: number;
 };
}

export interface ProductStockInfo {
 available: number;
 status: StockStatus;
}

export interface CartItem {
 productId: string;
 sku: string;
 name: string;
 price: number;
 quantity: number;
 category: string | null;
}

export interface PosShiftSummary {
 id: string;
 branch_id?: string;
 organization_id?: string;
 shift_number: string;
 status: 'OPEN' | 'CLOSED';
 opening_cash: number;
 closing_cash: number | null;
 expected_cash: number | null;
 cash_variance: number | null;
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 opened_at: string;
 closed_at: string | null;
 business_started_at?: string | null;
 payroll_started_at?: string | null;
 actual_work_ended_at?: string | null;
 opening_stock_checked_at?: string | null;
 first_transaction_at?: string | null;
 sales_started_at?: string | null;
}

export type PosShiftMemberRole = 'PIC' | 'JUALAN' | 'PEMBANTU' | 'GANTI';

export interface PosShiftStaffMember {
 id: string;
 organization_id: string;
 branch_id: string;
 shift_id: string;
 profile_id: string | null;
 staff_id: string | null;
 full_name: string;
 role_in_shift: PosShiftMemberRole;
 status: 'PENDING_APPROVAL' | 'ACTIVE' | 'ENDED' | 'REJECTED';
 started_at: string;
 ended_at: string | null;
 started_by: string | null;
 ended_by: string | null;
 approved_by: string | null;
 approved_at: string | null;
 approval_notes: string | null;
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface PosShiftAvailableStaff {
 staff_id: string | null;
 profile_id: string | null;
 staff_code: string | null;
 full_name: string;
 role: string;
 branch_id: string | null;
}

export interface SaleResult {
 transaction_id: string;
 transaction_number: string;
 receipt_number: string;
 subtotal: number;
 discount: number;
 total: number;
 change_amount: number;
 payment_method?: PaymentMethod;
 cash_amount?: number;
 qr_amount?: number;
 items: Array<{
 name: string;
 sku: string;
 quantity: number;
 unit_price: number;
 line_total: number;
 }>;
}

export interface PosTransactionRow {
 id: string;
 transaction_number: string;
 status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
 subtotal: number;
 discount: number;
 total: number;
 payment_method: PaymentMethod;
 cash_amount: number;
 qr_amount: number;
 change_amount: number;
 created_at: string;
 pos_transaction_items?: Array<{
 product_name: string;
 sku: string;
 quantity: number;
 unit_price: number;
 line_total: number;
 }>;
}

export interface DailySummary {
 summary_date: string;
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 void_count: number;
 refund_count: number;
 shift_count: number;
 business_started_at?: string | null;
 payroll_started_at?: string | null;
 actual_work_ended_at?: string | null;
}

export interface OfflineSalePayload {
 offlineId: string;
 branchId: string;
 shiftId: string;
 items: Array<{ product_id: string; quantity: number }>;
 payment_method: PaymentMethod;
 cash_amount: number;
 qr_amount: number;
 discount?: number;
 created_at: string;
}

export interface OpenShiftPayload {
 branchId: string;
 openingCash: number;
}

export interface CloseShiftPayload {
 shiftId: string;
 closingCash: number;
 notes?: string;
 actualWorkEndedAt?: string;
}

export interface CreateSalePayload {
 shiftId: string;
 branchId: string;
 items: Array<{ product_id: string; quantity: number }>;
 payment_method: PaymentMethod;
 cash_amount: number;
 qr_amount: number;
 discount?: number;
 offline_id?: string;
 receipt_email?: string;
 receipt_phone?: string;
}

export interface PosStockReceiptItem {
 id: string;
 stock_item_id: string;
 expected_quantity: number;
 actual_quantity: number | null;
 variance_quantity: number | null;
 unit: string;
 production_date: string | null;
 staff_note: string | null;
 stock_item?: {
 item_code: string;
 name: string;
 category: string | null;
 base_unit?: string | null;
 conversion_text?: string | null;
 pack_quantity?: number | null;
 pack_unit?: string | null;
 } | null;
}

export interface PosStockReceipt {
 id: string;
 branch_id: string;
 location_id: string;
 route_stop_id: string | null;
 stock_transfer_id: string | null;
 status: 'DRIVER_DROPPED' | 'STAFF_CONFIRMED' | 'DISCREPANCY_PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
 receiver_name: string | null;
 driver_notes: string | null;
 staff_notes: string | null;
 manager_notes: string | null;
 delivered_at: string | null;
 staff_confirmed_at: string | null;
 manager_approved_at: string | null;
 created_at: string;
 driver?: { driver_code: string | null; full_name: string | null } | null;
 delivered_by_profile?: { full_name: string | null } | null;
 staff_profile?: { full_name: string | null } | null;
 manager_profile?: { full_name: string | null } | null;
 items?: PosStockReceiptItem[];
}

export interface PosSupplyRequest {
 id: string;
 status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED';
 request_type: string;
 priority: 'LOW' | 'NORMAL' | 'URGENT';
 needed_by: string | null;
 notes: string | null;
 items: Array<{
 stock_item_id?: string;
 item_code?: string;
 item_name?: string;
 request_category?: string;
 quantity: number;
 unit?: string;
 note?: string;
 }>;
 created_at: string;
 updated_at: string;
}

export interface PosStockCheck {
 id: string;
 count_number: string;
 status: string;
 notes: string | null;
 created_at: string;
}

export interface PosStockEstimateItem {
 stock_item_id: string;
 item_code: string;
 item_name: string;
 estimated_quantity: number;
 unit: string;
 source_counted_quantity: number;
}

export interface PosStockEstimate {
 source: 'LAST_CLOSE_SHIFT' | 'CURRENT_SYSTEM_STOCK';
 stock_count_id: string | null;
 count_number: string;
 completed_at: string | null;
 production_date: string | null;
 completed_by_name: string | null;
 items: PosStockEstimateItem[];
}

export type PosShiftStockCheckType = 'OPENING' | 'MID_SHIFT' | 'CLOSE_SHIFT';

export type PosPresenceReason = 'REST' | 'MEAL' | 'PRAYER' | 'TOILET' | 'STOCK_PICKUP' | 'OTHER';

export interface PosStaffPresenceLog {
 id: string;
 reason: PosPresenceReason;
 notes: string | null;
 status: 'OUT' | 'RETURNED';
 left_at: string;
 returned_at: string | null;
 duration_minutes: number | null;
 payroll_deductible: boolean;
 excess_minutes: number;
 minutes_now?: number;
}

export interface PosStaffPresenceCheck {
 id: string;
 check_type: 'IDLE_POS' | 'MANUAL';
 status: 'CONFIRMED' | 'MISSED';
 prompt_reason: string | null;
 prompted_at: string;
 confirmed_at: string | null;
 response_seconds: number | null;
 notes: string | null;
}

export interface PosSopStatus {
 shift_id: string | null;
 shift_opened_at: string | null;
 shift_minutes: number;
 opening_done: boolean;
 mid_shift_done: boolean;
 close_shift_done: boolean;
 mid_shift_due: boolean;
 required_stock_check: PosShiftStockCheckType | null;
 delivery_pending_count: number;
 sales_blocked: boolean;
 break_allowance_minutes: number;
 break_used_minutes: number;
 break_balance_minutes: number;
 active_leave: PosStaffPresenceLog | null;
 recent_leaves: PosStaffPresenceLog[];
 presence_check_today_count?: number;
 presence_check_missed_count?: number;
 last_presence_check?: PosStaffPresenceCheck | null;
 recent_presence_checks?: PosStaffPresenceCheck[];
}

export interface PosStockSopResponse {
 location: { id: string; name: string; branch_id: string | null; organization_id: string };
 receipts: PosStockReceipt[];
 supplyRequests: PosSupplyRequest[];
 stockChecks: PosStockCheck[];
 stockEstimate: PosStockEstimate | null;
 pendingDeliveryCount: number;
 sopStatus: PosSopStatus;
}
