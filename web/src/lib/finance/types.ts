export type CollectionType = 'QR' | 'CASH_KIOSK' | 'MANAGER' | 'THIRD_PARTY' | 'BANK_IN';
export type CollectionStatus = 'PENDING' | 'COLLECTED' | 'BANKED' | 'VERIFIED';

export interface FinanceCollection {
  id: string;
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
  amount: number;
  bank_name: string | null;
  reference_number: string | null;
  slip_url: string | null;
  banked_at: string;
  status: CollectionStatus;
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
