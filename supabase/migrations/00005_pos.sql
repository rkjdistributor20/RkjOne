-- RKJ One: POS — shifts, transactions, payments, receipts
-- Migration 00005

-- ============================================================
-- POS SHIFTS (open/close shift per branch)
-- ============================================================

CREATE TABLE pos_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  shift_number TEXT NOT NULL,
  staff_id UUID REFERENCES staff(id),
  opened_by UUID NOT NULL REFERENCES profiles(id),
  closed_by UUID REFERENCES profiles(id),
  status pos_shift_status NOT NULL DEFAULT 'OPEN',
  opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(12, 2),
  expected_cash NUMERIC(12, 2),
  cash_variance NUMERIC(12, 2),
  total_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_qr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, shift_number)
);

CREATE INDEX idx_pos_shifts_branch ON pos_shifts(branch_id);
CREATE INDEX idx_pos_shifts_status ON pos_shifts(status);
CREATE INDEX idx_pos_shifts_opened ON pos_shifts(opened_at DESC);

-- Only one open shift per branch
CREATE UNIQUE INDEX idx_pos_shifts_one_open
  ON pos_shifts(branch_id)
  WHERE status = 'OPEN';

-- ============================================================
-- POS TRANSACTIONS
-- ============================================================

CREATE TABLE pos_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  shift_id UUID NOT NULL REFERENCES pos_shifts(id),
  transaction_number TEXT NOT NULL,
  status pos_tx_status NOT NULL DEFAULT 'COMPLETED',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL,
  cash_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  qr_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  void_reason TEXT,
  voided_by UUID REFERENCES profiles(id),
  voided_at TIMESTAMPTZ,
  refund_reason TEXT,
  refunded_by UUID REFERENCES profiles(id),
  refunded_at TIMESTAMPTZ,
  original_transaction_id UUID REFERENCES pos_transactions(id),
  receipt_sent BOOLEAN NOT NULL DEFAULT false,
  receipt_email TEXT,
  receipt_phone TEXT,
  offline_id TEXT, -- for offline POS sync
  synced_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transaction_number)
);

CREATE INDEX idx_pos_tx_branch ON pos_transactions(branch_id);
CREATE INDEX idx_pos_tx_shift ON pos_transactions(shift_id);
CREATE INDEX idx_pos_tx_created ON pos_transactions(created_at DESC);
CREATE INDEX idx_pos_tx_status ON pos_transactions(status);
CREATE INDEX idx_pos_tx_offline ON pos_transactions(offline_id) WHERE offline_id IS NOT NULL;

CREATE TABLE pos_transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BOM deduction log per sale
CREATE TABLE pos_stock_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  transaction_item_id UUID REFERENCES pos_transaction_items(id),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL,
  unit stock_unit NOT NULL,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  movement_id UUID REFERENCES stock_movements(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- POS PAYMENTS (split for mixed payment)
-- ============================================================

CREATE TABLE pos_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DIGITAL RECEIPTS
-- ============================================================

CREATE TABLE pos_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  receipt_data JSONB NOT NULL,
  pdf_url TEXT,
  sent_via TEXT,
  sent_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DAILY POS SUMMARY (aggregated per branch per day)
-- ============================================================

CREATE TABLE pos_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  summary_date DATE NOT NULL,
  total_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_qr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0,
  void_count INT NOT NULL DEFAULT 0,
  refund_count INT NOT NULL DEFAULT 0,
  shift_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, summary_date)
);

CREATE INDEX idx_pos_daily_branch_date ON pos_daily_summaries(branch_id, summary_date DESC);
