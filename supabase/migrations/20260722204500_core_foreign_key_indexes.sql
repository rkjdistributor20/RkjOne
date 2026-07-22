-- Target the busiest operational joins first. The production tables are small
-- enough for transactional index creation, and each index supports an FK that
-- is used by POS, stock, payment, HR, or fleet workflows.
CREATE INDEX IF NOT EXISTS idx_factory_raw_cards_entity
  ON public.factory_raw_material_stock_cards (legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_factory_raw_cards_recorded_by
  ON public.factory_raw_material_stock_cards (recorded_by);

CREATE INDEX IF NOT EXISTS idx_pos_stock_deductions_transaction
  ON public.pos_stock_deductions (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_deductions_item
  ON public.pos_stock_deductions (transaction_item_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_deductions_stock
  ON public.pos_stock_deductions (stock_item_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_deductions_location
  ON public.pos_stock_deductions (location_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_deductions_movement
  ON public.pos_stock_deductions (movement_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by
  ON public.stock_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_web_vitals_profile
  ON public.performance_web_vitals (profile_id);

CREATE INDEX IF NOT EXISTS idx_hq_factory_branch_items_driver
  ON public.hq_factory_order_branch_items (assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_hq_factory_branch_items_stock
  ON public.hq_factory_order_branch_items (stock_item_id);

CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_transaction
  ON public.pos_transaction_items (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_product
  ON public.pos_transaction_items (product_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_balances_staff
  ON public.hr_leave_balances (staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_receipts_transaction
  ON public.pos_receipts (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_transaction
  ON public.pos_payments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_original
  ON public.pos_transactions (original_transaction_id);

CREATE INDEX IF NOT EXISTS idx_stock_batches_inbound_movement
  ON public.stock_batches (inbound_movement_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_org_stock
  ON public.stock_batches (organization_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_stock_item
  ON public.stock_batches (stock_item_id);
CREATE INDEX IF NOT EXISTS idx_product_bom_org
  ON public.product_bom (organization_id);
CREATE INDEX IF NOT EXISTS idx_product_bom_stock_item
  ON public.product_bom (stock_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org
  ON public.notifications (organization_id);

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_transaction
  ON public.pos_online_payments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_online_payments_shift
  ON public.pos_online_payments (shift_id);
CREATE INDEX IF NOT EXISTS idx_driver_vehicle_assignments_driver
  ON public.driver_vehicle_assignments (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_vehicle_assignments_vehicle
  ON public.driver_vehicle_assignments (vehicle_id);
