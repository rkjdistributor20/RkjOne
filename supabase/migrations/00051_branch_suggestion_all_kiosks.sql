-- Cadangan order: semua 36 cawangan + baki stok + ramalan potensi jualan
-- Fix: stock_items guna status (bukan is_active yang tiada wujud)

CREATE OR REPLACE FUNCTION branch_sales_potential_factor(
  p_org_id UUID,
  p_branch_id UUID,
  p_branch_name TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC;
  v_median NUMERIC;
  v_factor NUMERIC;
BEGIN
  SELECT COALESCE(AVG(total_sales), 0) INTO v_avg
  FROM pos_daily_summaries
  WHERE organization_id = p_org_id
    AND branch_id = p_branch_id
    AND summary_date >= CURRENT_DATE - 14;

  SELECT COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY branch_avg),
    1
  ) INTO v_median
  FROM (
    SELECT COALESCE(AVG(total_sales), 0) AS branch_avg
    FROM pos_daily_summaries
    WHERE organization_id = p_org_id
      AND summary_date >= CURRENT_DATE - 14
    GROUP BY branch_id
  ) s;

  IF v_avg > 0 AND v_median > 0 THEN
    v_factor := v_avg / v_median;
  ELSIF p_branch_name ILIKE 'RNR %'
     OR p_branch_name ILIKE 'OBR %'
     OR p_branch_name ILIKE 'Plaza Tol%' THEN
    v_factor := 1.2;
  ELSIF p_branch_name ILIKE 'Hentian Sebelah%' THEN
    v_factor := 1.0;
  ELSE
    v_factor := 0.9;
  END IF;

  RETURN LEAST(1.8, GREATEST(0.6, v_factor));
END;
$$;

GRANT EXECUTE ON FUNCTION branch_sales_potential_factor(UUID, UUID, TEXT) TO authenticated;

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
  v_potential NUMERIC;
  v_avg_sales NUMERIC;
  v_stock_status TEXT;
  v_prediction_note TEXT;
  v_branch_count INT := 0;
BEGIN
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  FOR v_loc IN
    SELECT il.id AS location_id, b.id AS branch_id, b.branch_code, b.branch_name, b.area,
           b.status AS branch_status,
           COALESCE(r.code::text, b.area) AS region_code
    FROM inventory_locations il
    JOIN branches b ON b.id = il.branch_id
    LEFT JOIN regions r ON r.id = b.region_id
    WHERE il.organization_id = v_org_id
      AND il.location_type = 'BRANCH_KIOSK'
      AND il.is_active = true
    ORDER BY b.branch_code
  LOOP
    v_branch_count := v_branch_count + 1;
    v_potential := branch_sales_potential_factor(v_org_id, v_loc.branch_id, v_loc.branch_name);

    SELECT COALESCE(AVG(total_sales), 0) INTO v_avg_sales
    FROM pos_daily_summaries
    WHERE organization_id = v_org_id
      AND branch_id = v_loc.branch_id
      AND summary_date >= CURRENT_DATE - 14;

    v_default_driver := default_driver_id_for_branch(v_org_id, v_loc.branch_id);
    SELECT full_name INTO v_driver_name FROM drivers WHERE id = v_default_driver;

    v_branch := jsonb_build_object(
      'branch_id', v_loc.branch_id,
      'branch_code', v_loc.branch_code,
      'branch_name', v_loc.branch_name,
      'region_code', v_loc.region_code,
      'location_id', v_loc.location_id,
      'branch_status', v_loc.branch_status,
      'default_driver_id', v_default_driver,
      'default_driver_name', v_driver_name,
      'potential_factor', ROUND(v_potential, 2),
      'avg_daily_sales', ROUND(v_avg_sales, 2),
      'items', '[]'::jsonb
    );

    FOR v_stock IN
      SELECT si.*
      FROM stock_items si
      WHERE si.organization_id = v_org_id
        AND si.category = 'Roti'
        AND si.status = 'ACTIVE'
        AND si.item_code IN ('ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI')
      ORDER BY si.item_code
    LOOP
      SELECT COALESCE(ib.quantity, 0) INTO v_bal
      FROM inventory_balances ib
      WHERE ib.location_id = v_loc.location_id
        AND ib.stock_item_id = v_stock.id;

      v_target := CEIL(
        GREATEST(COALESCE(v_stock.min_threshold, 0), COALESCE(v_stock.pack_quantity, 20))
        * 2
        * v_potential
      );

      v_suggest_pcs := GREATEST(0, v_target - COALESCE(v_bal, 0));
      v_suggest_bags := CASE
        WHEN COALESCE(v_stock.pack_quantity, 0) > 0
        THEN CEIL(v_suggest_pcs / v_stock.pack_quantity)
        ELSE v_suggest_pcs
      END;

      IF COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) AND v_suggest_bags < 1 THEN
        v_suggest_bags := 1;
        v_suggest_pcs := v_suggest_bags * COALESCE(v_stock.pack_quantity, 1);
      ELSIF COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) AND v_suggest_bags < 1 THEN
        v_suggest_bags := 1;
        v_suggest_pcs := v_suggest_bags * COALESCE(v_stock.pack_quantity, 1);
      END IF;

      IF v_avg_sales > 0 THEN
        v_prediction_note := 'Ramalan AI · jualan purata RM' || ROUND(v_avg_sales, 0) || '/hari (14 hari)';
      ELSIF v_potential >= 1.15 THEN
        v_prediction_note := 'Ramalan AI · lokasi trafik tinggi (RNR/OBR/Plaza Tol)';
      ELSE
        v_prediction_note := 'Ramalan AI · sasaran stok ikut potensi cawangan';
      END IF;

      IF COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) THEN
        v_stock_status := 'CRITICAL';
      ELSIF COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN
        v_stock_status := 'LOW';
      ELSE
        v_stock_status := 'OK';
      END IF;

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
          'unit', v_stock.base_unit,
          'stock_status', v_stock_status,
          'prediction_note', v_prediction_note
        ))
      );

      IF v_suggest_bags > 0 THEN
        v_sum := COALESCE((v_total_roti->>v_stock.item_code)::numeric, 0) + v_suggest_bags;
        v_total_roti := v_total_roti || jsonb_build_object(v_stock.item_code, v_sum);
      END IF;
    END LOOP;

    v_branches := v_branches || v_branch;
  END LOOP;

  FOR v_stock IN
    SELECT si.*
    FROM stock_items si
    WHERE si.organization_id = v_org_id
      AND si.category IN ('Bahan', 'Packaging')
      AND si.status = 'ACTIVE'
    ORDER BY si.item_code
  LOOP
    v_suggest_bags := 0;
    IF v_stock.category = 'Bahan' THEN
      SELECT COALESCE(SUM((v_total_roti->>si2.item_code)::numeric), 0) INTO v_sum
      FROM stock_items si2
      WHERE si2.organization_id = v_org_id
        AND si2.item_code IN ('ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI');
      v_suggest_bags := CASE WHEN v_sum > 0 THEN GREATEST(1, CEIL(v_sum / 20.0)) ELSE 0 END;
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
    'branch_count', v_branch_count,
    'branches', v_branches,
    'factory_items', v_factory_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION suggest_hq_factory_order(DATE) TO authenticated;
