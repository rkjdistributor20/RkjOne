export type PaymentMethod = 'CASH' | 'QR' | 'MIXED';

export type StockStatus = 'OK' | 'LOW' | 'OUT';

export interface MenuStockBalance {
  key: string;
  label: string;
  itemCode: string;
  name: string;
  quantity: number;
  unit: string;
  displayQuantity: number;
  displayUnit: string;
  status: StockStatus;
  group: 'menu' | 'supplement';
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
}

export interface SaleResult {
  transaction_id: string;
  transaction_number: string;
  receipt_number: string;
  subtotal: number;
  discount: number;
  total: number;
  change_amount: number;
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
