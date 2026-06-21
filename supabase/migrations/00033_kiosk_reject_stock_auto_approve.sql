-- POS reject stok: auto-lulus di kiosk untuk STAFF & Pengurus Kawasan
-- Migration 00033

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

  v_auto_approve :=
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
    OR (
      v_loc.location_type = 'BRANCH_KIOSK'
      AND public.user_role() IN ('STAFF', 'AREA_MANAGER')
    );

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
