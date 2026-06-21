-- Driver per cawangan, hub/relay handoff, pelarasan stok penghantaran

-- ============================================================
-- SCHEMA
-- ============================================================

ALTER TABLE hq_factory_order_branch_items
  ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES drivers(id);

ALTER TABLE hq_delivery_route_plans
  ADD COLUMN IF NOT EXISTS route_pattern TEXT NOT NULL DEFAULT 'DIRECT'
    CHECK (route_pattern IN ('DIRECT', 'HUB_PRIMARY', 'HUB_RELAY')),
  ADD COLUMN IF NOT EXISTS depends_on_plan_id UUID REFERENCES hq_delivery_route_plans(id),
  ADD COLUMN IF NOT EXISTS handoff_completed_at TIMESTAMPTZ;

ALTER TABLE hq_delivery_route_plans
  DROP CONSTRAINT IF EXISTS hq_delivery_route_plans_status_check;

ALTER TABLE hq_delivery_route_plans
  ADD CONSTRAINT hq_delivery_route_plans_status_check
  CHECK (status IN ('PLANNED', 'WAITING_HANDOFF', 'READY', 'DISPATCHED', 'COMPLETED', 'CANCELLED'));

ALTER TABLE hq_delivery_route_stops
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id),
  ADD COLUMN IF NOT EXISTS is_handoff BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_driver_id UUID REFERENCES drivers(id);

ALTER TABLE hq_delivery_route_stops
  ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE hq_delivery_route_stop_items
  ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS adjusted_quantity NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

UPDATE hq_delivery_route_stop_items
SET planned_quantity = quantity
WHERE planned_quantity IS NULL;

-- ============================================================
-- HELPERS: peranan driver & cadangan driver cawangan
-- ============================================================

CREATE OR REPLACE FUNCTION driver_route_role(p_driver_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_driver_code = 'D001' THEN 'HUB_PRIMARY'
    WHEN p_driver_code IN ('D004', 'D005') THEN 'HUB_RELAY'
    ELSE 'DIRECT'
  END;
$$;

CREATE OR REPLACE FUNCTION default_driver_id_for_branch(
  p_org_id UUID,
  p_branch_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_region region_code;
  v_rank INT;
  v_code TEXT;
  v_driver_code TEXT;
BEGIN
  SELECT COALESCE(r.code, b.area::region_code), b.branch_code
  INTO v_region, v_code
  FROM branches b
  LEFT JOIN regions r ON r.id = b.region_id
  WHERE b.id = p_branch_id;

  v_rank := NULLIF(regexp_replace(v_code, '\D', '', 'g'), '')::int;

  v_driver_code := CASE v_region
    WHEN 'UTARA' THEN CASE WHEN v_rank % 2 = 0 THEN 'D004' ELSE 'D005' END
    WHEN 'TENGAH' THEN CASE WHEN v_rank % 2 = 0 THEN 'D002' ELSE 'D003' END
    ELSE CASE WHEN v_rank % 2 = 0 THEN 'D002' ELSE 'D003' END
  END;

  RETURN (
    SELECT id FROM drivers
    WHERE organization_id = p_org_id AND driver_code = v_driver_code AND status = 'ACTIVE'
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION driver_route_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION default_driver_id_for_branch(UUID, UUID) TO authenticated;

-- ============================================================
-- Susun laluan ikut driver ditugaskan + hub/relay
-- ============================================================

CREATE OR REPLACE FUNCTION create_delivery_routes_for_factory_order(
  p_order_id UUID,
  p_replace BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_order RECORD;
  v_driver RECORD;
  v_plan_id UUID;
  v_primary_plan_id UUID;
  v_stop RECORD;
  v_seq INT;
  v_plans JSONB := '[]'::jsonb;
  v_role TEXT;
  v_vehicle UUID;
  v_relay_vehicle UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh susun laluan penghantaran';
  END IF;

  SELECT * INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

  IF p_replace THEN
    DELETE FROM hq_delivery_route_plans
    WHERE factory_order_id = p_order_id AND status IN ('PLANNED', 'WAITING_HANDOFF', 'READY');
  ELSIF EXISTS (
    SELECT 1 FROM hq_delivery_route_plans
    WHERE factory_order_id = p_order_id AND status NOT IN ('CANCELLED', 'COMPLETED')
  ) THEN
    RAISE EXCEPTION 'Laluan sudah wujud — guna replace=true untuk rancang semula';
  END IF;

  -- Pastikan setiap cawangan ada driver
  UPDATE hq_factory_order_branch_items bi
  SET assigned_driver_id = default_driver_id_for_branch(v_order.organization_id, bi.branch_id)
  WHERE bi.order_id = p_order_id AND bi.assigned_driver_id IS NULL;

  -- Rancang laluan HUB PRIMARY (Samad / D001) dahulu jika ada relay Utara
  IF EXISTS (
    SELECT 1 FROM hq_factory_order_branch_items bi
    JOIN drivers d ON d.id = bi.assigned_driver_id
    WHERE bi.order_id = p_order_id AND driver_route_role(d.driver_code) = 'HUB_RELAY'
  ) THEN
    SELECT d.id, d.driver_code, d.full_name, d.route_description,
           (SELECT v.id FROM vehicles v WHERE v.default_driver_id = d.id LIMIT 1) AS vehicle_id
    INTO v_driver
    FROM drivers d
    WHERE d.organization_id = v_order.organization_id AND d.driver_code = 'D001' AND d.status = 'ACTIVE'
    LIMIT 1;

    IF v_driver.id IS NOT NULL THEN
      INSERT INTO hq_delivery_route_plans (
        organization_id, factory_order_id, production_date,
        driver_id, vehicle_id, route_name, region_code, route_pattern, status, created_by
      ) VALUES (
        v_order.organization_id, p_order_id, v_order.production_date,
        v_driver.id, v_driver.vehicle_id,
        COALESCE(v_driver.route_description, v_driver.full_name || ' (Hub Utara)'),
        'UTARA', 'HUB_PRIMARY', 'PLANNED', v_user_id
      ) RETURNING id INTO v_primary_plan_id;

      v_seq := 0;
      FOR v_stop IN
        SELECT DISTINCT d.id AS relay_driver_id, d.full_name AS relay_name,
               COALESCE(
                 (SELECT il.id FROM inventory_locations il
                  JOIN vehicles v ON v.id = il.vehicle_id
                  WHERE v.default_driver_id = d.id AND il.location_type = 'FLEET_VEHICLE'
                  LIMIT 1),
                 (SELECT id FROM inventory_locations
                  WHERE organization_id = v_order.organization_id AND location_type = 'HQ_WAREHOUSE'
                  LIMIT 1)
               ) AS handoff_location_id
        FROM hq_factory_order_branch_items bi
        JOIN drivers d ON d.id = bi.assigned_driver_id
        WHERE bi.order_id = p_order_id
          AND driver_route_role(d.driver_code) = 'HUB_RELAY'
      LOOP
        v_seq := v_seq + 1;
        INSERT INTO hq_delivery_route_stops (
          route_plan_id, branch_id, location_id, stop_sequence,
          is_handoff, handoff_driver_id, driver_id, notes
        ) VALUES (
          v_primary_plan_id, NULL, v_stop.handoff_location_id, v_seq,
          true, v_stop.relay_driver_id, v_driver.id,
          'Sambut stok → ' || v_stop.relay_name
        );

        INSERT INTO hq_delivery_route_stop_items (stop_id, stock_item_id, quantity, unit, planned_quantity)
        SELECT s.id, bi.stock_item_id, SUM(bi.quantity), MIN(bi.unit), SUM(bi.quantity)
        FROM hq_delivery_route_stops s
        JOIN hq_factory_order_branch_items bi
          ON bi.order_id = p_order_id AND bi.assigned_driver_id = v_stop.relay_driver_id
        WHERE s.route_plan_id = v_primary_plan_id AND s.stop_sequence = v_seq
        GROUP BY s.id, bi.stock_item_id;
      END LOOP;

      v_plans := v_plans || jsonb_build_array(jsonb_build_object(
        'plan_id', v_primary_plan_id, 'route_pattern', 'HUB_PRIMARY', 'stop_count', v_seq
      ));
    END IF;
  END IF;

  -- Satu laluan per driver ditugaskan (direct / relay)
  FOR v_driver IN
    SELECT DISTINCT d.id, d.driver_code, d.full_name, d.route_description,
           driver_route_role(d.driver_code) AS role,
           (SELECT v.id FROM vehicles v WHERE v.default_driver_id = d.id LIMIT 1) AS vehicle_id,
           COALESCE(r.code, b.area::region_code) AS region_code
    FROM hq_factory_order_branch_items bi
    JOIN drivers d ON d.id = bi.assigned_driver_id
    JOIN branches b ON b.id = bi.branch_id
    LEFT JOIN regions r ON r.id = b.region_id
    WHERE bi.order_id = p_order_id
  LOOP
    v_role := v_driver.role;
    v_plan_id := NULL;

    INSERT INTO hq_delivery_route_plans (
      organization_id, factory_order_id, production_date,
      driver_id, vehicle_id, route_name, region_code, route_pattern,
      depends_on_plan_id, status, created_by
    ) VALUES (
      v_order.organization_id, p_order_id, v_order.production_date,
      v_driver.id, v_driver.vehicle_id,
      COALESCE(v_driver.route_description, v_driver.full_name),
      v_driver.region_code, v_role,
      CASE WHEN v_role = 'HUB_RELAY' THEN v_primary_plan_id ELSE NULL END,
      CASE WHEN v_role = 'HUB_RELAY' AND v_primary_plan_id IS NOT NULL THEN 'WAITING_HANDOFF' ELSE 'PLANNED' END,
      v_user_id
    ) RETURNING id INTO v_plan_id;

    v_seq := 0;
    FOR v_stop IN
      SELECT DISTINCT b.id AS branch_id, il.id AS location_id, b.branch_name, b.branch_code
      FROM hq_factory_order_branch_items bi
      JOIN branches b ON b.id = bi.branch_id
      JOIN inventory_locations il ON il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
      WHERE bi.order_id = p_order_id AND bi.assigned_driver_id = v_driver.id
      ORDER BY route_stop_sort_key(b.branch_name, b.branch_code), b.branch_code
    LOOP
      v_seq := v_seq + 1;
      INSERT INTO hq_delivery_route_stops (
        route_plan_id, branch_id, location_id, stop_sequence, driver_id
      ) VALUES (v_plan_id, v_stop.branch_id, v_stop.location_id, v_seq, v_driver.id);

      INSERT INTO hq_delivery_route_stop_items (stop_id, stock_item_id, quantity, unit, planned_quantity)
      SELECT s.id, bi.stock_item_id, bi.quantity, bi.unit, bi.quantity
      FROM hq_delivery_route_stops s
      JOIN hq_factory_order_branch_items bi
        ON bi.order_id = p_order_id AND bi.branch_id = v_stop.branch_id
      WHERE s.route_plan_id = v_plan_id AND s.stop_sequence = v_seq;
    END LOOP;

    v_plans := v_plans || jsonb_build_array(jsonb_build_object(
      'plan_id', v_plan_id,
      'driver', v_driver.full_name,
      'route_pattern', v_role,
      'stop_count', v_seq,
      'status', CASE WHEN v_role = 'HUB_RELAY' AND v_primary_plan_id IS NOT NULL THEN 'WAITING_HANDOFF' ELSE 'PLANNED' END
    ));
  END LOOP;

  UPDATE hq_factory_orders SET routes_planned_at = now(), updated_at = now() WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'routes', v_plans);
END;
$$;

GRANT EXECUTE ON FUNCTION create_delivery_routes_for_factory_order(UUID, BOOLEAN) TO authenticated;

-- Lengkapkan sambut stok (hub → relay) sebelum penghantaran kiosk
CREATE OR REPLACE FUNCTION complete_route_handoff(p_primary_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_count INT;
BEGIN
  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh sahkan sambut stok';
  END IF;

  SELECT * INTO v_plan FROM hq_delivery_route_plans WHERE id = p_primary_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laluan hub tidak dijumpai'; END IF;
  IF v_plan.route_pattern != 'HUB_PRIMARY' THEN
    RAISE EXCEPTION 'Bukan laluan hub primary';
  END IF;

  UPDATE hq_delivery_route_plans
  SET handoff_completed_at = now(), updated_at = now()
  WHERE id = p_primary_plan_id;

  UPDATE hq_delivery_route_plans
  SET status = 'READY', updated_at = now()
  WHERE depends_on_plan_id = p_primary_plan_id AND status = 'WAITING_HANDOFF';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('primary_plan_id', p_primary_plan_id, 'relay_routes_ready', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION complete_route_handoff(UUID) TO authenticated;

-- HQ ubah susunan hentian / tukar driver
CREATE OR REPLACE FUNCTION update_delivery_route_plan(
  p_plan_id UUID,
  p_driver_id UUID DEFAULT NULL,
  p_vehicle_id UUID DEFAULT NULL,
  p_stop_order UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_stop_id UUID;
  v_seq INT := 0;
BEGIN
  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh ubah laluan';
  END IF;

  SELECT * INTO v_plan FROM hq_delivery_route_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laluan tidak dijumpai'; END IF;

  IF p_driver_id IS NOT NULL OR p_vehicle_id IS NOT NULL THEN
    UPDATE hq_delivery_route_plans SET
      driver_id = COALESCE(p_driver_id, driver_id),
      vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
      updated_at = now()
    WHERE id = p_plan_id;
  END IF;

  IF p_stop_order IS NOT NULL THEN
    FOREACH v_stop_id IN ARRAY p_stop_order
    LOOP
      v_seq := v_seq + 1;
      UPDATE hq_delivery_route_stops
      SET stop_sequence = v_seq
      WHERE id = v_stop_id AND route_plan_id = p_plan_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('plan_id', p_plan_id, 'updated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_delivery_route_plan(UUID, UUID, UUID, UUID[]) TO authenticated;

-- Pelarasan kuantiti stok (kekurangan dari kilang)
CREATE OR REPLACE FUNCTION adjust_route_stop_items(
  p_stop_id UUID,
  p_adjustments JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_adj NUMERIC;
BEGIN
  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh pelarasan stok penghantaran';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_adjustments)
  LOOP
    v_adj := (v_item->>'adjusted_quantity')::numeric;
    UPDATE hq_delivery_route_stop_items
    SET
      adjusted_quantity = v_adj,
      quantity = v_adj,
      adjustment_reason = COALESCE(p_reason, adjustment_reason)
    WHERE stop_id = p_stop_id
      AND stock_item_id = (v_item->>'stock_item_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('stop_id', p_stop_id, 'adjusted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_route_stop_items(UUID, JSONB, TEXT) TO authenticated;

-- Tukar driver cawangan dalam order (sebelum/s selepas rancang)
CREATE OR REPLACE FUNCTION assign_branch_drivers(
  p_order_id UUID,
  p_assignments JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
BEGIN
  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh tugaskan driver';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    UPDATE hq_factory_order_branch_items
    SET assigned_driver_id = (v_item->>'driver_id')::uuid
    WHERE order_id = p_order_id
      AND branch_id = (v_item->>'branch_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'updated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION assign_branch_drivers(UUID, JSONB) TO authenticated;

-- Patch create_hq_factory_order: simpan assigned_driver_id
CREATE OR REPLACE FUNCTION create_hq_factory_order(
  p_production_date DATE,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_branch_items JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_branch_item JSONB;
  v_stock RECORD;
  v_existing RECORD;
  v_driver_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya pembuat order HQ boleh hantar order ke kilang';
  END IF;

  SELECT organization_id INTO v_org_id FROM profiles WHERE id = v_user_id;

  PERFORM close_expired_production_order_windows();

  IF NOT is_factory_order_window_open(v_org_id, p_production_date) THEN
    RAISE EXCEPTION 'Tempoh order ditutup — hantar sebelum % (1 hari sebelum production, jam 10 malam)',
      factory_order_cutoff_at(p_production_date);
  END IF;

  IF (p_branch_items IS NULL OR jsonb_array_length(p_branch_items) = 0)
     AND (p_items IS NULL OR jsonb_array_length(p_items) = 0) THEN
    RAISE EXCEPTION 'Sekurang-kurangnya satu item stok diperlukan';
  END IF;

  SELECT * INTO v_existing
  FROM hq_factory_orders
  WHERE organization_id = v_org_id
    AND production_date = p_production_date
    AND status NOT IN ('CANCELLED');

  IF FOUND THEN
    IF v_existing.status NOT IN ('SUBMITTED') THEN
      RAISE EXCEPTION 'Order untuk tarikh ini sudah % — tidak boleh ubah', v_existing.status;
    END IF;
    v_order_id := v_existing.id;
    v_order_number := v_existing.order_number;
    DELETE FROM hq_factory_order_branch_items WHERE order_id = v_order_id;
    DELETE FROM hq_factory_order_items WHERE order_id = v_order_id;
    DELETE FROM hq_delivery_route_plans WHERE factory_order_id = v_order_id AND status IN ('PLANNED', 'WAITING_HANDOFF', 'READY');
    UPDATE hq_factory_orders SET
      notes = COALESCE(p_notes, notes),
      updated_at = now(),
      submitted_at = now(),
      routes_planned_at = NULL
    WHERE id = v_order_id;
  ELSE
    v_order_number := generate_inv_number('ORD', v_org_id);
    INSERT INTO hq_factory_orders (
      organization_id, order_number, production_date, status, notes, created_by, submitted_at
    ) VALUES (
      v_org_id, v_order_number, p_production_date, 'SUBMITTED', p_notes, v_user_id, now()
    ) RETURNING id INTO v_order_id;
  END IF;

  IF p_branch_items IS NOT NULL AND jsonb_array_length(p_branch_items) > 0 THEN
    FOR v_branch_item IN SELECT * FROM jsonb_array_elements(p_branch_items)
    LOOP
      SELECT * INTO v_stock FROM stock_items
      WHERE id = (v_branch_item->>'stock_item_id')::uuid AND organization_id = v_org_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

      v_driver_id := NULLIF(v_branch_item->>'assigned_driver_id', '')::uuid;
      IF v_driver_id IS NULL THEN
        v_driver_id := default_driver_id_for_branch(v_org_id, (v_branch_item->>'branch_id')::uuid);
      END IF;

      INSERT INTO hq_factory_order_branch_items (
        order_id, branch_id, stock_item_id, quantity, unit, assigned_driver_id
      ) VALUES (
        v_order_id,
        (v_branch_item->>'branch_id')::uuid,
        v_stock.id,
        (v_branch_item->>'quantity')::numeric,
        COALESCE((v_branch_item->>'unit')::stock_unit, v_stock.base_unit),
        v_driver_id
      );
    END LOOP;

    INSERT INTO hq_factory_order_items (order_id, stock_item_id, quantity, unit)
    SELECT v_order_id, bi.stock_item_id, SUM(bi.quantity), MIN(bi.unit)
    FROM hq_factory_order_branch_items bi
    JOIN stock_items si ON si.id = bi.stock_item_id
    WHERE bi.order_id = v_order_id AND si.category = 'Roti'
    GROUP BY bi.stock_item_id;

    IF p_items IS NOT NULL THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
      LOOP
        SELECT * INTO v_stock FROM stock_items
        WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

        IF v_stock.category IN ('Bahan', 'Packaging') THEN
          INSERT INTO hq_factory_order_items (order_id, stock_item_id, quantity, unit)
          VALUES (
            v_order_id, v_stock.id,
            (v_item->>'quantity')::numeric,
            COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
          );
        END IF;
      END LOOP;
    END IF;
  ELSE
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      SELECT * INTO v_stock FROM stock_items
      WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

      INSERT INTO hq_factory_order_items (order_id, stock_item_id, quantity, unit)
      VALUES (
        v_order_id, v_stock.id,
        (v_item->>'quantity')::numeric,
        COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'production_date', p_production_date,
    'status', 'SUBMITTED',
    'cutoff_at', factory_order_cutoff_at(p_production_date)
  );
END;
$$;

-- Patch suggest: cadangan driver per cawangan
CREATE OR REPLACE FUNCTION suggest_hq_factory_order(p_production_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_branch JSONB;
  v_branches JSONB := '[]'::jsonb;
  v_factory_items JSONB := '[]'::jsonb;
  v_loc RECORD;
  v_stock RECORD;
  v_bal NUMERIC;
  v_target NUMERIC;
  v_suggest_pcs NUMERIC;
  v_suggest_bags NUMERIC;
  v_total_roti JSONB := '{}'::jsonb;
  v_code TEXT;
  v_sum NUMERIC;
  v_default_driver UUID;
  v_driver_name TEXT;
BEGIN
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  PERFORM close_expired_production_order_windows();

  FOR v_loc IN
    SELECT il.id AS location_id, b.id AS branch_id, b.branch_code, b.branch_name, b.area,
           r.code AS region_code
    FROM inventory_locations il
    JOIN branches b ON b.id = il.branch_id
    LEFT JOIN regions r ON r.id = b.region_id
    WHERE il.organization_id = v_org_id
      AND il.location_type = 'BRANCH_KIOSK'
      AND il.is_active = true
      AND b.status = 'ACTIVE'
    ORDER BY b.branch_code
  LOOP
    v_default_driver := default_driver_id_for_branch(v_org_id, v_loc.branch_id);
    SELECT full_name INTO v_driver_name FROM drivers WHERE id = v_default_driver;

    v_branch := jsonb_build_object(
      'branch_id', v_loc.branch_id,
      'branch_code', v_loc.branch_code,
      'branch_name', v_loc.branch_name,
      'region_code', v_loc.region_code,
      'location_id', v_loc.location_id,
      'default_driver_id', v_default_driver,
      'default_driver_name', v_driver_name,
      'items', '[]'::jsonb
    );

    FOR v_stock IN
      SELECT si.* FROM stock_items si
      WHERE si.organization_id = v_org_id AND si.category = 'Roti' AND si.is_active = true
      ORDER BY si.item_code
    LOOP
      SELECT COALESCE(ib.quantity, 0) INTO v_bal
      FROM inventory_balances ib
      WHERE ib.location_id = v_loc.location_id AND ib.stock_item_id = v_stock.id;

      v_target := GREATEST(COALESCE(v_stock.min_threshold, 0) * 2, COALESCE(v_stock.pack_quantity, 20) * 2);
      v_suggest_pcs := GREATEST(0, v_target - COALESCE(v_bal, 0));
      v_suggest_bags := CASE
        WHEN COALESCE(v_stock.pack_quantity, 0) > 0 THEN CEIL(v_suggest_pcs / v_stock.pack_quantity)
        ELSE v_suggest_pcs
      END;

      IF v_suggest_bags > 0 THEN
        v_branch := jsonb_set(v_branch, '{items}',
          (v_branch->'items') || jsonb_build_array(jsonb_build_object(
            'stock_item_id', v_stock.id, 'item_code', v_stock.item_code, 'name', v_stock.name,
            'current_pcs', COALESCE(v_bal, 0), 'target_pcs', v_target,
            'suggested_bags', v_suggest_bags,
            'suggested_pcs', v_suggest_bags * COALESCE(v_stock.pack_quantity, 1),
            'unit', v_stock.base_unit
          )));
        v_sum := COALESCE((v_total_roti->>v_stock.item_code)::numeric, 0) + v_suggest_bags;
        v_total_roti := v_total_roti || jsonb_build_object(v_stock.item_code, v_sum);
      END IF;
    END LOOP;

    IF jsonb_array_length(v_branch->'items') > 0 THEN
      v_branches := v_branches || v_branch;
    END IF;
  END LOOP;

  FOR v_stock IN
    SELECT si.* FROM stock_items si
    WHERE si.organization_id = v_org_id AND si.category IN ('Bahan', 'Packaging') AND si.is_active = true
    ORDER BY si.item_code
  LOOP
    v_suggest_bags := 0;
    IF v_stock.category = 'Bahan' THEN
      SELECT COALESCE(SUM((v_total_roti->>si2.item_code)::numeric), 0) INTO v_sum
      FROM stock_items si2 WHERE si2.organization_id = v_org_id AND si2.category = 'Roti';
      v_suggest_bags := GREATEST(1, CEIL(v_sum / 20.0));
    ELSIF v_stock.item_code LIKE 'ST-PLASTIC-%' THEN
      v_code := replace(v_stock.item_code, 'ST-PLASTIC-', '');
      v_sum := COALESCE((v_total_roti->>(
        CASE v_code WHEN 'S' THEN 'ST-PLANTA' WHEN 'M' THEN 'ST-KACANG' ELSE 'ST-BENGGALI' END
      ))::numeric, 0);
      v_suggest_bags := GREATEST(0, CEIL(v_sum));
    END IF;

    IF v_suggest_bags > 0 THEN
      v_factory_items := v_factory_items || jsonb_build_array(jsonb_build_object(
        'stock_item_id', v_stock.id, 'item_code', v_stock.item_code, 'name', v_stock.name,
        'suggested_qty', v_suggest_bags,
        'unit', COALESCE(v_stock.pack_unit::text, v_stock.base_unit::text)
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'production_date', p_production_date,
    'cutoff_at', factory_order_cutoff_at(p_production_date),
    'window_open', is_factory_order_window_open(v_org_id, p_production_date),
    'branches', v_branches,
    'factory_items', v_factory_items
  );
END;
$$;

-- Patch laporan: driver + handoff + pelarasan
CREATE OR REPLACE FUNCTION get_factory_order_report(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_totals JSONB;
  v_branches JSONB;
  v_routes JSONB;
BEGIN
  SELECT o.* INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_code', si.item_code, 'name', si.name, 'category', si.category,
    'quantity', oi.quantity, 'unit', oi.unit
  ) ORDER BY si.item_code), '[]'::jsonb)
  INTO v_totals
  FROM hq_factory_order_items oi
  JOIN stock_items si ON si.id = oi.stock_item_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(branch_row ORDER BY branch_row->>'branch_code'), '[]'::jsonb)
  INTO v_branches
  FROM (
    SELECT jsonb_build_object(
      'branch_id', b.id, 'branch_code', b.branch_code, 'branch_name', b.branch_name,
      'region_code', COALESCE(r.code::text, b.area),
      'driver_name', (SELECT d.full_name FROM drivers d WHERE d.id = (
        SELECT bi2.assigned_driver_id FROM hq_factory_order_branch_items bi2
        WHERE bi2.order_id = p_order_id AND bi2.branch_id = b.id LIMIT 1
      )),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_code', si.item_code, 'name', si.name, 'quantity', bi.quantity, 'unit', bi.unit
        ) ORDER BY si.item_code)
        FROM hq_factory_order_branch_items bi
        JOIN stock_items si ON si.id = bi.stock_item_id
        WHERE bi.order_id = p_order_id AND bi.branch_id = b.id
      ), '[]'::jsonb)
    ) AS branch_row
    FROM (SELECT DISTINCT branch_id FROM hq_factory_order_branch_items WHERE order_id = p_order_id) x
    JOIN branches b ON b.id = x.branch_id
    LEFT JOIN regions r ON r.id = b.region_id
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'plan_id', p.id, 'route_name', p.route_name, 'region_code', p.region_code,
    'route_pattern', p.route_pattern, 'status', p.status,
    'handoff_completed', p.handoff_completed_at IS NOT NULL,
    'driver', d.full_name, 'vehicle', COALESCE(v.plate_number, v.vehicle_type),
    'stops', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', s.stop_sequence, 'branch_code', COALESCE(b.branch_code, 'HANDOFF'),
        'branch_name', COALESCE(b.branch_name, 'Sambut Stok'),
        'is_handoff', s.is_handoff,
        'handoff_driver', (SELECT hd.full_name FROM drivers hd WHERE hd.id = s.handoff_driver_id),
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'item_code', si.item_code, 'name', si.name,
            'planned', si2.planned_quantity, 'adjusted', si2.adjusted_quantity,
            'quantity', si2.quantity, 'unit', si2.unit,
            'adjustment_reason', si2.adjustment_reason
          ))
          FROM hq_delivery_route_stop_items si2
          JOIN stock_items si ON si.id = si2.stock_item_id
          WHERE si2.stop_id = s.id
        ), '[]'::jsonb)
      ) ORDER BY s.stop_sequence)
      FROM hq_delivery_route_stops s
      LEFT JOIN branches b ON b.id = s.branch_id
      WHERE s.route_plan_id = p.id
    ), '[]'::jsonb)
  ) ORDER BY p.region_code, p.route_pattern), '[]'::jsonb)
  INTO v_routes
  FROM hq_delivery_route_plans p
  LEFT JOIN drivers d ON d.id = p.driver_id
  LEFT JOIN vehicles v ON v.id = p.vehicle_id
  WHERE p.factory_order_id = p_order_id AND p.status != 'CANCELLED';

  RETURN jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'production_date', v_order.production_date, 'status', v_order.status,
    'cutoff_at', factory_order_cutoff_at(v_order.production_date),
    'totals', v_totals, 'branches', v_branches, 'routes', v_routes
  );
END;
$$;
