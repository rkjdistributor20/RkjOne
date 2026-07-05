-- Order cawangan: semua 9 item stok (roti + bahan + packaging) per kiosk, bukan asing kilang

CREATE OR REPLACE FUNCTION branch_supply_suggested_qty(
 p_category TEXT,
 p_item_code TEXT,
 p_branch_roti_bags JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
 v_sum NUMERIC;
 v_roti_code TEXT;
BEGIN
 IF p_category = 'Bahan' THEN
 SELECT COALESCE(SUM((value)::numeric), 0) INTO v_sum
 FROM jsonb_each_text(COALESCE(p_branch_roti_bags, '{}'::jsonb));
 RETURN CASE WHEN v_sum > 0 THEN GREATEST(1, CEIL(v_sum / 20.0)) ELSE 0 END;
 END IF;

 IF p_item_code LIKE 'ST-PLASTIC-%' THEN
 v_roti_code := CASE replace(p_item_code, 'ST-PLASTIC-', '')
 WHEN 'S' THEN 'ST-PLANTA'
 WHEN 'M' THEN 'ST-KACANG'
 ELSE 'ST-BENGGALI'
 END;
 v_sum := COALESCE((p_branch_roti_bags->>v_roti_code)::numeric, 0);
 RETURN GREATEST(0, CEIL(v_sum));
 END IF;

 RETURN 0;
END;
$$;

-- Patch suggest: bahan & packaging ikut keperluan setiap cawangan
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
 v_factory_totals JSONB := '{}'::jsonb;
 v_loc RECORD;
 v_stock RECORD;
 v_bal NUMERIC;
 v_target NUMERIC;
 v_suggest_pcs NUMERIC;
 v_suggest_bags NUMERIC;
 v_suggest_order NUMERIC;
 v_total_roti JSONB := '{}'::jsonb;
 v_branch_roti_bags JSONB;
 v_code TEXT;
 v_sum NUMERIC;
 v_default_driver UUID;
 v_driver_name TEXT;
 v_potential NUMERIC;
 v_avg_sales NUMERIC;
 v_stock_status TEXT;
 v_prediction_note TEXT;
 v_branch_count INT := 0;
 v_location_id UUID;
 v_lead_days INT;
 v_coverage_days INT;
 v_safety_pcs NUMERIC;
 v_daily_pcs NUMERIC;
 v_effective_days NUMERIC;
 v_projected_use NUMERIC;
 v_remaining NUMERIC;
 v_holidays JSONB;
 v_holiday_boost NUMERIC;
 v_plan_from DATE;
 v_plan_to DATE;
 v_order_unit TEXT;
BEGIN
 SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
 IF v_org_id IS NULL THEN RETURN '{}'::jsonb; END IF;

 SELECT
 COALESCE(s.stock_coverage_days, 1),
 COALESCE(s.safety_buffer_pcs, 10)
 INTO v_coverage_days, v_safety_pcs
 FROM org_stock_planning_settings s
 WHERE s.organization_id = v_org_id;

 IF NOT FOUND THEN
 v_coverage_days := 1;
 v_safety_pcs := 10;
 END IF;

 v_lead_days := GREATEST(0, (p_production_date - CURRENT_DATE));
 v_plan_from := CURRENT_DATE;
 v_plan_to := p_production_date + v_coverage_days;

 v_holidays := malaysia_holidays_in_range(v_plan_from, v_plan_to);
 v_holiday_boost := CASE
 WHEN v_lead_days + v_coverage_days <= 0 THEN 1.0
 ELSE ROUND(
 malaysia_effective_consumption_days(v_plan_from, v_plan_to, 'RNR Lebuhraya')
 / GREATEST(1, (v_plan_to - v_plan_from + 1)),
 2
 )
 END;

 FOR v_loc IN
 SELECT b.id AS branch_id, b.branch_code, b.branch_name, b.area,
 b.status AS branch_status,
 COALESCE(r.code::text, b.area) AS region_code,
 (
 SELECT il.id FROM inventory_locations il
 WHERE il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
 ORDER BY il.is_active DESC, il.created_at
 LIMIT 1
 ) AS location_id
 FROM branches b
 LEFT JOIN regions r ON r.id = b.region_id
 WHERE b.organization_id = v_org_id
 ORDER BY b.branch_code
 LOOP
 v_branch_count := v_branch_count + 1;
 v_location_id := v_loc.location_id;
 v_branch_roti_bags := '{}'::jsonb;
 v_potential := branch_sales_potential_factor(v_org_id, v_loc.branch_id, v_loc.branch_name);

 SELECT COALESCE(AVG(total_sales), 0) INTO v_avg_sales
 FROM pos_daily_summaries
 WHERE organization_id = v_org_id
 AND branch_id = v_loc.branch_id
 AND summary_date >= CURRENT_DATE - 14;

 v_effective_days := malaysia_effective_consumption_days(
 v_plan_from,
 v_plan_to,
 v_loc.branch_name
 );

 v_default_driver := default_driver_id_for_branch(v_org_id, v_loc.branch_id);
 SELECT full_name INTO v_driver_name FROM drivers WHERE id = v_default_driver;

 v_branch := jsonb_build_object(
 'branch_id', v_loc.branch_id,
 'branch_code', v_loc.branch_code,
 'branch_name', v_loc.branch_name,
 'region_code', v_loc.region_code,
 'location_id', v_location_id,
 'branch_status', v_loc.branch_status,
 'has_kiosk', v_location_id IS NOT NULL,
 'default_driver_id', v_default_driver,
 'default_driver_name', v_driver_name,
 'potential_factor', ROUND(v_potential, 2),
 'avg_daily_sales', ROUND(v_avg_sales, 2),
 'effective_consumption_days', ROUND(v_effective_days, 2),
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
 v_bal := 0;
 IF v_location_id IS NOT NULL THEN
 SELECT COALESCE(ib.quantity, 0) INTO v_bal
 FROM inventory_balances ib
 WHERE ib.location_id = v_location_id
 AND ib.stock_item_id = v_stock.id;
 END IF;

 v_daily_pcs := branch_roti_daily_pcs(
 v_org_id,
 v_loc.branch_id,
 v_location_id,
 v_stock.id,
 COALESCE(v_stock.pack_quantity, 20),
 v_loc.branch_name,
 v_avg_sales
 );

 v_projected_use := v_daily_pcs * v_potential * malaysia_effective_consumption_days(
 v_plan_from,
 GREATEST(v_plan_from, p_production_date - 1),
 v_loc.branch_name
 );

 v_remaining := GREATEST(0, COALESCE(v_bal, 0) - v_projected_use);

 v_target := CEIL(
 v_daily_pcs * v_potential * v_effective_days
 + v_safety_pcs
 + GREATEST(COALESCE(v_stock.min_threshold, 0), 0)
 );

 v_suggest_pcs := GREATEST(0, v_target - v_remaining);
 v_suggest_bags := CASE
 WHEN COALESCE(v_stock.pack_quantity, 0) > 0
 THEN CEIL(v_suggest_pcs / v_stock.pack_quantity)
 ELSE v_suggest_pcs
 END;

 IF v_location_id IS NULL THEN
 v_suggest_bags := 0;
 v_suggest_pcs := 0;
 ELSIF COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) AND v_suggest_bags < 1 THEN
 v_suggest_bags := 1;
 v_suggest_pcs := v_suggest_bags * COALESCE(v_stock.pack_quantity, 1);
 ELSIF COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) AND v_suggest_bags < 1 THEN
 v_suggest_bags := 1;
 v_suggest_pcs := v_suggest_bags * COALESCE(v_stock.pack_quantity, 1);
 END IF;

 IF v_location_id IS NULL THEN
 v_prediction_note := 'Tiada kiosk aktif — hubungi pentadbir';
 v_stock_status := 'LOW';
 ELSIF v_lead_days > 0 AND jsonb_array_length(v_holidays) > 0 THEN
 v_prediction_note := 'Ramalan AI · ' || v_lead_days || ' hari sebelum stok baharu · cuti/lebuhraya ×'
 || ROUND(v_effective_days / GREATEST(1, v_lead_days + v_coverage_days + 1), 2);
 v_stock_status := CASE
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) THEN 'CRITICAL'
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN 'LOW'
 ELSE 'OK'
 END;
 ELSIF v_avg_sales > 0 THEN
 v_prediction_note := 'Ramalan AI · jualan RM' || ROUND(v_avg_sales, 0) || '/hari · '
 || v_lead_days || ' hari sebelum terima stok';
 v_stock_status := CASE
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) THEN 'CRITICAL'
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN 'LOW'
 ELSE 'OK'
 END;
 ELSE
 v_prediction_note := 'Ramalan AI · lokasi lebuhraya · ' || v_lead_days || ' hari lead time';
 v_stock_status := CASE
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN 'LOW'
 ELSE 'OK'
 END;
 END IF;

 IF v_suggest_bags > 0 THEN
 v_branch_roti_bags := v_branch_roti_bags || jsonb_build_object(v_stock.item_code, v_suggest_bags);
 END IF;

 v_branch := jsonb_set(
 v_branch,
 '{items}',
 (v_branch->'items') || jsonb_build_array(jsonb_build_object(
 'stock_item_id', v_stock.id,
 'item_code', v_stock.item_code,
 'name', v_stock.name,
 'category', 'Roti',
 'current_pcs', COALESCE(v_bal, 0),
 'target_pcs', v_target,
 'daily_pcs_estimate', ROUND(v_daily_pcs, 1),
 'suggested_bags', v_suggest_bags,
 'suggested_order_qty', v_suggest_bags,
 'order_unit_label', 'bag',
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

 FOR v_stock IN
 SELECT si.*
 FROM stock_items si
 WHERE si.organization_id = v_org_id
 AND si.category IN ('Bahan', 'Packaging')
 AND si.status = 'ACTIVE'
 ORDER BY si.item_code
 LOOP
 v_bal := 0;
 IF v_location_id IS NOT NULL THEN
 SELECT COALESCE(ib.quantity, 0) INTO v_bal
 FROM inventory_balances ib
 WHERE ib.location_id = v_location_id
 AND ib.stock_item_id = v_stock.id;
 END IF;

 v_suggest_order := CASE
 WHEN v_location_id IS NULL THEN 0
 ELSE branch_supply_suggested_qty(v_stock.category::text, v_stock.item_code, v_branch_roti_bags)
 END;

 v_order_unit := CASE
 WHEN v_stock.pack_unit::text = 'TONG' THEN 'tong'
 WHEN v_stock.category = 'Packaging' THEN 'bag'
 ELSE lower(v_stock.base_unit::text)
 END;

 IF v_stock.category = 'Bahan' THEN
 v_prediction_note := 'Ikut jumlah roti cawangan · anggaran ' || v_order_unit;
 ELSE
 v_prediction_note := 'Packaging ikut jenis roti berkaitan';
 END IF;

 v_branch := jsonb_set(
 v_branch,
 '{items}',
 (v_branch->'items') || jsonb_build_array(jsonb_build_object(
 'stock_item_id', v_stock.id,
 'item_code', v_stock.item_code,
 'name', v_stock.name,
 'category', v_stock.category,
 'current_pcs', COALESCE(v_bal, 0),
 'target_pcs', 0,
 'suggested_bags', CASE WHEN v_stock.category = 'Packaging' THEN v_suggest_order ELSE 0 END,
 'suggested_order_qty', v_suggest_order,
 'order_unit_label', v_order_unit,
 'suggested_pcs', v_suggest_order * COALESCE(v_stock.pack_quantity, 1),
 'unit', v_stock.base_unit,
 'stock_status', 'OK',
 'prediction_note', v_prediction_note
 ))
 );

 IF v_suggest_order > 0 THEN
 v_sum := COALESCE((v_factory_totals->>v_stock.item_code)::numeric, 0) + v_suggest_order;
 v_factory_totals := v_factory_totals || jsonb_build_object(v_stock.item_code, v_sum);
 END IF;
 END LOOP;

 v_branches := v_branches || v_branch;
 END LOOP;

 FOR v_stock IN
 SELECT si.*
 FROM stock_items si
 WHERE si.organization_id = v_org_id
 AND si.status = 'ACTIVE'
 AND (
 si.category = 'Roti' AND si.item_code = ANY(ARRAY['ST-PLANTA','ST-KELAPA','ST-KACANG','ST-BENGGALI'])
 OR si.category IN ('Bahan', 'Packaging')
 )
 ORDER BY si.item_code
 LOOP
 v_sum := COALESCE((v_total_roti->>v_stock.item_code)::numeric, (v_factory_totals->>v_stock.item_code)::numeric, 0);
 IF v_sum > 0 THEN
 v_factory_items := v_factory_items || jsonb_build_array(jsonb_build_object(
 'stock_item_id', v_stock.id,
 'item_code', v_stock.item_code,
 'name', v_stock.name,
 'suggested_qty', v_sum,
 'unit', COALESCE(v_stock.pack_unit::text, v_stock.base_unit::text)
 ));
 END IF;
 END LOOP;

 RETURN jsonb_build_object(
 'production_date', p_production_date,
 'cutoff_at', factory_order_cutoff_at(p_production_date),
 'window_open', is_factory_order_window_open(v_org_id, p_production_date),
 'branch_count', v_branch_count,
 'order_lead_days', v_lead_days,
 'stock_coverage_days', v_coverage_days,
 'stock_receive_date', p_production_date,
 'order_deadline_note', CASE
 WHEN v_lead_days > 1 THEN
 'Order ' || v_lead_days || ' hari sebelum terima stok baharu (' || p_production_date || ')'
 WHEN v_lead_days = 1 THEN
 'Order esok sebelum 10 malam — stok baharu ' || p_production_date
 ELSE
 'Stok baharu hari ini (' || p_production_date || ') — order tutup T-1 10 malam'
 END,
 'holiday_demand_boost', v_holiday_boost,
 'holidays_in_window', v_holidays,
 'branches', v_branches,
 'factory_items', v_factory_items
 );
END;
$$;

-- Jumlah kilang = agregat semua baris cawangan (9 item)
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

 IF p_branch_items IS NULL OR jsonb_array_length(p_branch_items) = 0 THEN
 RAISE EXCEPTION 'Order mesti diisi per cawangan — roti, bahan & packaging dihantar ikut keperluan setiap kiosk';
 END IF;

 SELECT organization_id INTO v_org_id FROM profiles WHERE id = v_user_id;

 PERFORM close_expired_production_order_windows();

 IF NOT is_factory_order_window_open(v_org_id, p_production_date) THEN
 RAISE EXCEPTION 'Tempoh order ditutup — hantar sebelum % (1 hari sebelum production, jam 10 malam)',
 factory_order_cutoff_at(p_production_date);
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
 WHERE bi.order_id = v_order_id
 GROUP BY bi.stock_item_id;

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

GRANT EXECUTE ON FUNCTION branch_supply_suggested_qty(TEXT, TEXT, JSONB) TO authenticated;
