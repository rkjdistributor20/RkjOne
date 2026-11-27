import type { MovementType } from './filters';

export interface ReportScope {
 branches: Array<{ id: string; code: string; name: string }>;
 organization_wide: boolean;
}

export interface CollectionTotals {
 total_cash: number;
 total_qr: number;
 pending_qr: number;
 unverified_qr: number;
}

export interface ReportOverview extends CollectionTotals {
 period_start: string;
 period_end: string;
 organization_wide: boolean;
 total_sales: number;
 transaction_count: number;
 void_count: number;
 refund_count: number;
 deliveries_pending?: number;
 deliveries_completed?: number;
 payroll_runs?: number;
 payroll_net?: number;
 low_stock_count: number;
 outstanding_cash?: number;
}

export interface SalesTrendRow extends CollectionTotals {
 period: string;
 total_sales: number;
 transaction_count: number;
}

export interface BranchPerformanceRow extends CollectionTotals {
 branch_id: string;
 branch_code: string;
 branch_name: string;
 region_name: string | null;
 total_sales: number;
 transaction_count: number;
}

export interface ProductPerformanceRow {
 product_name: string;
 sku: string;
 quantity_sold: number;
 revenue: number;
}

export interface StaffPerformanceRow {
 branch_id: string;
 branch_name: string;
 cashier_id: string;
 cashier_name: string | null;
 shift_id: string;
 shift_number: string | null;
 opened_at: string | null;
 closed_at: string | null;
 total_sales: number;
 transaction_count: number;
}

export interface InventoryReportRow {
 id: string;
 branch_id: string | null;
 branch_name: string | null;
 item_code: string;
 name: string;
 location_name: string;
 quantity: number;
 unit: string;
 status: 'OK' | 'LOW' | 'CRITICAL';
}

export interface MovementReportRow extends Omit<InventoryReportRow, 'status'> {
 movement_type: MovementType;
 balance_before: number | null;
 balance_after: number | null;
 reference_type: string | null;
 reference_id: string | null;
 created_by: string | null;
 actor_name: string | null;
 created_at: string;
}

export interface ReportTransaction {
 id: string;
 branch_name: string;
 branch_code: string;
 cashier_id: string;
 cashier_name: string | null;
 shift_id: string;
 shift_number: string | null;
 transaction_number: string;
 receipt_number: string | null;
 status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
 sold_at: string;
 payment_method: 'CASH' | 'QR' | 'MIXED';
 total: number;
 cash: number;
 qr_confirmed: number;
 qr_pending: number;
 qr_unverified: number;
}

export interface ReportReceipt extends ReportTransaction {
 items: Array<{ name: string; sku: string; quantity: number; unit_price: number; line_total: number }>;
}

export interface ReportPaymentAttempt {
 id: string;
 branch_name: string;
 shift_id: string;
 shift_number: string;
 cashier_id: string | null;
 cashier_name: string | null;
 created_at: string;
 amount_rm: number;
 status: 'PENDING' | 'REPORTED' | 'QUARANTINED' | 'PAID';
}

export interface ReportPage {
 has_more: boolean;
}

export interface FleetReportSummary {
 pending: number;
 in_transit: number;
 delivered: number;
 total_orders: number;
}
