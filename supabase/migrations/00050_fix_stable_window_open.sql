-- Fix: kalendar masih kosong — is_factory_order_window_open (STABLE) masih panggil UPDATE
-- Migration 00049 tidak mencukupi kerana get_published masih guna is_factory_order_window_open

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
          'window_open', (
            NOT COALESCE(d.orders_locked, false)
            AND now() < factory_order_cutoff_at(d.production_date)
          ),
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

-- Buang close_expired dari suggest (STABLE read) — dipanggil dari API
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
