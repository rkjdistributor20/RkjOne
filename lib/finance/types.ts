export type CollectionType = 'QR' | 'CASH_KIOSK' | 'MANAGER' | 'THIRD_PARTY' | 'BANK_IN';
export type CollectionStatus = 'PENDING' | 'COLLECTED' | 'BANKED' | 'VERIFIED';
export type CashUsageType = 'BRANCH_NECESSITY' | 'FUEL_DIESEL' | 'TRANSPORT_MAINTENANCE';
export type CashUsageStatus = 'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED';

export interface FinanceCollection {
 id: string;
 branch_id: string | null;
 collection_number: string;
 collection_type: CollectionType;
 amount: number;
 status: CollectionStatus;
 collected_from: string | null;
 collector_name: string | null;
 third_party_name: string | null;
 collected_at: string | null;
 created_at: string;
 branch: { branch_name: string; branch_code: string } | null;
}

export interface BankInRecord {
 id: string;
 bank_in_number: string;
 collection_id?: string | null;
 amount: number;
 bank_name: string | null;
 reference_number: string | null;
 slip_url: string | null;
 banked_at: string;
 status: CollectionStatus;
 collection?: {
 branch_id: string | null;
 collection_number: string;
 branch: { branch_name: string; branch_code: string } | null;
 } | null;
}

export interface CollectionCashUsage {
 id: string;
 collection_id: string;
 branch_id: string;
 supply_request_id: string | null;
 usage_number: string;
 usage_type: CashUsageType;
 amount: number;
 description: string;
 proof_url: string | null;
 receipt_number: string | null;
 vehicle_reference: string | null;
 vendor_name: string | null;
 spent_at: string;
 status: CashUsageStatus;
 reviewed_at: string | null;
 review_notes: string | null;
 created_at: string;
 branch: { branch_name: string; branch_code: string } | null;
 collection: { collection_number: string; amount: number; status: CollectionStatus } | null;
}

export interface BranchSupplyRequest {
 id: string;
 branch_id: string;
 status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED';
 request_type: string;
 priority: 'LOW' | 'NORMAL' | 'URGENT';
 needed_by: string | null;
 notes: string | null;
 items: unknown[];
 created_at: string;
 branch: { branch_name: string; branch_code: string } | null;
}

export interface CashReconciliation {
 id: string;
 reconciliation_number: string;
 reconciliation_date: string;
 expected_cash: number;
 actual_cash: number;
 variance: number;
 status: string;
 notes: string | null;
 branch: { branch_name: string };
}

export interface DailyFinancialReport {
 id: string;
 report_date: string;
 total_qr: number;
 total_cash_collected: number;
 total_banked: number;
 total_verified: number;
 outstanding_cash: number;
 branch: { branch_name: string } | null;
}

export interface ManualQrPayment {
 id: string;
 amount_rm: number;
 status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
 provider: string;
 gateway_ref: string | null;
 paid_at: string | null;
 failed_at: string | null;
 created_at: string;
 transaction_id: string | null;
 sale_payload: Record<string, unknown> | null;
 branch: { branch_name: string; branch_code: string } | null;
 transaction: {
 transaction_number: string;
 total: number;
 payment_method: string;
 created_at: string;
 } | null;
}

export interface FinanceSummary {
 pending_collections: number;
 collected_today: number;
 banked_today: number;
 pending_reconciliations: number;
 outstanding_cash: number;
}

export const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
 QR: 'QR Payment',
 CASH_KIOSK: 'Cash (Kiosk)',
 MANAGER: 'Manager Collection',
 THIRD_PARTY: 'Third Party',
 BANK_IN: 'Bank In',
};

export const CASH_USAGE_TYPE_LABELS: Record<CashUsageType, string> = {
 BRANCH_NECESSITY: 'Barang keperluan cawangan',
 FUEL_DIESEL: 'Petrol / diesel AM',
 TRANSPORT_MAINTENANCE: 'Service / maintenance transport',
};

export const CASH_USAGE_STATUS_LABELS: Record<CashUsageStatus, string> = {
 PENDING_REVIEW: 'Menunggu semakan',
 ACCEPTED: 'Diterima',
 REJECTED: 'Ditolak',
};
