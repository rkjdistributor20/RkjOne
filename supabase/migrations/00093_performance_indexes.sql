-- RKJ One performance indexes
-- Speeds up common dashboard, POS, HR, branch and agent portal filters.

CREATE INDEX IF NOT EXISTS idx_regions_org_status_code
 ON regions(organization_id, status, code);

CREATE INDEX IF NOT EXISTS idx_branches_org_status_code
 ON branches(organization_id, status, branch_code);

CREATE INDEX IF NOT EXISTS idx_branches_org_region_status
 ON branches(organization_id, region_id, status);

CREATE INDEX IF NOT EXISTS idx_profiles_org_status_role_name
 ON profiles(organization_id, status, role, full_name);

CREATE INDEX IF NOT EXISTS idx_profiles_org_branch_status
 ON profiles(organization_id, branch_id, status);

CREATE INDEX IF NOT EXISTS idx_profiles_org_region_status
 ON profiles(organization_id, region_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_org_status_code
 ON staff(organization_id, status, staff_code);

CREATE INDEX IF NOT EXISTS idx_staff_org_branch_status
 ON staff(organization_id, branch_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_org_region_status
 ON staff(organization_id, region_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_profile_status
 ON staff(profile_id, status);

CREATE INDEX IF NOT EXISTS idx_drivers_org_status_name
 ON drivers(organization_id, status, full_name);

CREATE INDEX IF NOT EXISTS idx_products_org_status_sort_name
 ON products(organization_id, status, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_products_org_category_status
 ON products(organization_id, category, status);

CREATE INDEX IF NOT EXISTS idx_stock_items_org_status_category_name
 ON stock_items(organization_id, status, category, name);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_branch_type
 ON inventory_locations(branch_id, location_type);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_org_type_active
 ON inventory_locations(organization_id, location_type, is_active);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_location_stock_quantity
 ON inventory_balances(location_id, stock_item_id, quantity);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_org_stock
 ON inventory_balances(organization_id, stock_item_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_location_created
 ON stock_movements(organization_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_transactions_org_branch_status_created
 ON pos_transactions(organization_id, branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_transactions_org_status_created
 ON pos_transactions(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_transactions_shift_status_created
 ON pos_transactions(shift_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_daily_summaries_org_date_branch
 ON pos_daily_summaries(organization_id, summary_date, branch_id);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_org_branch_status
 ON pos_shifts(organization_id, branch_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_status_period
 ON payroll_runs(organization_id, status, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status_branch
 ON approval_requests(organization_id, status, branch_id);

CREATE INDEX IF NOT EXISTS idx_sales_agent_accounts_org_active_name
 ON sales_agent_accounts(organization_id, archived_at, status, company_name);

CREATE INDEX IF NOT EXISTS idx_sales_agent_accounts_org_profile
 ON sales_agent_accounts(organization_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_agent_outlets_account_status
 ON agent_outlets(agent_account_id, status, subscription_active);

CREATE INDEX IF NOT EXISTS idx_agent_stock_orders_account_status_created
 ON agent_stock_orders(agent_account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_online_payments_account_status_created
 ON agent_online_payments(agent_account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_account_events_org_created
 ON agent_account_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_special_assignments_org_status_assigned
 ON agent_special_staff_assignments(organization_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_entities_org_status_sort
 ON legal_entities(organization_id, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_legal_entity_documents_org_status_type
 ON legal_entity_documents(organization_id, status, document_type, title);
