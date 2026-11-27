export const OPERATIONS_REPORT_VIEWS = [
 'summary', 'daily', 'shifts', 'actions', 'transactions', 'receipt',
] as const;
export const OPERATIONS_REPORT_DATA = ['operational', 'trial'] as const;
export const OPERATIONS_REPORT_TOTAL_FIELDS = [
 'recorded_sales', 'net_sales', 'cash', 'qr', 'other', 'confirmed', 'sales_count', 'shift_count', 'review_count',
] as const;

export type OperationsReportView = typeof OPERATIONS_REPORT_VIEWS[number];
export type OperationsReportData = typeof OPERATIONS_REPORT_DATA[number];
export type OperationsReportFormat = 'json' | 'csv';

export type OperationsReportParams = {
 view: OperationsReportView;
 from?: string;
 to?: string;
 branchId?: string | null;
 amId?: string | null;
 staffId?: string | null;
 shiftId?: string | null;
 transactionId?: string | null;
 data?: OperationsReportData;
 caseType?: string | null;
 page?: number;
 limit?: number;
 format?: OperationsReportFormat;
};

/** Full filtered totals, independent of the number of rows in the response. */
export type OperationsReportTotals = Record<typeof OPERATIONS_REPORT_TOTAL_FIELDS[number], number | null>;

export type OperationsReportRow = Partial<OperationsReportTotals> & {
 branch_id?: string | null;
 branch_code?: string | null;
 branch_name?: string | null;
 manager_names?: string[] | null;
 day?: string | null;
 cashier_id?: string | null;
 cashier_name?: string | null;
 shift_id?: string | null;
 shift_number?: string | null;
 planned_start?: string | null;
 planned_end?: string | null;
 opened_at?: string | null;
 closed_at?: string | null;
 shift_status?: string | null;
 cashier_started_at?: string | null;
 cashier_ended_at?: string | null;
 full_shift_net_sales?: number | null;
 full_shift_confirmed?: number | null;
 last_activity_at?: string | null;
 transaction_id?: string | null;
 transaction_number?: string | null;
 transaction_total?: number | null;
 discount_amount?: number | null;
 receipt_number?: string | null;
 sold_at?: string | null;
 payment_confirmed_at?: string | null;
 status?: string | null;
 reversed_at?: string | null;
 reversal_reason?: string | null;
 case_type?: string | null;
 case_label?: string | null;
 action_label?: string | null;
 case_at?: string | null;
 amount?: number | null;
 reference?: string | null;
 opening_float?: number | null;
 expected_cash?: number | null;
 counted_cash?: number | null;
 cash_variance?: number | null;
 other_cash_movements?: number | null;
 shift_cash_sales?: number | null;
};

export type OperationsReportFilters = {
 branches: { id: string; code: string; name: string }[];
 managers: { id: string; name: string }[];
 staff: { id: string; name: string }[];
 shifts: { id: string; number: string; branch_id: string }[];
};

export type OperationsReportReceiptItem = {
 name?: string | null;
 sku?: string | null;
 quantity?: number | null;
 unit_price?: number | null;
 line_total?: number | null;
};

export type OperationsReportReceipt = OperationsReportRow & {
 items: OperationsReportReceiptItem[];
};

/** Payload from the scoped, user-JWT RPC. No values are derived by the API. */
export type OperationsReportPayload = {
 rows: OperationsReportRow[];
 total_rows: number;
 generated_at: string;
 totals: OperationsReportTotals;
 filters: OperationsReportFilters;
 receipt?: OperationsReportReceipt | null;
 data_state?: string | null;
 settlement?: Record<string, unknown> | null;
};

export type OperationsReportResponse = OperationsReportPayload & {
 page: number;
 limit: number;
 has_more: boolean;
};
