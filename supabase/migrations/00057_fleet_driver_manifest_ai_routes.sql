-- Arahan penghantaran driver: max 20 kiosk/henti, kod arahan, susunan AI

ALTER TABLE hq_delivery_route_plans
 ADD COLUMN IF NOT EXISTS instruction_code TEXT,
 ADD COLUMN IF NOT EXISTS instruction_part INT NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS ai_optimized_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS ai_route_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_hq_route_plans_instruction
 ON hq_delivery_route_plans(instruction_code)
 WHERE instruction_code IS NOT NULL;

-- Keutamaan hentian: cawangan kritikal/rendah didahulukan
CREATE OR REPLACE FUNCTION branch_delivery_priority(p_branch_id UUID, p_org_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
 SELECT COALESCE(SUM(
 CASE
 WHEN si.critical_threshold IS NOT NULL AND ib.quantity <= si.critical_threshold THEN 100
 WHEN si.min_threshold IS NOT NULL AND ib.quantity <= si.min_threshold THEN 50
 ELSE 0
 END
 ), 0)::INT
 FROM inventory_locations il
 JOIN inventory_balances ib ON ib.location_id = il.id
 JOIN stock_items si ON si.id = ib.stock_item_id
 WHERE il.organization_id = p_org_id
 AND il.branch_id = p_branch_id
 AND il.location_type = 'BRANCH_KIOSK'
 AND si.item_code IN (
 'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
 'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
 );
$$;

-- Susun semula hentian ikut AI heuristik (kritikal → arah jalan → kod cawangan)
CREATE OR REPLACE FUNCTION optimize_delivery_route_stops(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_plan RECORD;
 v_org_id UUID;
 v_handoff_ids UUID[] := '{}';
 v_kiosk_count INT;
 v_critical INT;
 v_low INT;
 v_summary TEXT;
BEGIN
 SELECT p.*, d.driver_code, d.full_name
 INTO v_plan
 FROM hq_delivery_route_plans p
 JOIN drivers d ON d.id = p.driver_id
 WHERE p.id = p_plan_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Pelan laluan tidak dijumpai';
 END IF;

 v_org_id := v_plan.organization_id;

 SELECT COALESCE(array_agg(s.id ORDER BY s.stop_sequence), '{}')
 INTO v_handoff_ids
 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = p_plan_id AND COALESCE(s.is_handoff, false);

 WITH kiosk_ordered AS (
 SELECT
 s.id,
 ROW_NUMBER() OVER (
 ORDER BY
 branch_delivery_priority(s.branch_id, v_org_id) DESC,
 route_stop_sort_key(b.branch_name, b.branch_code),
 b.branch_code
 ) AS rn
 FROM hq_delivery_route_stops s
 LEFT JOIN branches b ON b.id = s.branch_id
 WHERE s.route_plan_id = p_plan_id
 AND COALESCE(s.is_handoff, false) = false
 ),
 handoff_ordered AS (
 SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.stop_sequence) AS rn
 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = p_plan_id AND COALESCE(s.is_handoff, false)
 ),
 combined AS (
 SELECT id, rn FROM handoff_ordered
 UNION ALL
 SELECT id, (SELECT COUNT(*) FROM handoff_ordered) + rn FROM kiosk_ordered
 )
 UPDATE hq_delivery_route_stops s
 SET stop_sequence = c.rn
 FROM combined c
 WHERE s.id = c.id;

 SELECT COUNT(*) INTO v_kiosk_count
 FROM hq_delivery_route_stops
 WHERE route_plan_id = p_plan_id AND COALESCE(is_handoff, false) = false;

 SELECT
 COUNT(*) FILTER (WHERE branch_delivery_priority(s.branch_id, v_org_id) >= 100),
 COUNT(*) FILTER (
 WHERE branch_delivery_priority(s.branch_id, v_org_id) >= 50
 AND branch_delivery_priority(s.branch_id, v_org_id) < 100
 )
 INTO v_critical, v_low
 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = p_plan_id AND COALESCE(s.is_handoff, false) = false;

 v_summary := format(
 'AI: %s hentian kiosk — %s kritikal didahulukan, %s rendah. Ikut arah jalan Utara→Barat→Selatan.',
 v_kiosk_count, v_critical, v_low
 );

 UPDATE hq_delivery_route_plans
 SET ai_optimized_at = now(),
 ai_route_summary = v_summary,
 updated_at = now()
 WHERE id = p_plan_id;

 RETURN jsonb_build_object(
 'plan_id', p_plan_id,
 'kiosk_stops', v_kiosk_count,
 'critical_first', v_critical,
 'low_priority', v_low,
 'summary', v_summary
 );
END;
$$;

-- Pecah laluan >20 kiosk menjadi arahan berasingan (sama driver, hari sama)
CREATE OR REPLACE FUNCTION split_route_plan_max_stops(p_plan_id UUID, p_max INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_plan RECORD;
 v_kiosk_ids UUID[];
 v_total INT;
 v_part INT := 1;
 v_offset INT;
 v_chunk UUID[];
 v_new_plan_id UUID;
 v_driver_code TEXT;
 v_created JSONB := '[]'::jsonb;
BEGIN
 SELECT p.*, d.driver_code
 INTO v_plan
 FROM hq_delivery_route_plans p
 JOIN drivers d ON d.id = p.driver_id
 WHERE p.id = p_plan_id;

 IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

 v_driver_code := v_plan.driver_code;

 SELECT COALESCE(array_agg(s.id ORDER BY s.stop_sequence), '{}')
 INTO v_kiosk_ids
 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = p_plan_id AND COALESCE(s.is_handoff, false) = false;

 v_total := COALESCE(array_length(v_kiosk_ids, 1), 0);
 IF v_total <= p_max THEN
 UPDATE hq_delivery_route_plans
 SET instruction_part = 1,
 instruction_code = format('AR-%s-%s-P1', v_driver_code, v_plan.production_date)
 WHERE id = p_plan_id;
 RETURN jsonb_build_array(jsonb_build_object('plan_id', p_plan_id, 'part', 1, 'stops', v_total));
 END IF;

 v_offset := p_max;
 v_part := 1;

 UPDATE hq_delivery_route_plans
 SET instruction_part = 1,
 instruction_code = format('AR-%s-%s-P1', v_driver_code, v_plan.production_date),
 route_name = COALESCE(v_plan.route_name, v_driver_code) || ' · Arahan 1'
 WHERE id = p_plan_id;

 v_created := v_created || jsonb_build_array(jsonb_build_object('plan_id', p_plan_id, 'part', 1, 'stops', p_max));

 WHILE v_offset < v_total LOOP
 v_part := v_part + 1;
 v_chunk := v_kiosk_ids[v_offset + 1 : LEAST(v_offset + p_max, v_total)];

 INSERT INTO hq_delivery_route_plans (
 organization_id, factory_order_id, production_date,
 driver_id, vehicle_id, route_name, region_code, route_pattern,
 depends_on_plan_id, status, instruction_part, instruction_code, created_by
 ) VALUES (
 v_plan.organization_id, v_plan.factory_order_id, v_plan.production_date,
 v_plan.driver_id, v_plan.vehicle_id,
 COALESCE(v_plan.route_name, v_driver_code) || ' · Arahan ' || v_part,
 v_plan.region_code, v_plan.route_pattern,
 v_plan.depends_on_plan_id, v_plan.status, v_part,
 format('AR-%s-%s-P%s', v_driver_code, v_plan.production_date, v_part),
 v_plan.created_by
 ) RETURNING id INTO v_new_plan_id;

 UPDATE hq_delivery_route_stops
 SET route_plan_id = v_new_plan_id
 WHERE id = ANY(v_chunk);

 v_created := v_created || jsonb_build_array(
 jsonb_build_object('plan_id', v_new_plan_id, 'part', v_part, 'stops', array_length(v_chunk, 1))
 );

 v_offset := v_offset + p_max;
 END LOOP;

 RETURN v_created;
END;
$$;

-- Selepas cipta laluan: pecah max 20 + optimize + kod arahan
CREATE OR REPLACE FUNCTION post_process_driver_instructions(
 p_order_id UUID,
 p_max_stops INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_plan RECORD;
 v_plan_ids UUID[];
 v_plan_id UUID;
 v_splits JSONB := '[]'::jsonb;
 v_opts JSONB := '[]'::jsonb;
 v_split JSONB;
BEGIN
 SELECT COALESCE(array_agg(id ORDER BY driver_id, instruction_part), '{}')
 INTO v_plan_ids
 FROM hq_delivery_route_plans
 WHERE factory_order_id = p_order_id AND status NOT IN ('CANCELLED', 'COMPLETED');

 IF v_plan_ids = '{}' THEN
 RETURN jsonb_build_object('splits', '[]'::jsonb, 'optimizations', '[]'::jsonb);
 END IF;

 FOREACH v_plan_id IN ARRAY v_plan_ids LOOP
 v_split := split_route_plan_max_stops(v_plan_id, p_max_stops);
 v_splits := v_splits || v_split;
 END LOOP;

 SELECT COALESCE(array_agg(id), '{}')
 INTO v_plan_ids
 FROM hq_delivery_route_plans
 WHERE factory_order_id = p_order_id AND status NOT IN ('CANCELLED', 'COMPLETED');

 FOREACH v_plan_id IN ARRAY v_plan_ids LOOP
 v_opts := v_opts || optimize_delivery_route_stops(v_plan_id);
 END LOOP;

 RETURN jsonb_build_object('splits', v_splits, 'optimizations', v_opts);
END;
$$;

GRANT EXECUTE ON FUNCTION optimize_delivery_route_stops(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION split_route_plan_max_stops(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION post_process_driver_instructions(UUID, INT) TO authenticated;

-- Jadual kerja driver: arahan tunggal + item per hentian
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
 SELECT jsonb_agg(row_data ORDER BY row_data->>'production_date', row_data->>'instruction_part')
 FROM (
 SELECT jsonb_build_object(
 'plan_id', p.id,
 'instruction_code', p.instruction_code,
 'instruction_part', COALESCE(p.instruction_part, 1),
 'production_date', p.production_date,
 'route_name', p.route_name,
 'region_code', p.region_code,
 'route_pattern', p.route_pattern,
 'status', p.status,
 'order_phase', o.order_phase,
 'order_number', o.order_number,
 'order_status', o.status,
 'driver_id', d.id,
 'driver_name', d.full_name,
 'driver_code', d.driver_code,
 'vehicle', COALESCE(v.plate_number, v.vehicle_type),
 'handoff_completed', p.handoff_completed_at IS NOT NULL,
 'depends_on_ready', dep.status IN ('READY', 'DISPATCHED', 'COMPLETED'),
 'ai_route_summary', p.ai_route_summary,
 'ai_optimized', p.ai_optimized_at IS NOT NULL,
 'total_stops', (
 SELECT COUNT(*) FROM hq_delivery_route_stops s WHERE s.route_plan_id = p.id
 ),
 'kiosk_stops', (
 SELECT COUNT(*) FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = p.id AND COALESCE(s.is_handoff, false) = false
 ),
 'completed_stops', (
 SELECT COUNT(*) FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = p.id AND s.status = 'DELIVERED'
 ),
 'pick_summary', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'item_code', si.item_code,
 'name', si.name,
 'category', si.category,
 'total_qty', agg.total_qty,
 'unit', agg.unit
 ) ORDER BY si.category, si.item_code)
 FROM (
 SELECT si2.id AS stock_item_id, SUM(COALESCE(si3.adjusted_quantity, si3.planned_quantity, si3.quantity)) AS total_qty,
 MIN(si3.unit) AS unit
 FROM hq_delivery_route_stops s2
 JOIN hq_delivery_route_stop_items si3 ON si3.stop_id = s2.id
 JOIN stock_items si2 ON si2.id = si3.stock_item_id
 WHERE s2.route_plan_id = p.id AND COALESCE(s2.is_handoff, false) = false
 GROUP BY si2.id
 ) agg
 JOIN stock_items si ON si.id = agg.stock_item_id
 ), '[]'::jsonb),
 'stops', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'stop_id', s.id,
 'sequence', s.stop_sequence,
 'branch_code', COALESCE(b.branch_code, 'HANDOFF'),
 'branch_name', COALESCE(b.branch_name, s.notes, 'Sambut Stok'),
 'branch_id', s.branch_id,
 'is_handoff', COALESCE(s.is_handoff, false),
 'status', s.status,
 'item_count', (SELECT COUNT(*) FROM hq_delivery_route_stop_items si WHERE si.stop_id = s.id),
 'priority_score', CASE WHEN s.branch_id IS NOT NULL
 THEN branch_delivery_priority(s.branch_id, v_org_id) ELSE 0 END,
 'route_hint', CASE
 WHEN b.branch_name ILIKE '%Arah Utara%' THEN 'Ikut arah Utara'
 WHEN b.branch_name ILIKE '%Arah Selatan%' THEN 'Ikut arah Selatan'
 WHEN b.branch_name ILIKE '%Arah Barat%' THEN 'Ikut arah Barat'
 WHEN COALESCE(s.is_handoff, false) THEN 'Sambut stok hub'
 ELSE 'Laluan utama'
 END,
 'items', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'item_code', si.item_code,
 'name', si.name,
 'category', si.category,
 'quantity', COALESCE(rsi.adjusted_quantity, rsi.planned_quantity, rsi.quantity),
 'unit', rsi.unit
 ) ORDER BY si.category, si.item_code)
 FROM hq_delivery_route_stop_items rsi
 JOIN stock_items si ON si.id = rsi.stock_item_id
 WHERE rsi.stop_id = s.id
 ), '[]'::jsonb)
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
