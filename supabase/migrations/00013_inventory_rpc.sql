-- RKJ One: Inventory RPC functions
-- Migration 00013

CREATE OR REPLACE FUNCTION generate_inv_number(p_prefix TEXT, p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_date TEXT;
  v_seq INT;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  v_seq := floor(random() * 9000 + 1000)::int;
  RETURN p_prefix || '-' || v_date || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ============================================================
-- RECEIVE STOCK
-- ============================================================

CREATE OR REPLACE FUNCTION receive_stock(
  p_location_id UUID,
  p_items JSONB,
  p_source TEXT DEFAULT 'FACTORY',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_loc RECORD;
  v_item JSONB;
  v_stock RECORD;
  v_receive_id UUID;
  v_receive_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT il.*, b.id AS branch_ref
  INTO v_loc FROM inventory_locations il
  LEFT JOIN branches b ON b.id = il.branch_id
  WHERE il.id = p_location_id AND il.is_active = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  v_org_id := v_loc.organization_id;

  IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  IF v_loc.branch_id IS NULL AND public.user_role() NOT IN (
    'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY'
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions for this location';
  END IF;

  v_receive_number := generate_inv_number('RCV', v_org_id);

  INSERT INTO stock_receives (
    organization_id, receive_number, location_id, source, notes, received_by
  ) VALUES (
    v_org_id, v_receive_number, p_location_id, p_source, p_notes, v_user_id
  ) RETURNING id INTO v_receive_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_stock FROM stock_items
    WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

    INSERT INTO stock_receive_items (receive_id, stock_item_id, quantity, unit)
    VALUES (
      v_receive_id, v_stock.id,
      (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
    );

    INSERT INTO stock_movements (
      organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, notes, created_by
    ) VALUES (
      v_org_id, 'RECEIVE', p_location_id, v_stock.id,
      (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
      'stock_receive', v_receive_id, p_notes, v_user_id
    );
  END LOOP;

  PERFORM check_low_stock(v_org_id);

  RETURN jsonb_build_object(
    'receive_id', v_receive_id,
    'receive_number', v_receive_number
  );
END;
$$;

-- ============================================================
-- CREATE STOCK TRANSFER
-- ============================================================

CREATE OR REPLACE FUNCTION create_stock_transfer(
  p_from_location_id UUID,
  p_to_location_id UUID,
  p_items JSONB,
  p_driver_id UUID DEFAULT NULL,
  p_vehicle_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_from RECORD;
  v_to RECORD;
  v_item JSONB;
  v_stock RECORD;
  v_transfer_id UUID;
  v_transfer_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_from FROM inventory_locations WHERE id = p_from_location_id;
  SELECT * INTO v_to FROM inventory_locations WHERE id = p_to_location_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF v_from.organization_id != v_to.organization_id THEN
    RAISE EXCEPTION 'Cross-org transfer not allowed';
  END IF;

  v_org_id := v_from.organization_id;

  IF v_from.branch_id IS NOT NULL AND NOT public.has_branch_access(v_from.branch_id) THEN
    RAISE EXCEPTION 'No access to source location';
  END IF;

  v_transfer_number := generate_inv_number('TRF', v_org_id);

  INSERT INTO stock_transfers (
    organization_id, transfer_number, from_location_id, to_location_id,
    status, driver_id, vehicle_id, notes, created_by
  ) VALUES (
    v_org_id, v_transfer_number, p_from_location_id, p_to_location_id,
    'PENDING', p_driver_id, p_vehicle_id, p_notes, v_user_id
  ) RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_stock FROM stock_items
    WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

    INSERT INTO stock_transfer_items (transfer_id, stock_item_id, quantity, unit)
    VALUES (
      v_transfer_id, v_stock.id,
      (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
    );
  END LOOP;

  INSERT INTO approval_requests (
    organization_id, entity_type, entity_id, title, description,
    status, requested_by, branch_id
  ) VALUES (
    v_org_id, 'STOCK_TRANSFER', v_transfer_id,
    'Stock Transfer ' || v_transfer_number,
    v_from.name || ' → ' || v_to.name,
    'PENDING', v_user_id, v_from.branch_id
  );

  RETURN jsonb_build_object(
    'transfer_id', v_transfer_id,
    'transfer_number', v_transfer_number
  );
END;
$$;

-- ============================================================
-- DISPATCH STOCK TRANSFER (deduct from source)
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_stock_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_transfer RECORD;
  v_item RECORD;
  v_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT st.*, fl.branch_id AS from_branch
  INTO v_transfer FROM stock_transfers st
  JOIN inventory_locations fl ON fl.id = st.from_location_id
  WHERE st.id = p_transfer_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status NOT IN ('PENDING', 'DRAFT') THEN
    RAISE EXCEPTION 'Transfer cannot be dispatched';
  END IF;

  IF v_transfer.from_branch IS NOT NULL AND NOT public.has_branch_access(v_transfer.from_branch) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(quantity, 0) INTO v_balance
    FROM inventory_balances
    WHERE location_id = v_transfer.from_location_id AND stock_item_id = v_item.stock_item_id;

    IF COALESCE(v_balance, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for transfer';
    END IF;

    INSERT INTO stock_movements (
      organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, created_by
    ) VALUES (
      v_transfer.organization_id, 'TRANSFER_OUT', v_transfer.from_location_id,
      v_item.stock_item_id, -v_item.quantity, v_item.unit,
      'stock_transfer', p_transfer_id, v_user_id
    );
  END LOOP;

  UPDATE stock_transfers SET
    status = 'IN_TRANSIT',
    dispatched_at = now(),
    updated_at = now()
  WHERE id = p_transfer_id;

  UPDATE approval_requests SET status = 'APPROVED', approved_by = v_user_id, resolved_at = now()
  WHERE entity_type = 'STOCK_TRANSFER' AND entity_id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'IN_TRANSIT');
END;
$$;

-- ============================================================
-- COMPLETE STOCK TRANSFER (receive at destination)
-- ============================================================

CREATE OR REPLACE FUNCTION complete_stock_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_transfer RECORD;
  v_item RECORD;
  v_qty NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT st.*, tl.branch_id AS to_branch
  INTO v_transfer FROM stock_transfers st
  JOIN inventory_locations tl ON tl.id = st.to_location_id
  WHERE st.id = p_transfer_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'IN_TRANSIT' THEN
    RAISE EXCEPTION 'Transfer is not in transit';
  END IF;

  IF v_transfer.to_branch IS NOT NULL AND NOT public.has_branch_access(v_transfer.to_branch) THEN
    RAISE EXCEPTION 'No branch access to destination';
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    v_qty := COALESCE(v_item.received_quantity, v_item.quantity);

    INSERT INTO stock_movements (
      organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, created_by
    ) VALUES (
      v_transfer.organization_id, 'TRANSFER_IN', v_transfer.to_location_id,
      v_item.stock_item_id, v_qty, v_item.unit,
      'stock_transfer', p_transfer_id, v_user_id
    );

    UPDATE stock_transfer_items SET received_quantity = v_qty WHERE id = v_item.id;
  END LOOP;

  UPDATE stock_transfers SET
    status = 'DELIVERED',
    delivered_at = now(),
    updated_at = now()
  WHERE id = p_transfer_id;

  PERFORM check_low_stock(v_transfer.organization_id);

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'DELIVERED');
END;
$$;

-- ============================================================
-- STOCK ADJUSTMENT
-- ============================================================

CREATE OR REPLACE FUNCTION submit_stock_adjustment(
  p_location_id UUID,
  p_reason TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_loc RECORD;
  v_item JSONB;
  v_stock RECORD;
  v_adj_id UUID;
  v_adj_number TEXT;
  v_before NUMERIC;
  v_auto_approve BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_loc FROM inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  v_org_id := v_loc.organization_id;

  IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  v_auto_approve := public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER');
  v_adj_number := generate_inv_number('ADJ', v_org_id);

  INSERT INTO stock_adjustments (
    organization_id, adjustment_number, location_id, reason, status, created_by,
    approved_by, approved_at
  ) VALUES (
    v_org_id, v_adj_number, p_location_id, p_reason,
    CASE WHEN v_auto_approve THEN 'APPROVED'::approval_status ELSE 'PENDING'::approval_status END,
    v_user_id,
    CASE WHEN v_auto_approve THEN v_user_id ELSE NULL END,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END
  ) RETURNING id INTO v_adj_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_stock FROM stock_items
    WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

    SELECT COALESCE(quantity, 0) INTO v_before
    FROM inventory_balances
    WHERE location_id = p_location_id AND stock_item_id = v_stock.id;

    INSERT INTO stock_adjustment_items (
      adjustment_id, stock_item_id, quantity_before, quantity_after, unit
    ) VALUES (
      v_adj_id, v_stock.id, COALESCE(v_before, 0),
      (v_item->>'quantity_after')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
    );

    IF v_auto_approve THEN
      INSERT INTO stock_movements (
        organization_id, movement_type, location_id, stock_item_id,
        quantity, unit, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_org_id, 'ADJUSTMENT', p_location_id, v_stock.id,
        (v_item->>'quantity_after')::numeric - COALESCE(v_before, 0),
        COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
        'stock_adjustment', v_adj_id, p_reason, v_user_id
      );
    END IF;
  END LOOP;

  IF NOT v_auto_approve THEN
    INSERT INTO approval_requests (
      organization_id, entity_type, entity_id, title, status, requested_by, branch_id
    ) VALUES (
      v_org_id, 'STOCK_ADJUSTMENT', v_adj_id,
      'Stock Adjustment ' || v_adj_number, 'PENDING', v_user_id, v_loc.branch_id
    );
  END IF;

  RETURN jsonb_build_object('adjustment_id', v_adj_id, 'adjustment_number', v_adj_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_stock_adjustment(p_adjustment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_adj RECORD;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_adj FROM stock_adjustments WHERE id = p_adjustment_id AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Adjustment not found or already processed'; END IF;

  FOR v_item IN SELECT * FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    INSERT INTO stock_movements (
      organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, created_by
    ) VALUES (
      v_adj.organization_id, 'ADJUSTMENT', v_adj.location_id, v_item.stock_item_id,
      v_item.quantity_after - v_item.quantity_before, v_item.unit,
      'stock_adjustment', p_adjustment_id, v_user_id
    );
  END LOOP;

  UPDATE stock_adjustments SET status = 'APPROVED', approved_by = v_user_id, approved_at = now()
  WHERE id = p_adjustment_id;

  UPDATE approval_requests SET status = 'APPROVED', approved_by = v_user_id, resolved_at = now()
  WHERE entity_type = 'STOCK_ADJUSTMENT' AND entity_id = p_adjustment_id;

  RETURN jsonb_build_object('adjustment_id', p_adjustment_id, 'status', 'APPROVED');
END;
$$;

-- ============================================================
-- STOCK COUNT
-- ============================================================

CREATE OR REPLACE FUNCTION submit_stock_count(
  p_location_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_loc RECORD;
  v_item JSONB;
  v_stock RECORD;
  v_count_id UUID;
  v_count_number TEXT;
  v_system NUMERIC;
  v_auto_approve BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_loc FROM inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  v_org_id := v_loc.organization_id;

  IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  v_auto_approve := public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER');
  v_count_number := generate_inv_number('CNT', v_org_id);

  INSERT INTO stock_counts (
    organization_id, count_number, location_id, status, notes, counted_by,
    approved_by
  ) VALUES (
    v_org_id, v_count_number, p_location_id,
    CASE WHEN v_auto_approve THEN 'APPROVED'::approval_status ELSE 'PENDING'::approval_status END,
    p_notes, v_user_id,
    CASE WHEN v_auto_approve THEN v_user_id ELSE NULL END
  ) RETURNING id INTO v_count_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_stock FROM stock_items WHERE id = (v_item->>'stock_item_id')::uuid;
    SELECT COALESCE(quantity, 0) INTO v_system
    FROM inventory_balances WHERE location_id = p_location_id AND stock_item_id = v_stock.id;

    INSERT INTO stock_count_items (
      count_id, stock_item_id, system_quantity, counted_quantity, unit
    ) VALUES (
      v_count_id, v_stock.id, COALESCE(v_system, 0),
      (v_item->>'counted_quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
    );

    IF v_auto_approve AND (v_item->>'counted_quantity')::numeric != COALESCE(v_system, 0) THEN
      INSERT INTO stock_movements (
        organization_id, movement_type, location_id, stock_item_id,
        quantity, unit, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_org_id, 'COUNT', p_location_id, v_stock.id,
        (v_item->>'counted_quantity')::numeric - COALESCE(v_system, 0),
        COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
        'stock_count', v_count_id, p_notes, v_user_id
      );
    END IF;
  END LOOP;

  IF NOT v_auto_approve THEN
    INSERT INTO approval_requests (
      organization_id, entity_type, entity_id, title, status, requested_by, branch_id
    ) VALUES (
      v_org_id, 'STOCK_TRANSFER', v_count_id,
      'Stock Count ' || v_count_number, 'PENDING', v_user_id, v_loc.branch_id
    );
  END IF;

  RETURN jsonb_build_object('count_id', v_count_id, 'count_number', v_count_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_stock_count(p_count_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count RECORD;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Count not found'; END IF;

  FOR v_item IN SELECT * FROM stock_count_items WHERE count_id = p_count_id
  LOOP
    IF v_item.variance != 0 THEN
      INSERT INTO stock_movements (
        organization_id, movement_type, location_id, stock_item_id,
        quantity, unit, reference_type, reference_id, created_by
      ) VALUES (
        v_count.organization_id, 'COUNT', v_count.location_id, v_item.stock_item_id,
        v_item.variance, v_item.unit, 'stock_count', p_count_id, v_user_id
      );
    END IF;
  END LOOP;

  UPDATE stock_counts SET status = 'APPROVED', approved_by = v_user_id WHERE id = p_count_id;
  RETURN jsonb_build_object('count_id', p_count_id, 'status', 'APPROVED');
END;
$$;

-- ============================================================
-- STOCK WRITE-OFF
-- ============================================================

CREATE OR REPLACE FUNCTION submit_stock_write_off(
  p_location_id UUID,
  p_reason TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_loc RECORD;
  v_item JSONB;
  v_stock RECORD;
  v_wo_id UUID;
  v_wo_number TEXT;
  v_auto_approve BOOLEAN;
  v_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_loc FROM inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  v_org_id := v_loc.organization_id;

  IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  v_auto_approve := public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER');
  v_wo_number := generate_inv_number('WO', v_org_id);

  INSERT INTO stock_write_offs (
    organization_id, write_off_number, location_id, reason, status, created_by, approved_by
  ) VALUES (
    v_org_id, v_wo_number, p_location_id, p_reason,
    CASE WHEN v_auto_approve THEN 'APPROVED'::approval_status ELSE 'PENDING'::approval_status END,
    v_user_id, CASE WHEN v_auto_approve THEN v_user_id ELSE NULL END
  ) RETURNING id INTO v_wo_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_stock FROM stock_items WHERE id = (v_item->>'stock_item_id')::uuid;

    INSERT INTO stock_write_off_items (write_off_id, stock_item_id, quantity, unit)
    VALUES (
      v_wo_id, v_stock.id, (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
    );

    IF v_auto_approve THEN
      SELECT COALESCE(quantity, 0) INTO v_balance
      FROM inventory_balances WHERE location_id = p_location_id AND stock_item_id = v_stock.id;

      IF v_balance < (v_item->>'quantity')::numeric THEN
        RAISE EXCEPTION 'Insufficient stock for write-off';
      END IF;

      INSERT INTO stock_movements (
        organization_id, movement_type, location_id, stock_item_id,
        quantity, unit, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_org_id, 'WRITE_OFF', p_location_id, v_stock.id,
        -(v_item->>'quantity')::numeric,
        COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
        'stock_write_off', v_wo_id, p_reason, v_user_id
      );
    END IF;
  END LOOP;

  IF NOT v_auto_approve THEN
    INSERT INTO approval_requests (
      organization_id, entity_type, entity_id, title, status, requested_by, branch_id
    ) VALUES (
      v_org_id, 'STOCK_WRITE_OFF', v_wo_id,
      'Write Off ' || v_wo_number, 'PENDING', v_user_id, v_loc.branch_id
    );
  END IF;

  RETURN jsonb_build_object('write_off_id', v_wo_id, 'write_off_number', v_wo_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_stock_write_off(p_write_off_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_wo RECORD;
  v_item RECORD;
  v_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_wo FROM stock_write_offs WHERE id = p_write_off_id AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Write-off not found'; END IF;

  FOR v_item IN SELECT * FROM stock_write_off_items WHERE write_off_id = p_write_off_id
  LOOP
    SELECT COALESCE(quantity, 0) INTO v_balance
    FROM inventory_balances
    WHERE location_id = v_wo.location_id AND stock_item_id = v_item.stock_item_id;

    IF v_balance < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for write-off';
    END IF;

    INSERT INTO stock_movements (
      organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, created_by
    ) VALUES (
      v_wo.organization_id, 'WRITE_OFF', v_wo.location_id, v_item.stock_item_id,
      -v_item.quantity, v_item.unit, 'stock_write_off', p_write_off_id, v_user_id
    );
  END LOOP;

  UPDATE stock_write_offs SET status = 'APPROVED', approved_by = v_user_id WHERE id = p_write_off_id;
  UPDATE approval_requests SET status = 'APPROVED', approved_by = v_user_id, resolved_at = now()
  WHERE entity_type = 'STOCK_WRITE_OFF' AND entity_id = p_write_off_id;

  RETURN jsonb_build_object('write_off_id', p_write_off_id, 'status', 'APPROVED');
END;
$$;

GRANT EXECUTE ON FUNCTION receive_stock TO authenticated;
GRANT EXECUTE ON FUNCTION create_stock_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION dispatch_stock_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION complete_stock_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION submit_stock_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION submit_stock_count TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_count TO authenticated;
GRANT EXECUTE ON FUNCTION submit_stock_write_off TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_write_off TO authenticated;

-- Inventory RLS write policies
CREATE POLICY inventory_balances_org_write ON inventory_balances
  FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY stock_movements_select ON stock_movements
  FOR SELECT USING (organization_id = public.organization_id());

CREATE POLICY stock_transfers_org ON stock_transfers
  FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY stock_transfer_items_via ON stock_transfer_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM stock_transfers t
      WHERE t.id = transfer_id AND t.organization_id = public.organization_id()
    )
  );

CREATE POLICY stock_receives_org ON stock_receives
  FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY stock_adjustments_org ON stock_adjustments
  FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY stock_counts_org ON stock_counts
  FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY stock_write_offs_org ON stock_write_offs
  FOR ALL USING (organization_id = public.organization_id());

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receives ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_write_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_write_off_items ENABLE ROW LEVEL SECURITY;
