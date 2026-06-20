export interface ReportOverview {
  period_start: string;
  period_end: string;
  total_sales: number;
  total_cash: number;
  total_qr: number;
  transaction_count: number;
  void_count: number;
  refund_count: number;
  deliveries_pending: number;
  deliveries_completed: number;
  payroll_runs: number;
  payroll_net: number;
  low_stock_count: number;
  outstanding_cash: number;
}

export interface SalesTrendRow {
  period: string;
  total_sales: number;
  total_cash: number;
  total_qr: number;
  transaction_count: number;
}

export interface BranchPerformanceRow {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  region_name: string | null;
  total_sales: number;
  transaction_count: number;
  total_cash: number;
  total_qr: number;
}

export interface ProductPerformanceRow {
  product_name: string;
  sku: string;
  quantity_sold: number;
  revenue: number;
}

export interface StaffPerformanceRow {
  staff_id: string;
  staff_code: string;
  full_name: string;
  branch_name: string | null;
  total_sales: number;
  shift_count: number;
}

export interface InventoryReportRow {
  item_code: string;
  name: string;
  location_name: string;
  quantity: number;
  unit: string;
  status: 'OK' | 'LOW' | 'CRITICAL';
}

export interface FleetReportSummary {
  pending: number;
  in_transit: number;
  delivered: number;
  total_orders: number;
}
