-- RKJ One: Row Level Security policies
-- Migration 00009

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_flow_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_write_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_write_off_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receives ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_stock_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_in_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_financial_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_leg_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_of_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================

CREATE OR REPLACE FUNCTION auth.organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth.user_region_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT region_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth.user_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('SUPER_ADMIN', 'ADMIN')
  )
$$;

CREATE OR REPLACE FUNCTION auth.has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (
      p.role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY')
      OR p.branch_id = p_branch_id
      OR EXISTS (
        SELECT 1 FROM profile_branch_access pba
        WHERE pba.profile_id = p.id AND pba.branch_id = p_branch_id
      )
      OR (
        p.role = 'AREA_MANAGER'
        AND EXISTS (
          SELECT 1 FROM branches b
          WHERE b.id = p_branch_id AND b.region_id = p.region_id
        )
      )
    )
  )
$$;

-- ============================================================
-- PROFILES: users can read own profile; admins read all in org
-- ============================================================

CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR (organization_id = auth.organization_id() AND auth.is_admin())
  );

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_all ON profiles
  FOR ALL USING (
    organization_id = auth.organization_id() AND auth.is_admin()
  );

-- ============================================================
-- GENERIC ORG-SCOPED READ for master data
-- ============================================================

CREATE POLICY org_read_branches ON branches
  FOR SELECT USING (organization_id = auth.organization_id());

CREATE POLICY org_read_products ON products
  FOR SELECT USING (organization_id = auth.organization_id());

CREATE POLICY org_read_stock_items ON stock_items
  FOR SELECT USING (organization_id = auth.organization_id());

CREATE POLICY org_admin_products ON products
  FOR ALL USING (
    organization_id = auth.organization_id()
    AND auth.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  );

CREATE POLICY org_admin_stock_items ON stock_items
  FOR ALL USING (
    organization_id = auth.organization_id()
    AND auth.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY')
  );

-- ============================================================
-- POS: branch-scoped access
-- ============================================================

CREATE POLICY pos_shifts_branch ON pos_shifts
  FOR ALL USING (
    organization_id = auth.organization_id()
    AND auth.has_branch_access(branch_id)
  );

CREATE POLICY pos_transactions_branch ON pos_transactions
  FOR ALL USING (
    organization_id = auth.organization_id()
    AND auth.has_branch_access(branch_id)
  );

CREATE POLICY pos_tx_items_via_tx ON pos_transaction_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pos_transactions t
      WHERE t.id = transaction_id
      AND t.organization_id = auth.organization_id()
      AND auth.has_branch_access(t.branch_id)
    )
  );

-- ============================================================
-- NOTIFICATIONS: own only
-- ============================================================

CREATE POLICY notifications_own ON notifications
  FOR ALL USING (recipient_id = auth.uid());

-- ============================================================
-- APPROVALS: assigned or admin
-- ============================================================

CREATE POLICY approvals_access ON approval_requests
  FOR SELECT USING (
    organization_id = auth.organization_id()
    AND (
      auth.is_admin()
      OR requested_by = auth.uid()
      OR assigned_to = auth.uid()
      OR (branch_id IS NOT NULL AND auth.has_branch_access(branch_id))
    )
  );

-- ============================================================
-- INVENTORY: org scoped with role checks via API layer
-- ============================================================

CREATE POLICY inventory_org ON inventory_locations
  FOR SELECT USING (organization_id = auth.organization_id());

CREATE POLICY inventory_balances_org ON inventory_balances
  FOR SELECT USING (organization_id = auth.organization_id());

CREATE POLICY stock_movements_org ON stock_movements
  FOR SELECT USING (organization_id = auth.organization_id());

-- ============================================================
-- DELIVERY: drivers see own deliveries
-- ============================================================

CREATE POLICY delivery_legs_driver ON delivery_legs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery_orders d
      JOIN drivers dr ON dr.id = delivery_legs.driver_id
      WHERE d.id = delivery_order_id
      AND d.organization_id = auth.organization_id()
      AND (
        auth.is_admin()
        OR dr.profile_id = auth.uid()
        OR auth.user_role() = 'OPERATION_MANAGER'
      )
    )
  );

-- Service role bypass (for API routes using service key)
-- Note: service_role key bypasses RLS by default in Supabase
