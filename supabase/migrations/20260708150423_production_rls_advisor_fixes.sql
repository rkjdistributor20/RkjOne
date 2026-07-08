-- RKJ One production advisor fixes.
-- Scope: RLS enablement, dashboard view invoker security, and two PL/pgSQL lint errors.

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.branches FROM anon;
REVOKE ALL ON TABLE public.drivers FROM anon;
REVOKE ALL ON TABLE public.vehicles FROM anon;

ALTER VIEW public.dashboard_stats SET (security_invoker = true);
REVOKE ALL ON TABLE public.dashboard_stats FROM anon;
REVOKE ALL ON TABLE public.dashboard_stats FROM authenticated;
GRANT SELECT ON TABLE public.dashboard_stats TO authenticated;

CREATE OR REPLACE FUNCTION public.create_delivery_routes_for_factory_order(p_order_id UUID)
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

 SELECT * INTO v_order FROM public.hq_factory_orders WHERE id = p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

 SELECT COUNT(*) INTO v_existing
 FROM public.hq_delivery_route_plans
 WHERE factory_order_id = p_order_id AND status != 'CANCELLED';

 IF v_existing > 0 THEN
 RAISE EXCEPTION 'Laluan sudah dirancang untuk order ini';
 END IF;

 FOR v_region IN
 SELECT DISTINCT COALESCE(r.code, b.area::region_code)
 FROM public.hq_factory_order_branch_items bi
 JOIN public.branches b ON b.id = bi.branch_id
 LEFT JOIN public.regions r ON r.id = b.region_id
 WHERE bi.order_id = p_order_id
 LOOP
 SELECT driver_id, vehicle_id, route_name
 INTO v_driver, v_vehicle, v_route_name
 FROM public.default_driver_for_region(v_order.organization_id, v_region);

 INSERT INTO public.hq_delivery_route_plans (
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
 SELECT DISTINCT
 b.id AS branch_id,
 il.id AS location_id,
 b.branch_name,
 b.branch_code,
 public.route_stop_sort_key(b.branch_name, b.branch_code) AS route_sort_key
 FROM public.hq_factory_order_branch_items bi
 JOIN public.branches b ON b.id = bi.branch_id
 LEFT JOIN public.regions r ON r.id = b.region_id
 JOIN public.inventory_locations il ON il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
 WHERE bi.order_id = p_order_id
 AND COALESCE(r.code, b.area::region_code) = v_region
 ORDER BY route_sort_key, b.branch_code
 LOOP
 v_seq := v_seq + 1;
 INSERT INTO public.hq_delivery_route_stops (
 route_plan_id, branch_id, location_id, stop_sequence
 ) VALUES (v_plan_id, v_stop.branch_id, v_stop.location_id, v_seq);

 INSERT INTO public.hq_delivery_route_stop_items (stop_id, stock_item_id, quantity, unit)
 SELECT s.id, bi.stock_item_id, bi.quantity, bi.unit
 FROM public.hq_delivery_route_stops s
 JOIN public.hq_factory_order_branch_items bi
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

 UPDATE public.hq_factory_orders
 SET routes_planned_at = now(), updated_at = now()
 WHERE id = p_order_id;

 RETURN jsonb_build_object('order_id', p_order_id, 'routes', v_plans);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_delivery_routes_for_factory_order(
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
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya HQ boleh susun laluan penghantaran';
 END IF;

 SELECT * INTO v_order FROM public.hq_factory_orders WHERE id = p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

 IF p_replace THEN
 DELETE FROM public.hq_delivery_route_plans
 WHERE factory_order_id = p_order_id AND status IN ('PLANNED', 'WAITING_HANDOFF', 'READY');
 ELSIF EXISTS (
 SELECT 1 FROM public.hq_delivery_route_plans
 WHERE factory_order_id = p_order_id AND status NOT IN ('CANCELLED', 'COMPLETED')
 ) THEN
 RAISE EXCEPTION 'Laluan sudah wujud - guna replace=true untuk rancang semula';
 END IF;

 UPDATE public.hq_factory_order_branch_items bi
 SET assigned_driver_id = public.default_driver_id_for_branch(v_order.organization_id, bi.branch_id)
 WHERE bi.order_id = p_order_id AND bi.assigned_driver_id IS NULL;

 IF EXISTS (
 SELECT 1 FROM public.hq_factory_order_branch_items bi
 JOIN public.drivers d ON d.id = bi.assigned_driver_id
 WHERE bi.order_id = p_order_id AND public.driver_route_role(d.driver_code) = 'HUB_RELAY'
 ) THEN
 SELECT d.id, d.driver_code, d.full_name, d.route_description,
 (SELECT v.id FROM public.vehicles v WHERE v.default_driver_id = d.id LIMIT 1) AS vehicle_id
 INTO v_driver
 FROM public.drivers d
 WHERE d.organization_id = v_order.organization_id AND d.driver_code = 'D001' AND d.status = 'ACTIVE'
 LIMIT 1;

 IF v_driver.id IS NOT NULL THEN
 INSERT INTO public.hq_delivery_route_plans (
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
 (SELECT il.id FROM public.inventory_locations il
 JOIN public.vehicles v ON v.id = il.vehicle_id
 WHERE v.default_driver_id = d.id AND il.location_type = 'FLEET_VEHICLE'
 LIMIT 1),
 (SELECT id FROM public.inventory_locations
 WHERE organization_id = v_order.organization_id AND location_type = 'HQ_WAREHOUSE'
 LIMIT 1)
 ) AS handoff_location_id
 FROM public.hq_factory_order_branch_items bi
 JOIN public.drivers d ON d.id = bi.assigned_driver_id
 WHERE bi.order_id = p_order_id
 AND public.driver_route_role(d.driver_code) = 'HUB_RELAY'
 LOOP
 v_seq := v_seq + 1;
 INSERT INTO public.hq_delivery_route_stops (
 route_plan_id, branch_id, location_id, stop_sequence,
 is_handoff, handoff_driver_id, driver_id, notes
 ) VALUES (
 v_primary_plan_id, NULL, v_stop.handoff_location_id, v_seq,
 true, v_stop.relay_driver_id, v_driver.id,
 'Sambut stok -> ' || v_stop.relay_name
 );

 INSERT INTO public.hq_delivery_route_stop_items (stop_id, stock_item_id, quantity, unit, planned_quantity)
 SELECT s.id, bi.stock_item_id, SUM(bi.quantity), MIN(bi.unit), SUM(bi.quantity)
 FROM public.hq_delivery_route_stops s
 JOIN public.hq_factory_order_branch_items bi
 ON bi.order_id = p_order_id AND bi.assigned_driver_id = v_stop.relay_driver_id
 WHERE s.route_plan_id = v_primary_plan_id AND s.stop_sequence = v_seq
 GROUP BY s.id, bi.stock_item_id;
 END LOOP;

 v_plans := v_plans || jsonb_build_array(jsonb_build_object(
 'plan_id', v_primary_plan_id, 'route_pattern', 'HUB_PRIMARY', 'stop_count', v_seq
 ));
 END IF;
 END IF;

 FOR v_driver IN
 SELECT DISTINCT d.id, d.driver_code, d.full_name, d.route_description,
 public.driver_route_role(d.driver_code) AS role,
 (SELECT v.id FROM public.vehicles v WHERE v.default_driver_id = d.id LIMIT 1) AS vehicle_id,
 COALESCE(r.code, b.area::region_code) AS region_code
 FROM public.hq_factory_order_branch_items bi
 JOIN public.drivers d ON d.id = bi.assigned_driver_id
 JOIN public.branches b ON b.id = bi.branch_id
 LEFT JOIN public.regions r ON r.id = b.region_id
 WHERE bi.order_id = p_order_id
 LOOP
 v_role := v_driver.role;
 v_plan_id := NULL;

 INSERT INTO public.hq_delivery_route_plans (
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
 SELECT DISTINCT
 b.id AS branch_id,
 il.id AS location_id,
 b.branch_name,
 b.branch_code,
 public.route_stop_sort_key(b.branch_name, b.branch_code) AS route_sort_key
 FROM public.hq_factory_order_branch_items bi
 JOIN public.branches b ON b.id = bi.branch_id
 JOIN public.inventory_locations il ON il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
 WHERE bi.order_id = p_order_id AND bi.assigned_driver_id = v_driver.id
 ORDER BY route_sort_key, b.branch_code
 LOOP
 v_seq := v_seq + 1;
 INSERT INTO public.hq_delivery_route_stops (
 route_plan_id, branch_id, location_id, stop_sequence, driver_id
 ) VALUES (v_plan_id, v_stop.branch_id, v_stop.location_id, v_seq, v_driver.id);

 INSERT INTO public.hq_delivery_route_stop_items (stop_id, stock_item_id, quantity, unit, planned_quantity)
 SELECT s.id, bi.stock_item_id, bi.quantity, bi.unit, bi.quantity
 FROM public.hq_delivery_route_stops s
 JOIN public.hq_factory_order_branch_items bi
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

 UPDATE public.hq_factory_orders SET routes_planned_at = now(), updated_at = now() WHERE id = p_order_id;

 RETURN jsonb_build_object('order_id', p_order_id, 'routes', v_plans);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bank_in(
 p_amount NUMERIC,
 p_collection_id UUID DEFAULT NULL,
 p_bank_name TEXT DEFAULT NULL,
 p_reference_number TEXT DEFAULT NULL,
 p_slip_url TEXT DEFAULT NULL,
 p_banked_at TIMESTAMPTZ DEFAULT now(),
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
 v_id UUID;
 v_number TEXT;
 v_role TEXT;
 v_branch_id UUID;
 v_collection_amount NUMERIC := NULL;
 v_usage_total NUMERIC := 0;
 v_banked_total NUMERIC := 0;
 v_remaining NUMERIC := NULL;
 v_new_remaining NUMERIC := NULL;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 v_role := public.user_role();
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 IF COALESCE(p_amount, 0) <= 0 THEN
 RAISE EXCEPTION 'Jumlah bank-in mesti lebih daripada 0';
 END IF;

 v_org_id := public.organization_id();

 IF p_collection_id IS NOT NULL THEN
 SELECT branch_id, amount INTO v_branch_id, v_collection_amount
 FROM public.finance_collections
 WHERE id = p_collection_id
 AND organization_id = v_org_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Collection not found';
 END IF;

 IF v_role = 'AREA_MANAGER' AND (v_branch_id IS NULL OR NOT public.has_branch_access(v_branch_id)) THEN
 RAISE EXCEPTION 'Area Manager can only bank in collections within own area';
 END IF;

 SELECT COALESCE(SUM(amount), 0)
 INTO v_usage_total
 FROM public.finance_collection_usages
 WHERE collection_id = p_collection_id
 AND organization_id = v_org_id
 AND status <> 'REJECTED';

 SELECT COALESCE(SUM(amount), 0)
 INTO v_banked_total
 FROM public.bank_in_records
 WHERE collection_id = p_collection_id
 AND organization_id = v_org_id;

 v_remaining := COALESCE(v_collection_amount, 0) - v_usage_total - v_banked_total;
 IF p_amount > v_remaining THEN
 RAISE EXCEPTION 'Jumlah bank-in melebihi baki selepas penggunaan cash collection';
 END IF;
 END IF;

 IF v_role = 'AREA_MANAGER' AND p_collection_id IS NULL THEN
 RAISE EXCEPTION 'Area Manager must link bank-in to a branch collection';
 END IF;

 v_number := public.generate_doc_number('BI', v_org_id);

 INSERT INTO public.bank_in_records (
 organization_id, bank_in_number, collection_id, amount,
 bank_name, reference_number, slip_url, banked_at, banked_by, notes
 ) VALUES (
 v_org_id, v_number, p_collection_id, p_amount,
 p_bank_name, p_reference_number, p_slip_url, p_banked_at, v_user_id, p_notes
 ) RETURNING id INTO v_id;

 IF p_collection_id IS NOT NULL THEN
 v_new_remaining := COALESCE(v_remaining, 0) - p_amount;

 UPDATE public.finance_collections
 SET status = CASE
  WHEN v_new_remaining <= 0.009 THEN 'BANKED'::collection_status
  ELSE 'COLLECTED'::collection_status
 END
 WHERE id = p_collection_id
 AND organization_id = v_org_id;
 END IF;

 RETURN jsonb_build_object(
 'bank_in_id', v_id,
 'bank_in_number', v_number,
 'remaining_bank_in', COALESCE(v_new_remaining, 0)
 );
END;
$$;

REVOKE ALL ON FUNCTION public.create_delivery_routes_for_factory_order(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_delivery_routes_for_factory_order(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_bank_in(NUMERIC, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_delivery_routes_for_factory_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_routes_for_factory_order(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_bank_in(NUMERIC, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
