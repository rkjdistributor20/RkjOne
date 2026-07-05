-- RKJ One: Functions, triggers, and utility procedures
-- Migration 00010

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
 NEW.updated_at = now();
 RETURN NEW;
END;
$$;

-- Apply to tables with updated_at
DO $$
DECLARE
 t TEXT;
BEGIN
 FOR t IN
 SELECT unnest(ARRAY[
 'organizations', 'regions', 'branches', 'profiles', 'role_permissions',
 'staff', 'drivers', 'vehicles', 'products', 'stock_items', 'product_bom',
 'shift_templates', 'payroll_rules', 'commission_tiers',
 'inventory_locations', 'inventory_balances', 'stock_transfers',
 'stock_adjustments', 'stock_counts', 'pos_shifts', 'pos_transactions',
 'staff_shifts', 'attendance_records', 'payroll_runs',
 'finance_collections', 'bank_in_records', 'daily_financial_reports',
 'delivery_orders', 'delivery_legs', 'approval_requests'
 ])
 LOOP
 EXECUTE format(
 'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
 t
 );
 END LOOP;
END;
$$;

-- ============================================================
-- AUTO-CREATE PROFILE ON AUTH USER SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_org_id UUID;
 v_full_name TEXT;
 v_role user_role;
BEGIN
 SELECT id INTO v_org_id FROM organizations WHERE code = 'RKJ' LIMIT 1;

 v_full_name := COALESCE(
 NEW.raw_user_meta_data->>'full_name',
 NEW.raw_user_meta_data->>'name',
 split_part(NEW.email, '@', 1)
 );

 v_role := COALESCE(
 (NEW.raw_user_meta_data->>'role')::user_role,
 'STAFF'::user_role
 );

 INSERT INTO profiles (id, organization_id, full_name, email, role)
 VALUES (NEW.id, v_org_id, v_full_name, NEW.email, v_role);

 RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
 AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- GENERATE DOCUMENT NUMBERS
-- ============================================================

CREATE OR REPLACE FUNCTION generate_doc_number(
 p_prefix TEXT,
 p_org_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
 v_date TEXT;
 v_seq INT;
BEGIN
 v_date := to_char(now(), 'YYYYMMDD');
 v_seq := (
 SELECT COUNT(*) + 1
 FROM audit_logs
 WHERE organization_id = p_org_id
 AND created_at::date = CURRENT_DATE
 );
 RETURN p_prefix || '-' || v_date || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ============================================================
-- COMMISSION CALCULATOR
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_commission(
 p_org_id UUID,
 p_sales_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
 v_commission NUMERIC := 0;
BEGIN
 SELECT commission_amount INTO v_commission
 FROM commission_tiers
 WHERE organization_id = p_org_id
 AND status = 'ACTIVE'
 AND p_sales_amount >= tier_from
 AND (tier_to IS NULL OR p_sales_amount <= tier_to)
 ORDER BY tier_from DESC
 LIMIT 1;

 RETURN COALESCE(v_commission, 0);
END;
$$;

-- ============================================================
-- FOREIGN WORKER SHIFT PAY CALCULATOR
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_foreign_shift_pay(
 p_org_id UUID,
 p_hours NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
 v_rate NUMERIC;
BEGIN
 SELECT rate INTO v_rate
 FROM payroll_rules
 WHERE organization_id = p_org_id
 AND worker_type = 'FOREIGN'
 AND period = 'PER_SHIFT'
 AND shift_hours IS NOT NULL
 AND shift_hours <= p_hours
 AND status = 'ACTIVE'
 ORDER BY shift_hours DESC
 LIMIT 1;

 RETURN COALESCE(v_rate, 0);
END;
$$;

-- ============================================================
-- STOCK BALANCE UPDATE ON MOVEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
 v_current NUMERIC;
BEGIN
 SELECT quantity INTO v_current
 FROM inventory_balances
 WHERE location_id = NEW.location_id AND stock_item_id = NEW.stock_item_id
 FOR UPDATE;

 NEW.balance_before := COALESCE(v_current, 0);
 NEW.balance_after := NEW.balance_before + NEW.quantity;

 INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit, last_movement_at)
 VALUES (NEW.organization_id, NEW.location_id, NEW.stock_item_id, NEW.balance_after, NEW.unit, now())
 ON CONFLICT (location_id, stock_item_id)
 DO UPDATE SET
 quantity = EXCLUDED.quantity,
 last_movement_at = now(),
 updated_at = now();

 RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movement_apply_balance
 BEFORE INSERT ON stock_movements
 FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- ============================================================
-- LOW STOCK NOTIFICATION CHECK
-- ============================================================

CREATE OR REPLACE FUNCTION check_low_stock(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
 r RECORD;
 v_admin_id UUID;
BEGIN
 FOR r IN
 SELECT ib.*, si.name AS item_name, si.min_threshold, si.critical_threshold,
 il.name AS location_name
 FROM inventory_balances ib
 JOIN stock_items si ON si.id = ib.stock_item_id
 JOIN inventory_locations il ON il.id = ib.location_id
 WHERE ib.organization_id = p_org_id
 AND si.status = 'ACTIVE'
 AND (
 (si.critical_threshold IS NOT NULL AND ib.quantity <= si.critical_threshold)
 OR (si.min_threshold IS NOT NULL AND ib.quantity <= si.min_threshold)
 )
 LOOP
 FOR v_admin_id IN
 SELECT id FROM profiles
 WHERE organization_id = p_org_id
 AND role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
 AND status = 'ACTIVE'
 LOOP
 INSERT INTO notifications (organization_id, recipient_id, type, title, message)
 VALUES (
 p_org_id,
 v_admin_id,
 CASE
 WHEN r.critical_threshold IS NOT NULL AND r.quantity <= r.critical_threshold
 THEN 'CRITICAL_STOCK'::notification_type
 ELSE 'LOW_STOCK'::notification_type
 END,
 'Stok Rendah: ' || r.item_name,
 r.location_name || ' — Baki: ' || r.quantity || ' ' || r.unit
 );
 END LOOP;
 END LOOP;
END;
$$;

-- ============================================================
-- POS DAILY SUMMARY AGGREGATION
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_pos_daily_summary(
 p_org_id UUID,
 p_branch_id UUID,
 p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
 INSERT INTO pos_daily_summaries (
 organization_id, branch_id, summary_date,
 total_sales, total_cash, total_qr, transaction_count,
 void_count, refund_count
 )
 SELECT
 p_org_id,
 p_branch_id,
 p_date,
 COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total ELSE 0 END), 0),
 COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN cash_amount ELSE 0 END), 0),
 COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN qr_amount ELSE 0 END), 0),
 COUNT(*) FILTER (WHERE status = 'COMPLETED'),
 COUNT(*) FILTER (WHERE status = 'VOIDED'),
 COUNT(*) FILTER (WHERE status = 'REFUNDED')
 FROM pos_transactions
 WHERE organization_id = p_org_id
 AND branch_id = p_branch_id
 AND created_at::date = p_date
 ON CONFLICT (organization_id, branch_id, summary_date)
 DO UPDATE SET
 total_sales = EXCLUDED.total_sales,
 total_cash = EXCLUDED.total_cash,
 total_qr = EXCLUDED.total_qr,
 transaction_count = EXCLUDED.transaction_count,
 void_count = EXCLUDED.void_count,
 refund_count = EXCLUDED.refund_count,
 updated_at = now();
END;
$$;

-- ============================================================
-- DASHBOARD STATS VIEW
-- ============================================================

CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
 o.id AS organization_id,
 COALESCE((
 SELECT SUM(total_sales) FROM pos_daily_summaries pds
 WHERE pds.organization_id = o.id AND pds.summary_date = CURRENT_DATE
 ), 0) AS sales_today,
 COALESCE((
 SELECT SUM(total_sales) FROM pos_daily_summaries pds
 WHERE pds.organization_id = o.id
 AND pds.summary_date >= date_trunc('week', CURRENT_DATE)::date
 ), 0) AS sales_this_week,
 COALESCE((
 SELECT SUM(total_sales) FROM pos_daily_summaries pds
 WHERE pds.organization_id = o.id
 AND pds.summary_date >= date_trunc('month', CURRENT_DATE)::date
 ), 0) AS sales_this_month,
 (
 SELECT COUNT(*) FROM approval_requests ar
 WHERE ar.organization_id = o.id AND ar.status = 'PENDING'
 ) AS pending_approvals,
 (
 SELECT COUNT(*) FROM inventory_balances ib
 JOIN stock_items si ON si.id = ib.stock_item_id
 WHERE ib.organization_id = o.id
 AND si.critical_threshold IS NOT NULL
 AND ib.quantity <= si.critical_threshold
 ) AS critical_stock_count,
 (
 SELECT COUNT(*) FROM inventory_balances ib
 JOIN stock_items si ON si.id = ib.stock_item_id
 WHERE ib.organization_id = o.id
 AND si.min_threshold IS NOT NULL
 AND ib.quantity <= si.min_threshold
 AND (si.critical_threshold IS NULL OR ib.quantity > si.critical_threshold)
 ) AS low_stock_count,
 (
 SELECT COALESCE(SUM(amount), 0) FROM finance_collections fc
 WHERE fc.organization_id = o.id AND fc.status = 'PENDING'
 ) AS outstanding_cash
FROM organizations o
WHERE o.status = 'ACTIVE';
