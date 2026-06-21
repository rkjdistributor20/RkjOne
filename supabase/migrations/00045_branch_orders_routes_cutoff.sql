-- Order HQ per cawangan, cutoff T-1 22:00, cadangan stok, laluan driver, laporan kilang

-- ============================================================
-- BRANCH ORDER LINES
-- ============================================================

CREATE TABLE hq_factory_order_branch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES hq_factory_orders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit stock_unit NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, branch_id, stock_item_id)
);

CREATE INDEX idx_hq_factory_order_branch_items_order ON hq_factory_order_branch_items(order_id);
CREATE INDEX idx_hq_factory_order_branch_items_branch ON hq_factory_order_branch_items(branch_id);

-- Satu order aktif per hari production (boleh kemas kini sebelum cutoff)
CREATE UNIQUE INDEX idx_hq_factory_orders_one_active_day
  ON hq_factory_orders(organization_id, production_date)
  WHERE status NOT IN ('CANCELLED');

ALTER TABLE factory_production_days
  ADD COLUMN IF NOT EXISTS orders_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orders_locked_at TIMESTAMPTZ;

ALTER TABLE hq_factory_orders
  ADD COLUMN IF NOT EXISTS routes_planned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- ============================================================
-- DELIVERY ROUTE PLANS (HQ susun perjalanan driver)
-- ============================================================

CREATE TABLE hq_delivery_route_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_order_id UUID REFERENCES hq_factory_orders(id) ON DELETE SET NULL,
  production_date DATE NOT NULL,
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  route_name TEXT NOT NULL,
  region_code region_code,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (
    status IN ('PLANNED', 'DISPATCHED', 'COMPLETED', 'CANCELLED')
  ),
  delivery_order_id UUID REFERENCES delivery_orders(id),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hq_delivery_route_plans_order ON hq_delivery_route_plans(factory_order_id);
CREATE INDEX idx_hq_delivery_route_plans_date ON hq_delivery_route_plans(production_date DESC);

CREATE TABLE hq_delivery_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_plan_id UUID NOT NULL REFERENCES hq_delivery_route_plans(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  stop_sequence INT NOT NULL CHECK (stop_sequence > 0),
  notes TEXT,
  UNIQUE (route_plan_id, stop_sequence),
  UNIQUE (route_plan_id, branch_id)
);

CREATE INDEX idx_hq_delivery_route_stops_plan ON hq_delivery_route_stops(route_plan_id);

CREATE TABLE hq_delivery_route_stop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL REFERENCES hq_delivery_route_stops(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit stock_unit NOT NULL,
  UNIQUE (stop_id, stock_item_id)
);

-- ============================================================
-- ORDER WINDOW (T-1 jam 22:00 MYT)
-- ============================================================

CREATE OR REPLACE FUNCTION factory_order_cutoff_at(p_production_date DATE)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ((p_production_date - 1)::timestamp + time '22:00:00') AT TIME ZONE 'Asia/Kuala_Lumpur';
$$;

CREATE OR REPLACE FUNCTION close_expired_production_order_windows()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE factory_production_days d
  SET orders_locked = true,
      orders_locked_at = COALESCE(d.orders_locked_at, now())
  FROM factory_production_weeks w
  WHERE w.id = d.week_id
    AND w.status = 'PUBLISHED'
    AND d.orders_locked = false
    AND now() >= factory_order_cutoff_at(d.production_date);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION is_factory_order_window_open(
  p_org_id UUID,
  p_production_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day RECORD;
BEGIN
  PERFORM close_expired_production_order_windows();

  IF NOT is_published_production_date(p_org_id, p_production_date) THEN
    RETURN false;
  END IF;

  SELECT d.orders_locked INTO v_day
  FROM factory_production_days d
  JOIN factory_production_weeks w ON w.id = d.week_id
  WHERE w.organization_id = p_org_id
    AND w.status = 'PUBLISHED'
    AND d.production_date = p_production_date;

  IF NOT FOUND OR v_day.orders_locked THEN
    RETURN false;
  END IF;

  RETURN now() < factory_order_cutoff_at(p_production_date);
END;
$$;

GRANT EXECUTE ON FUNCTION factory_order_cutoff_at(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION close_expired_production_order_windows() TO authenticated;
GRANT EXECUTE ON FUNCTION is_factory_order_window_open(UUID, DATE) TO authenticated;

-- ============================================================
-- Cadangan order per cawangan (roti)
-- ============================================================

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
    v_branch := jsonb_build_object(
      'branch_id', v_loc.branch_id,
      'branch_code', v_loc.branch_code,
      'branch_name', v_loc.branch_name,
      'region_code', v_loc.region_code,
      'location_id', v_loc.location_id,
      'items', '[]'::jsonb
    );

    FOR v_stock IN
      SELECT si.*
      FROM stock_items si
      WHERE si.organization_id = v_org_id
        AND si.category = 'Roti'
        AND si.is_active = true
      ORDER BY si.item_code
    LOOP
      SELECT COALESCE(ib.quantity, 0) INTO v_bal
      FROM inventory_balances ib
      WHERE ib.location_id = v_loc.location_id
        AND ib.stock_item_id = v_stock.id;

      v_target := GREATEST(COALESCE(v_stock.min_threshold, 0) * 2, COALESCE(v_stock.pack_quantity, 20) * 2);
      v_suggest_pcs := GREATEST(0, v_target - COALESCE(v_bal, 0));
      v_suggest_bags := CASE
        WHEN COALESCE(v_stock.pack_quantity, 0) > 0
        THEN CEIL(v_suggest_pcs / v_stock.pack_quantity)
        ELSE v_suggest_pcs
      END;

      IF v_suggest_bags > 0 THEN
        v_branch := jsonb_set(
          v_branch,
          '{items}',
          (v_branch->'items') || jsonb_build_array(jsonb_build_object(
            'stock_item_id', v_stock.id,
            'item_code', v_stock.item_code,
            'name', v_stock.name,
            'current_pcs', COALESCE(v_bal, 0),
            'target_pcs', v_target,
            'suggested_bags', v_suggest_bags,
            'suggested_pcs', v_suggest_bags * COALESCE(v_stock.pack_quantity, 1),
            'unit', v_stock.base_unit
          ))
        );

        v_sum := COALESCE((v_total_roti->>v_stock.item_code)::numeric, 0) + v_suggest_bags;
        v_total_roti := v_total_roti || jsonb_build_object(v_stock.item_code, v_sum);
      END IF;
    END LOOP;

    IF jsonb_array_length(v_branch->'items') > 0 THEN
      v_branches := v_branches || v_branch;
    END IF;
  END LOOP;

  -- Bahan & packaging anggaran ikut jumlah roti
  FOR v_stock IN
    SELECT si.*
    FROM stock_items si
    WHERE si.organization_id = v_org_id
      AND si.category IN ('Bahan', 'Packaging')
      AND si.is_active = true
    ORDER BY si.item_code
  LOOP
    v_suggest_bags := 0;
    IF v_stock.category = 'Bahan' THEN
      SELECT COALESCE(SUM((v_total_roti->>si2.item_code)::numeric), 0) INTO v_sum
      FROM stock_items si2
      WHERE si2.organization_id = v_org_id AND si2.category = 'Roti';
      v_suggest_bags := GREATEST(1, CEIL(v_sum / 20.0));
    ELSIF v_stock.item_code LIKE 'ST-PLASTIC-%' THEN
      v_code := replace(v_stock.item_code, 'ST-PLASTIC-', '');
      v_sum := COALESCE((v_total_roti->>(
        CASE v_code
          WHEN 'S' THEN 'ST-PLANTA'
          WHEN 'M' THEN 'ST-KACANG'
          ELSE 'ST-BENGGALI'
        END
      ))::numeric, 0);
      v_suggest_bags := GREATEST(0, CEIL(v_sum));
    END IF;

    IF v_suggest_bags > 0 THEN
      v_factory_items := v_factory_items || jsonb_build_array(jsonb_build_object(
        'stock_item_id', v_stock.id,
        'item_code', v_stock.item_code,
        'name', v_stock.name,
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

GRANT EXECUTE ON FUNCTION suggest_hq_factory_order(DATE) TO authenticated;

-- ============================================================
-- Susun laluan driver ikut kawasan & arah jalan
-- ============================================================

CREATE OR REPLACE FUNCTION route_stop_sort_key(p_branch_name TEXT, p_branch_code TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_branch_name ILIKE '%Arah Utara%' THEN 1
      WHEN p_branch_name ILIKE '%Arah Selatan%' THEN 3
      WHEN p_branch_name ILIKE '%Arah Barat%' THEN 2
      ELSE 2
    END * 1000
    + NULLIF(regexp_replace(p_branch_code, '\D', '', 'g'), '')::int;
$$;

CREATE OR REPLACE FUNCTION default_driver_for_region(
  p_org_id UUID,
  p_region region_code
)
RETURNS TABLE(driver_id UUID, vehicle_id UUID, route_name TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT d.id, v.id, COALESCE(d.route_description, d.full_name)
  FROM drivers d
  LEFT JOIN vehicles v ON v.default_driver_id = d.id AND v.organization_id = p_org_id
  WHERE d.organization_id = p_org_id
    AND d.status = 'ACTIVE'
    AND (
      (p_region = 'UTARA' AND d.driver_code IN ('D001', 'D004', 'D005'))
      OR (p_region = 'TENGAH' AND d.driver_code IN ('D002', 'D003'))
      OR (p_region = 'SELATAN' AND d.driver_code IN ('D002', 'D003'))
    )
  ORDER BY
    CASE d.driver_code
      WHEN 'D001' THEN 1 WHEN 'D002' THEN 1 WHEN 'D003' THEN 2
      ELSE 3
    END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION create_delivery_routes_for_factory_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_order RECORD;
  v_region region_code;
  v_plan_id UUID;
  v_driver UUID;
  v_vehicle UUID;
  v_route_name TEXT;
  v_stop RECORD;
  v_seq INT;
  v_plans JSONB := '[]'::jsonb;
  v_existing INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh susun laluan penghantaran';
  END IF;

  SELECT * INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

  SELECT COUNT(*) INTO v_existing
  FROM hq_delivery_route_plans
  WHERE factory_order_id = p_order_id AND status != 'CANCELLED';

  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Laluan sudah dirancang untuk order ini';
  END IF;

  FOR v_region IN
    SELECT DISTINCT COALESCE(r.code, b.area::region_code)
    FROM hq_factory_order_branch_items bi
    JOIN branches b ON b.id = bi.branch_id
    LEFT JOIN regions r ON r.id = b.region_id
    WHERE bi.order_id = p_order_id
  LOOP
    SELECT driver_id, vehicle_id, route_name
    INTO v_driver, v_vehicle, v_route_name
    FROM default_driver_for_region(v_order.organization_id, v_region);

    INSERT INTO hq_delivery_route_plans (
      organization_id, factory_order_id, production_date,
      driver_id, vehicle_id, route_name, region_code, created_by
    ) VALUES (
      v_order.organization_id, p_order_id, v_order.production_date,
      v_driver, v_vehicle,
      COALESCE(v_route_name, v_region::text || ' Route'),
      v_region, v_user_id
    ) RETURNING id INTO v_plan_id;

    v_seq := 0;
    FOR v_stop IN
      SELECT DISTINCT b.id AS branch_id, il.id AS location_id, b.branch_name, b.branch_code
      FROM hq_factory_order_branch_items bi
      JOIN branches b ON b.id = bi.branch_id
      LEFT JOIN regions r ON r.id = b.region_id
      JOIN inventory_locations il ON il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
      WHERE bi.order_id = p_order_id
        AND COALESCE(r.code, b.area::region_code) = v_region
      ORDER BY route_stop_sort_key(b.branch_name, b.branch_code), b.branch_code
    LOOP
      v_seq := v_seq + 1;
      INSERT INTO hq_delivery_route_stops (
        route_plan_id, branch_id, location_id, stop_sequence
      ) VALUES (v_plan_id, v_stop.branch_id, v_stop.location_id, v_seq);

      INSERT INTO hq_delivery_route_stop_items (stop_id, stock_item_id, quantity, unit)
      SELECT s.id, bi.stock_item_id, bi.quantity, bi.unit
      FROM hq_delivery_route_stops s
      JOIN hq_factory_order_branch_items bi
        ON bi.order_id = p_order_id
       AND bi.branch_id = v_stop.branch_id
      WHERE s.route_plan_id = v_plan_id AND s.stop_sequence = v_seq;
    END LOOP;

    v_plans := v_plans || jsonb_build_array(jsonb_build_object(
      'plan_id', v_plan_id,
      'region_code', v_region,
      'stop_count', v_seq
    ));
  END LOOP;

  UPDATE hq_factory_orders
  SET routes_planned_at = now(), updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'routes', v_plans);
END;
$$;

GRANT EXECUTE ON FUNCTION create_delivery_routes_for_factory_order(UUID) TO authenticated;

-- ============================================================
-- Laporan kilang: jumlah + pecahan cawangan
-- ============================================================

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
  SELECT o.* INTO v_order FROM hq_factory_orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_code', si.item_code,
    'name', si.name,
    'category', si.category,
    'quantity', oi.quantity,
    'unit', oi.unit
  ) ORDER BY si.item_code), '[]'::jsonb)
  INTO v_totals
  FROM hq_factory_order_items oi
  JOIN stock_items si ON si.id = oi.stock_item_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(branch_row ORDER BY branch_row->>'branch_code'), '[]'::jsonb)
  INTO v_branches
  FROM (
    SELECT jsonb_build_object(
      'branch_id', b.id,
      'branch_code', b.branch_code,
      'branch_name', b.branch_name,
      'region_code', COALESCE(r.code::text, b.area),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_code', si.item_code,
          'name', si.name,
          'quantity', bi.quantity,
          'unit', bi.unit
        ) ORDER BY si.item_code)
        FROM hq_factory_order_branch_items bi
        JOIN stock_items si ON si.id = bi.stock_item_id
        WHERE bi.order_id = p_order_id AND bi.branch_id = b.id
      ), '[]'::jsonb)
    ) AS branch_row
    FROM (
      SELECT DISTINCT branch_id FROM hq_factory_order_branch_items WHERE order_id = p_order_id
    ) x
    JOIN branches b ON b.id = x.branch_id
    LEFT JOIN regions r ON r.id = b.region_id
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'plan_id', p.id,
    'route_name', p.route_name,
    'region_code', p.region_code,
    'driver', d.full_name,
    'vehicle', COALESCE(v.plate_number, v.vehicle_type),
    'status', p.status,
    'stops', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', s.stop_sequence,
        'branch_code', b.branch_code,
        'branch_name', b.branch_name
      ) ORDER BY s.stop_sequence)
      FROM hq_delivery_route_stops s
      JOIN branches b ON b.id = s.branch_id
      WHERE s.route_plan_id = p.id
    ), '[]'::jsonb)
  ) ORDER BY p.region_code), '[]'::jsonb)
  INTO v_routes
  FROM hq_delivery_route_plans p
  LEFT JOIN drivers d ON d.id = p.driver_id
  LEFT JOIN vehicles v ON v.id = p.vehicle_id
  WHERE p.factory_order_id = p_order_id AND p.status != 'CANCELLED';

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'production_date', v_order.production_date,
    'status', v_order.status,
    'cutoff_at', factory_order_cutoff_at(v_order.production_date),
    'totals', v_totals,
    'branches', v_branches,
    'routes', v_routes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_factory_order_report(UUID) TO authenticated;

-- ============================================================
-- Kemas kini create_hq_factory_order (branch lines + cutoff)
-- ============================================================

DROP FUNCTION IF EXISTS create_hq_factory_order(DATE, JSONB, TEXT);

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
  v_agg RECORD;
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
    UPDATE hq_factory_orders SET
      notes = COALESCE(p_notes, notes),
      updated_at = now(),
      submitted_at = now()
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

      INSERT INTO hq_factory_order_branch_items (order_id, branch_id, stock_item_id, quantity, unit)
      VALUES (
        v_order_id,
        (v_branch_item->>'branch_id')::uuid,
        v_stock.id,
        (v_branch_item->>'quantity')::numeric,
        COALESCE((v_branch_item->>'unit')::stock_unit, v_stock.base_unit)
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

GRANT EXECUTE ON FUNCTION create_hq_factory_order(DATE, JSONB, TEXT, JSONB) TO authenticated;

-- Patch calendar: cutoff + window
CREATE OR REPLACE FUNCTION get_published_production_dates(
  p_from DATE DEFAULT CURRENT_DATE,
  p_to DATE DEFAULT (CURRENT_DATE + 56)
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  PERFORM close_expired_production_order_windows();

  SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'production_date', d.production_date,
          'week_start', w.week_start,
          'week_notes', w.notes,
          'day_notes', d.notes,
          'cutoff_at', factory_order_cutoff_at(d.production_date),
          'orders_locked', d.orders_locked,
          'window_open', is_factory_order_window_open(v_org_id, d.production_date)
        )
        ORDER BY d.production_date
      )
      FROM factory_production_days d
      JOIN factory_production_weeks w ON w.id = d.week_id
      WHERE w.organization_id = v_org_id
        AND w.status = 'PUBLISHED'
        AND d.production_date BETWEEN p_from AND p_to
    ),
    '[]'::jsonb
  );
END;
$$;

-- RLS
ALTER TABLE hq_factory_order_branch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_delivery_route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_delivery_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_delivery_route_stop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY hq_factory_order_branch_items_select ON hq_factory_order_branch_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hq_factory_orders o
      WHERE o.id = order_id
        AND o.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY hq_factory_order_branch_items_insert ON hq_factory_order_branch_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hq_factory_orders o
      WHERE o.id = order_id
        AND o.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND can_set_roti_production_date()
    )
  );

CREATE POLICY hq_delivery_route_plans_select ON hq_delivery_route_plans
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY hq_delivery_route_plans_manage ON hq_delivery_route_plans
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND can_set_roti_production_date()
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND can_set_roti_production_date()
  );

CREATE POLICY hq_delivery_route_stops_select ON hq_delivery_route_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hq_delivery_route_plans p
      WHERE p.id = route_plan_id
        AND p.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY hq_delivery_route_stop_items_select ON hq_delivery_route_stop_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hq_delivery_route_stops s
      JOIN hq_delivery_route_plans p ON p.id = s.route_plan_id
      WHERE s.id = stop_id
        AND p.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );
