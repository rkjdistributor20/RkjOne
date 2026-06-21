-- Roti: shelf life 5 hari dari tarikh production — batch tracking + expired alert
-- Migration 00034

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS production_date DATE;

CREATE TABLE IF NOT EXISTS stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity_remaining NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
  unit stock_unit NOT NULL,
  production_date DATE NOT NULL,
  expires_on DATE NOT NULL,
  inbound_movement_id UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DEPLETED', 'EXPIRED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_location_item
  ON stock_batches(location_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expires
  ON stock_batches(expires_on)
  WHERE status = 'ACTIVE' AND quantity_remaining > 0;

ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_batches_org ON stock_batches
  FOR ALL USING (organization_id = public.organization_id());

CREATE OR REPLACE FUNCTION roti_shelf_life_days()
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 5 $$;

CREATE OR REPLACE FUNCTION is_roti_stock_item(p_stock_item_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM stock_items
    WHERE id = p_stock_item_id AND category = 'Roti' AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION consume_stock_batches_fifo(
  p_location_id UUID,
  p_stock_item_id UUID,
  p_qty NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining NUMERIC := GREATEST(p_qty, 0);
  r RECORD;
  v_take NUMERIC;
BEGIN
  IF v_remaining <= 0 THEN RETURN; END IF;

  FOR r IN
    SELECT id, quantity_remaining
    FROM stock_batches
    WHERE location_id = p_location_id
      AND stock_item_id = p_stock_item_id
      AND status = 'ACTIVE'
      AND quantity_remaining > 0
    ORDER BY production_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF r.quantity_remaining <= v_remaining THEN
      v_take := r.quantity_remaining;
      v_remaining := v_remaining - v_take;
      UPDATE stock_batches
      SET quantity_remaining = 0,
          status = 'DEPLETED',
          updated_at = now()
      WHERE id = r.id;
    ELSE
      v_take := v_remaining;
      UPDATE stock_batches
      SET quantity_remaining = quantity_remaining - v_take,
          updated_at = now()
      WHERE id = r.id;
      v_remaining := 0;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION sync_stock_batch_on_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prod DATE;
BEGIN
  IF NOT is_roti_stock_item(NEW.stock_item_id) THEN
    RETURN NEW;
  END IF;

  v_prod := COALESCE(NEW.production_date, CURRENT_DATE);

  IF NEW.quantity > 0 AND NEW.movement_type IN ('RECEIVE', 'TRANSFER_IN') THEN
    INSERT INTO stock_batches (
      organization_id, location_id, stock_item_id,
      quantity_remaining, unit, production_date, expires_on,
      inbound_movement_id, status
    ) VALUES (
      NEW.organization_id, NEW.location_id, NEW.stock_item_id,
      NEW.quantity, NEW.unit, v_prod,
      v_prod + roti_shelf_life_days(),
      NEW.id, 'ACTIVE'
    );
  ELSIF NEW.quantity < 0 THEN
    PERFORM consume_stock_batches_fifo(
      NEW.location_id,
      NEW.stock_item_id,
      ABS(NEW.quantity)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_movement_sync_batch ON stock_movements;
CREATE TRIGGER stock_movement_sync_batch
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION sync_stock_batch_on_movement();

CREATE OR REPLACE FUNCTION mark_expired_roti_batches()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE stock_batches
  SET status = 'EXPIRED', updated_at = now()
  WHERE status = 'ACTIVE'
    AND quantity_remaining > 0
    AND expires_on < CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION get_expired_roti_stock(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM mark_expired_roti_batches();

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'expires_on', row->>'item_name'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'batch_id', b.id,
      'stock_item_id', b.stock_item_id,
      'item_code', si.item_code,
      'item_name', si.name,
      'pos_menu', CASE si.item_code
        WHEN 'ST-PLANTA' THEN 'Roti Kaya'
        WHEN 'ST-KELAPA' THEN 'Roti Kelapa'
        WHEN 'ST-KACANG' THEN 'Roti Kacang'
        WHEN 'ST-BENGGALI' THEN 'Roti Benggali'
        ELSE si.name
      END,
      'quantity_remaining', b.quantity_remaining,
      'unit', b.unit,
      'production_date', b.production_date,
      'expires_on', b.expires_on,
      'days_expired', (CURRENT_DATE - b.expires_on)::int,
      'shelf_life_days', roti_shelf_life_days()
    ) AS row
    FROM stock_batches b
    JOIN stock_items si ON si.id = b.stock_item_id
    WHERE b.location_id = p_location_id
      AND b.status IN ('ACTIVE', 'EXPIRED')
      AND b.quantity_remaining > 0
      AND b.expires_on <= CURRENT_DATE
      AND si.category = 'Roti'
  ) sub;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_roti_expiry_summary(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired JSONB;
  v_expiring JSONB;
BEGIN
  PERFORM mark_expired_roti_batches();

  v_expired := get_expired_roti_stock(p_location_id);

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'expires_on'), '[]'::jsonb)
  INTO v_expiring
  FROM (
    SELECT jsonb_build_object(
      'stock_item_id', b.stock_item_id,
      'item_code', si.item_code,
      'item_name', si.name,
      'pos_menu', CASE si.item_code
        WHEN 'ST-PLANTA' THEN 'Roti Kaya'
        WHEN 'ST-KELAPA' THEN 'Roti Kelapa'
        WHEN 'ST-KACANG' THEN 'Roti Kacang'
        WHEN 'ST-BENGGALI' THEN 'Roti Benggali'
        ELSE si.name
      END,
      'quantity_remaining', b.quantity_remaining,
      'unit', b.unit,
      'production_date', b.production_date,
      'expires_on', b.expires_on,
      'days_until_expiry', (b.expires_on - CURRENT_DATE)::int
    ) AS row
    FROM stock_batches b
    JOIN stock_items si ON si.id = b.stock_item_id
    WHERE b.location_id = p_location_id
      AND b.status = 'ACTIVE'
      AND b.quantity_remaining > 0
      AND b.expires_on > CURRENT_DATE
      AND b.expires_on <= CURRENT_DATE + 1
      AND si.category = 'Roti'
  ) sub;

  RETURN jsonb_build_object(
    'expired', v_expired,
    'expiring_soon', v_expiring,
    'has_expired', jsonb_array_length(v_expired) > 0,
    'shelf_life_days', roti_shelf_life_days()
  );
END;
$$;

-- Backfill batch dari baki roti sedia ada (tarikh production = inbound terakhir)
INSERT INTO stock_batches (
  organization_id, location_id, stock_item_id,
  quantity_remaining, unit, production_date, expires_on, status
)
SELECT
  ib.organization_id,
  ib.location_id,
  ib.stock_item_id,
  ib.quantity,
  ib.unit,
  COALESCE(
    (
      SELECT MAX(sm.created_at)::date
      FROM stock_movements sm
      WHERE sm.location_id = ib.location_id
        AND sm.stock_item_id = ib.stock_item_id
        AND sm.quantity > 0
        AND sm.movement_type IN ('RECEIVE', 'TRANSFER_IN')
    ),
    ib.updated_at::date,
    CURRENT_DATE
  ) AS production_date,
  COALESCE(
    (
      SELECT MAX(sm.created_at)::date
      FROM stock_movements sm
      WHERE sm.location_id = ib.location_id
        AND sm.stock_item_id = ib.stock_item_id
        AND sm.quantity > 0
        AND sm.movement_type IN ('RECEIVE', 'TRANSFER_IN')
    ),
    ib.updated_at::date,
    CURRENT_DATE
  ) + roti_shelf_life_days(),
  CASE
    WHEN COALESCE(
      (
        SELECT MAX(sm.created_at)::date
        FROM stock_movements sm
        WHERE sm.location_id = ib.location_id
          AND sm.stock_item_id = ib.stock_item_id
          AND sm.quantity > 0
          AND sm.movement_type IN ('RECEIVE', 'TRANSFER_IN')
      ),
      ib.updated_at::date,
      CURRENT_DATE
    ) + roti_shelf_life_days() < CURRENT_DATE THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END
FROM inventory_balances ib
JOIN stock_items si ON si.id = ib.stock_item_id
JOIN inventory_locations il ON il.id = ib.location_id
WHERE si.category = 'Roti'
  AND ib.quantity > 0
  AND il.location_type = 'BRANCH_KIOSK'
  AND NOT EXISTS (
    SELECT 1 FROM stock_batches sb
    WHERE sb.location_id = ib.location_id
      AND sb.stock_item_id = ib.stock_item_id
      AND sb.status IN ('ACTIVE', 'EXPIRED')
      AND sb.quantity_remaining > 0
  );

CREATE OR REPLACE FUNCTION complete_stock_transfer(
  p_transfer_id UUID,
  p_production_date DATE DEFAULT NULL
)
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
  v_prod DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_prod := COALESCE(p_production_date, CURRENT_DATE);

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
      quantity, unit, reference_type, reference_id, created_by, production_date
    ) VALUES (
      v_transfer.organization_id, 'TRANSFER_IN', v_transfer.to_location_id,
      v_item.stock_item_id, v_qty, v_item.unit,
      'stock_transfer', p_transfer_id, v_user_id, v_prod
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
  v_prod DATE;
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

    v_prod := COALESCE(
      NULLIF(v_item->>'production_date', '')::date,
      CURRENT_DATE
    );

    INSERT INTO stock_receive_items (receive_id, stock_item_id, quantity, unit)
    VALUES (
      v_receive_id, v_stock.id,
      (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
    );

    INSERT INTO stock_movements (
      organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, notes, created_by, production_date
    ) VALUES (
      v_org_id, 'RECEIVE', p_location_id, v_stock.id,
      (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
      'stock_receive', v_receive_id, p_notes, v_user_id, v_prod
    );
  END LOOP;

  PERFORM check_low_stock(v_org_id);

  RETURN jsonb_build_object(
    'receive_id', v_receive_id,
    'receive_number', v_receive_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_expired_roti_stock TO authenticated;
GRANT EXECUTE ON FUNCTION get_roti_expiry_summary TO authenticated;
GRANT EXECUTE ON FUNCTION roti_shelf_life_days TO authenticated;
