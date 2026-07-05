-- RKJ One: Shift management, payroll, finance
-- Migration 00006

-- ============================================================
-- STAFF SHIFTS (flexible shift scheduling)
-- ============================================================

CREATE TABLE staff_shifts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 staff_id UUID NOT NULL REFERENCES staff(id),
 branch_id UUID NOT NULL REFERENCES branches(id),
 template_id UUID REFERENCES shift_templates(id),
 shift_date DATE NOT NULL,
 scheduled_start TIME,
 scheduled_end TIME,
 actual_start TIMESTAMPTZ,
 actual_end TIMESTAMPTZ,
 scheduled_hours NUMERIC(4, 2),
 actual_hours NUMERIC(4, 2),
 ot_hours NUMERIC(4, 2) NOT NULL DEFAULT 0,
 status approval_status NOT NULL DEFAULT 'PENDING',
 approved_by UUID REFERENCES profiles(id),
 approved_at TIMESTAMPTZ,
 notes TEXT,
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_shifts_staff ON staff_shifts(staff_id);
CREATE INDEX idx_staff_shifts_branch ON staff_shifts(branch_id);
CREATE INDEX idx_staff_shifts_date ON staff_shifts(shift_date DESC);
CREATE INDEX idx_staff_shifts_status ON staff_shifts(status);

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

CREATE TABLE attendance_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 staff_id UUID NOT NULL REFERENCES staff(id),
 staff_shift_id UUID REFERENCES staff_shifts(id),
 branch_id UUID NOT NULL REFERENCES branches(id),
 attendance_date DATE NOT NULL,
 clock_in TIMESTAMPTZ,
 clock_out TIMESTAMPTZ,
 hours_worked NUMERIC(4, 2),
 ot_hours NUMERIC(4, 2) NOT NULL DEFAULT 0,
 is_late BOOLEAN NOT NULL DEFAULT false,
 is_absent BOOLEAN NOT NULL DEFAULT false,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (staff_id, attendance_date)
);

CREATE INDEX idx_attendance_staff ON attendance_records(staff_id);
CREATE INDEX idx_attendance_date ON attendance_records(attendance_date DESC);

-- ============================================================
-- PAYROLL RUNS
-- ============================================================

CREATE TABLE payroll_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 run_number TEXT NOT NULL,
 period_start DATE NOT NULL,
 period_end DATE NOT NULL,
 status approval_status NOT NULL DEFAULT 'PENDING',
 total_gross NUMERIC(12, 2) NOT NULL DEFAULT 0,
 total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
 total_net NUMERIC(12, 2) NOT NULL DEFAULT 0,
 approved_by UUID REFERENCES profiles(id),
 processed_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, run_number)
);

CREATE TABLE payroll_line_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
 staff_id UUID NOT NULL REFERENCES staff(id),
 worker_type worker_type NOT NULL,
 basic_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
 attendance_allowance NUMERIC(10, 2) NOT NULL DEFAULT 0,
 shift_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
 ot_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
 commission NUMERIC(10, 2) NOT NULL DEFAULT 0,
 contract_bonus NUMERIC(10, 2) NOT NULL DEFAULT 0,
 epf NUMERIC(10, 2) NOT NULL DEFAULT 0,
 socso NUMERIC(10, 2) NOT NULL DEFAULT 0,
 eis NUMERIC(10, 2) NOT NULL DEFAULT 0,
 gross_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
 net_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
 sales_total NUMERIC(12, 2), -- for commission calculation
 hours_worked NUMERIC(6, 2),
 ot_hours NUMERIC(6, 2),
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- FINANCE COLLECTIONS
-- ============================================================

CREATE TABLE finance_collections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 collection_number TEXT NOT NULL,
 collection_type collection_type NOT NULL,
 branch_id UUID REFERENCES branches(id),
 shift_id UUID REFERENCES pos_shifts(id),
 amount NUMERIC(12, 2) NOT NULL,
 status collection_status NOT NULL DEFAULT 'PENDING',
 collected_from TEXT,
 collected_by UUID REFERENCES profiles(id),
 collected_at TIMESTAMPTZ,
 collector_name TEXT,
 third_party_name TEXT,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, collection_number)
);

CREATE INDEX idx_finance_collections_branch ON finance_collections(branch_id);
CREATE INDEX idx_finance_collections_status ON finance_collections(status);
CREATE INDEX idx_finance_collections_type ON finance_collections(collection_type);

-- ============================================================
-- BANK IN RECORDS
-- ============================================================

CREATE TABLE bank_in_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 bank_in_number TEXT NOT NULL,
 collection_id UUID REFERENCES finance_collections(id),
 amount NUMERIC(12, 2) NOT NULL,
 bank_name TEXT,
 reference_number TEXT,
 slip_url TEXT,
 banked_at TIMESTAMPTZ NOT NULL,
 banked_by UUID REFERENCES profiles(id),
 status collection_status NOT NULL DEFAULT 'BANKED',
 verified_by UUID REFERENCES profiles(id),
 verified_at TIMESTAMPTZ,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, bank_in_number)
);

-- ============================================================
-- CASH RECONCILIATION
-- ============================================================

CREATE TABLE cash_reconciliations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 reconciliation_number TEXT NOT NULL,
 branch_id UUID NOT NULL REFERENCES branches(id),
 reconciliation_date DATE NOT NULL,
 expected_cash NUMERIC(12, 2) NOT NULL,
 actual_cash NUMERIC(12, 2) NOT NULL,
 variance NUMERIC(12, 2) GENERATED ALWAYS AS (actual_cash - expected_cash) STORED,
 status approval_status NOT NULL DEFAULT 'PENDING',
 notes TEXT,
 reconciled_by UUID REFERENCES profiles(id),
 approved_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, reconciliation_number)
);

-- ============================================================
-- DAILY FINANCIAL REPORTS
-- ============================================================

CREATE TABLE daily_financial_reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 report_date DATE NOT NULL,
 branch_id UUID REFERENCES branches(id), -- NULL = org-wide
 total_qr NUMERIC(12, 2) NOT NULL DEFAULT 0,
 total_cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
 total_banked NUMERIC(12, 2) NOT NULL DEFAULT 0,
 total_verified NUMERIC(12, 2) NOT NULL DEFAULT 0,
 outstanding_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
 report_data JSONB NOT NULL DEFAULT '{}',
 generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, report_date, branch_id)
);

CREATE INDEX idx_daily_financial_date ON daily_financial_reports(report_date DESC);
