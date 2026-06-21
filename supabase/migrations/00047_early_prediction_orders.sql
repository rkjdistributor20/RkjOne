-- Order ramalan awal (prediction) bila kilang terbit jadual + jadual kerja driver

ALTER TABLE hq_factory_orders
  ADD COLUMN IF NOT EXISTS order_phase TEXT NOT NULL DEFAULT 'PREDICTION'
    CHECK (order_phase IN ('PREDICTION', 'FINAL')),
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hq_factory_orders_phase ON hq_factory_orders(order_phase);

-- ============================================================
-- Tutup window + auto-muktamad order ramalan → FINAL
-- ============================================================

CREATE OR REPLACE FUNCTION close_expired_production_order_windows()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_dates DATE[];
BEGIN
  SELECT array_agg(d.production_date) INTO v_dates
  FROM factory_production_days d
  JOIN factory_production_weeks w ON w.id = d.week_id
  WHERE w.status = 'PUBLISHED'
    AND d.orders_locked = false
    AND now() >= factory_order_cutoff_at(d.production_date);

  UPDATE factory_production_days d
  SET orders_locked = true,
      orders_locked_at = COALESCE(d.orders_locked_at, now())
  FROM factory_production_weeks w
  WHERE w.id = d.week_id
    AND w.status = 'PUBLISHED'
    AND d.orders_locked = false
    AND now() >= factory_order_cutoff_at(d.production_date);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_dates IS NOT NULL THEN
    UPDATE hq_factory_orders
    SET order_phase = 'FINAL',
        finalized_at = COALESCE(finalized_at, now()),
        updated_at = now()
    WHERE production_date = ANY(v_dates)
      AND status = 'SUBMITTED'
      AND order_phase = 'PREDICTION';
  END IF;

  RETURN v_count;
END;
$$;

-- Muktamadkan order ramalan secara manual (HQ)
CREATE OR REPLACE FUNCTION finalize_hq_factory_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  IF NOT can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ boleh muktamadkan order';
  END IF;

  SELECT * INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;
  IF v_order.status != 'SUBMITTED' THEN
    RAISE EXCEPTION 'Order sudah %', v_order.status;
  END IF;
  IF v_order.order_phase = 'FINAL' THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'order_phase', 'FINAL', 'already', true);
  END IF;

  UPDATE hq_factory_orders
  SET order_phase = 'FINAL', finalized_at = now(), updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'order_phase', 'FINAL');
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_hq_factory_order(UUID) TO authenticated;

-- Kilang sahkan order muktamad sahaja
CREATE OR REPLACE FUNCTION acknowledge_hq_factory_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_order RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT can_manage_factory_production_schedule() THEN
    RAISE EXCEPTION 'Hanya kilang boleh sahkan order HQ';
  END IF;

  SELECT * INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

  IF v_order.order_phase = 'PREDICTION' THEN
    RAISE EXCEPTION 'Order masih fasa ramalan — HQ perlu muktamadkan atau tunggu cutoff T-1 10 malam';
  END IF;

  IF v_order.status != 'SUBMITTED' THEN
    RAISE EXCEPTION 'Order sudah diproses (status=%)', v_order.status;
  END IF;

  UPDATE hq_factory_orders SET
    status = 'ACKNOWLEDGED',
    acknowledged_at = now(),
    acknowledged_by = v_user_id,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'status', 'ACKNOWLEDGED');
END;
$$;

-- Patch create: kekal PREDICTION sehingga cutoff / manual finalize
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
    IF v_existing.order_phase = 'FINAL' THEN
      RAISE EXCEPTION 'Order sudah muktamad — tidak boleh ubah. Hubungi pentadbir jika perlu pengecualian.';
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
      routes_planned_at = NULL,
      order_phase = 'PREDICTION'
    WHERE id = v_order_id;
  ELSE
    v_order_number := generate_inv_number('ORD', v_org_id);
    INSERT INTO hq_factory_orders (
      organization_id, order_number, production_date, status, order_phase,
      notes, created_by, submitted_at
    ) VALUES (
      v_org_id, v_order_number, p_production_date, 'SUBMITTED', 'PREDICTION',
      p_notes, v_user_id, now()
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
    'order_phase', 'PREDICTION',
    'cutoff_at', factory_order_cutoff_at(p_production_date),
    'is_early_prediction', now() < factory_order_cutoff_at(p_production_date) - interval '24 hours'
  );
END;
$$;

-- Kalendar: status order ramalan + tempoh lebih panjang
CREATE OR REPLACE FUNCTION get_published_production_dates(
  p_from DATE DEFAULT CURRENT_DATE,
  p_to DATE DEFAULT (CURRENT_DATE + 90)
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
          'window_open', is_factory_order_window_open(v_org_id, d.production_date),
          'order_id', o.id,
          'order_number', o.order_number,
          'order_phase', o.order_phase,
          'has_prediction', o.id IS NOT NULL AND o.order_phase = 'PREDICTION',
          'has_final_order', o.id IS NOT NULL AND o.order_phase = 'FINAL',
          'routes_planned', o.routes_planned_at IS NOT NULL,
          'days_until_cutoff', GREATEST(0, EXTRACT(day FROM factory_order_cutoff_at(d.production_date) - now())::int)
        )
        ORDER BY d.production_date
      )
      FROM factory_production_days d
      JOIN factory_production_weeks w ON w.id = d.week_id
      LEFT JOIN hq_factory_orders o ON o.organization_id = v_org_id
        AND o.production_date = d.production_date
        AND o.status NOT IN ('CANCELLED')
      WHERE w.organization_id = v_org_id
        AND w.status = 'PUBLISHED'
        AND d.production_date BETWEEN p_from AND p_to
    ),
    '[]'::jsonb
  );
END;
$$;

-- Jadual kerja driver (preview awal)
CREATE OR REPLACE FUNCTION get_driver_work_schedule(
  p_from DATE DEFAULT CURRENT_DATE,
  p_to DATE DEFAULT (CURRENT_DATE + 90)
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_driver_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = v_user_id;
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_role := public.user_role();

  IF v_role = 'DRIVER' THEN
    SELECT id INTO v_driver_id FROM drivers
    WHERE organization_id = v_org_id AND profile_id = v_user_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data->>'production_date', row_data->>'driver_name')
      FROM (
        SELECT jsonb_build_object(
          'plan_id', p.id,
          'production_date', p.production_date,
          'route_name', p.route_name,
          'region_code', p.region_code,
          'route_pattern', p.route_pattern,
          'status', p.status,
          'order_phase', o.order_phase,
          'order_number', o.order_number,
          'driver_id', d.id,
          'driver_name', d.full_name,
          'driver_code', d.driver_code,
          'vehicle', COALESCE(v.plate_number, v.vehicle_type),
          'handoff_completed', p.handoff_completed_at IS NOT NULL,
          'depends_on_ready', dep.status IN ('READY', 'DISPATCHED', 'COMPLETED'),
          'stops', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'sequence', s.stop_sequence,
              'branch_code', COALESCE(b.branch_code, 'HANDOFF'),
              'branch_name', COALESCE(b.branch_name, s.notes, 'Sambut Stok'),
              'is_handoff', s.is_handoff,
              'item_count', (SELECT COUNT(*) FROM hq_delivery_route_stop_items si WHERE si.stop_id = s.id)
            ) ORDER BY s.stop_sequence)
            FROM hq_delivery_route_stops s
            LEFT JOIN branches b ON b.id = s.branch_id
            WHERE s.route_plan_id = p.id
          ), '[]'::jsonb)
        ) AS row_data
        FROM hq_delivery_route_plans p
        JOIN hq_factory_orders o ON o.id = p.factory_order_id
        JOIN drivers d ON d.id = p.driver_id
        LEFT JOIN vehicles v ON v.id = p.vehicle_id
        LEFT JOIN hq_delivery_route_plans dep ON dep.id = p.depends_on_plan_id
        WHERE p.organization_id = v_org_id
          AND p.status != 'CANCELLED'
          AND p.production_date BETWEEN p_from AND p_to
          AND (v_driver_id IS NULL OR p.driver_id = v_driver_id)
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_driver_work_schedule(DATE, DATE) TO authenticated;

-- Patch laporan kilang: fasa order
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
  v_base JSONB;
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

  v_base := jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'production_date', v_order.production_date, 'status', v_order.status,
    'order_phase', v_order.order_phase,
    'cutoff_at', factory_order_cutoff_at(v_order.production_date),
    'totals', v_totals, 'branches', v_branches, 'routes', v_routes
  );

  RETURN v_base;
END;
$$;
