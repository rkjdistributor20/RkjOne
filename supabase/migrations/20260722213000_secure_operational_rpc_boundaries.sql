-- Enforce tenant and role boundaries inside SECURITY DEFINER RPCs. API checks
-- remain useful for UX, but these guards protect direct PostgREST calls too.

CREATE OR REPLACE FUNCTION public.clock_in_staff(p_staff_id UUID, p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_user_id UUID := auth.uid();
 v_current_org UUID := organization_id();
 v_role TEXT := COALESCE(user_role()::TEXT, '');
 v_staff RECORD;
 v_branch_org UUID;
 v_attendance_id UUID;
 v_shift_id UUID;
BEGIN
 IF v_user_id IS NULL OR v_current_org IS NULL THEN
  RAISE EXCEPTION 'Not authenticated';
 END IF;

 SELECT s.organization_id, s.profile_id, s.branch_id, s.status
 INTO v_staff
 FROM staff s
 WHERE s.id = p_staff_id;

 SELECT b.organization_id INTO v_branch_org
 FROM branches b
 WHERE b.id = p_branch_id;

 IF NOT FOUND OR v_staff.organization_id IS DISTINCT FROM v_current_org
    OR v_branch_org IS DISTINCT FROM v_current_org
    OR v_staff.branch_id IS DISTINCT FROM p_branch_id
    OR v_staff.status::TEXT <> 'ACTIVE' THEN
  RAISE EXCEPTION 'Staff or branch is outside your access scope';
 END IF;

 IF v_staff.profile_id IS DISTINCT FROM v_user_id THEN
  IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER', 'HR')
     OR NOT has_branch_access(p_branch_id) THEN
   RAISE EXCEPTION 'Not authorized to clock in this staff member';
  END IF;
 END IF;

 SELECT ss.id INTO v_shift_id
 FROM staff_shifts ss
 WHERE ss.staff_id = p_staff_id
   AND ss.branch_id = p_branch_id
   AND ss.organization_id = v_current_org
   AND ss.shift_date = CURRENT_DATE
   AND ss.status = 'APPROVED'
 ORDER BY ss.created_at DESC
 LIMIT 1;

 IF v_shift_id IS NULL THEN
  RAISE EXCEPTION 'No approved shift found for today';
 END IF;

 INSERT INTO attendance_records (
  organization_id, staff_id, staff_shift_id, branch_id, attendance_date, clock_in
 ) VALUES (
  v_current_org, p_staff_id, v_shift_id, p_branch_id, CURRENT_DATE, now()
 )
 ON CONFLICT (staff_id, attendance_date)
 DO UPDATE SET clock_in = now(), updated_at = now()
 RETURNING id INTO v_attendance_id;

 UPDATE staff_shifts
 SET actual_start = now(), updated_at = now()
 WHERE id = v_shift_id AND organization_id = v_current_org;

 RETURN jsonb_build_object('attendance_id', v_attendance_id, 'clock_in', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_out_staff(p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_user_id UUID := auth.uid();
 v_current_org UUID := organization_id();
 v_role TEXT := COALESCE(user_role()::TEXT, '');
 v_att RECORD;
 v_staff RECORD;
 v_hours NUMERIC;
 v_scheduled NUMERIC;
 v_ot NUMERIC;
BEGIN
 IF v_user_id IS NULL OR v_current_org IS NULL THEN
  RAISE EXCEPTION 'Not authenticated';
 END IF;

 SELECT s.organization_id, s.profile_id, s.branch_id, s.status
 INTO v_staff
 FROM staff s
 WHERE s.id = p_staff_id;

 IF NOT FOUND OR v_staff.organization_id IS DISTINCT FROM v_current_org
    OR v_staff.status::TEXT <> 'ACTIVE' THEN
  RAISE EXCEPTION 'Staff is outside your access scope';
 END IF;

 IF v_staff.profile_id IS DISTINCT FROM v_user_id THEN
  IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER', 'HR')
     OR v_staff.branch_id IS NULL
     OR NOT has_branch_access(v_staff.branch_id) THEN
   RAISE EXCEPTION 'Not authorized to clock out this staff member';
  END IF;
 END IF;

 SELECT ar.* INTO v_att
 FROM attendance_records ar
 WHERE ar.staff_id = p_staff_id
   AND ar.organization_id = v_current_org
   AND ar.attendance_date = CURRENT_DATE
   AND ar.clock_out IS NULL
 ORDER BY ar.clock_in DESC
 LIMIT 1;

 IF NOT FOUND THEN
  RAISE EXCEPTION 'No active clock-in found';
 END IF;

 v_hours := EXTRACT(EPOCH FROM (now() - v_att.clock_in)) / 3600.0;

 SELECT ss.scheduled_hours INTO v_scheduled
 FROM staff_shifts ss
 WHERE ss.id = v_att.staff_shift_id AND ss.organization_id = v_current_org;
 v_ot := GREATEST(v_hours - COALESCE(v_scheduled, 8), 0);

 UPDATE attendance_records
 SET clock_out = now(),
     hours_worked = ROUND(v_hours::NUMERIC, 2),
     ot_hours = ROUND(v_ot::NUMERIC, 2),
     updated_at = now()
 WHERE id = v_att.id AND organization_id = v_current_org;

 UPDATE staff_shifts
 SET actual_end = now(),
     actual_hours = ROUND(v_hours::NUMERIC, 2),
     ot_hours = ROUND(v_ot::NUMERIC, 2),
     updated_at = now()
 WHERE id = v_att.staff_shift_id AND organization_id = v_current_org;

 RETURN jsonb_build_object(
  'hours_worked', ROUND(v_hours::NUMERIC, 2),
  'ot_hours', ROUND(v_ot::NUMERIC, 2)
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pos_product_availability(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_current_org UUID := organization_id();
 v_location_id UUID;
 v_result JSONB := '{}'::JSONB;
 v_product RECORD;
 v_bom RECORD;
 v_balance NUMERIC;
 v_max INT;
 v_product_max INT;
BEGIN
 IF auth.uid() IS NULL OR v_current_org IS NULL
    OR NOT has_branch_access(p_branch_id) THEN
  RAISE EXCEPTION 'Not authorized for this branch';
 END IF;

 SELECT il.id INTO v_location_id
 FROM inventory_locations il
 JOIN branches b ON b.id = il.branch_id
 WHERE il.branch_id = p_branch_id
   AND il.organization_id = v_current_org
   AND b.organization_id = v_current_org
   AND il.location_type = 'BRANCH_KIOSK'
 LIMIT 1;

 IF v_location_id IS NULL THEN
  RETURN '{}'::JSONB;
 END IF;

 FOR v_product IN
  SELECT p.id FROM products p
  WHERE p.organization_id = v_current_org AND p.status = 'ACTIVE'
 LOOP
  v_product_max := NULL;
  FOR v_bom IN
   SELECT pb.quantity, pb.stock_item_id
   FROM product_bom pb
   WHERE pb.product_id = v_product.id AND pb.auto_deduct = TRUE
  LOOP
   SELECT COALESCE(ib.quantity, 0) INTO v_balance
   FROM inventory_balances ib
   WHERE ib.location_id = v_location_id AND ib.stock_item_id = v_bom.stock_item_id;

   IF v_bom.quantity > 0 THEN
    v_max := FLOOR(COALESCE(v_balance, 0) / v_bom.quantity)::INT;
    v_product_max := CASE WHEN v_product_max IS NULL THEN v_max ELSE LEAST(v_product_max, v_max) END;
   END IF;
  END LOOP;

  IF v_product_max IS NOT NULL THEN
   v_result := v_result || jsonb_build_object(
    v_product.id::TEXT,
    jsonb_build_object(
     'available', v_product_max,
     'status', CASE WHEN v_product_max <= 0 THEN 'OUT' WHEN v_product_max <= 5 THEN 'LOW' ELSE 'OK' END
    )
   );
  END IF;
 END LOOP;

 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_route_stop_meta(p_org_id UUID, p_location_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_current_org UUID := organization_id();
 v_role TEXT := COALESCE(user_role()::TEXT, '');
 v_result JSONB;
BEGIN
 IF auth.uid() IS NULL OR v_current_org IS NULL OR p_org_id IS DISTINCT FROM v_current_org
    OR v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'DRIVER') THEN
  RAISE EXCEPTION 'Not authorized to read route metadata';
 END IF;

 SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
   'location_id', il.id,
   'branch_id', b.id,
   'branch_code', b.branch_code,
   'branch_name', b.branch_name,
   'latitude', b.latitude,
   'longitude', b.longitude,
   'priority', branch_delivery_priority(b.id, v_current_org),
   'sort_key', route_stop_sort_key(b.branch_name, b.branch_code)
  ) ORDER BY il.id
 ), '[]'::JSONB)
 INTO v_result
 FROM inventory_locations il
 JOIN branches b ON b.id = il.branch_id AND b.organization_id = v_current_org
 WHERE il.organization_id = v_current_org AND il.id = ANY(p_location_ids);

 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_delivery_order(
 p_origin_location_id UUID,
 p_final_destination_id UUID,
 p_legs JSONB,
 p_primary_driver_id UUID DEFAULT NULL,
 p_primary_vehicle_id UUID DEFAULT NULL,
 p_scheduled_date DATE DEFAULT NULL,
 p_notes TEXT DEFAULT NULL,
 p_ai_route_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_user_id UUID := auth.uid();
 v_org_id UUID := organization_id();
 v_role TEXT := COALESCE(user_role()::TEXT, '');
 v_order_id UUID;
 v_order_number TEXT;
 v_leg JSONB;
 v_leg_id UUID;
 v_item JSONB;
 v_stock RECORD;
BEGIN
 IF v_user_id IS NULL OR v_org_id IS NULL THEN
  RAISE EXCEPTION 'Not authenticated';
 END IF;
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER') THEN
  RAISE EXCEPTION 'Not authorized to create delivery orders';
 END IF;
 IF jsonb_typeof(p_legs) <> 'array' OR jsonb_array_length(p_legs) = 0 THEN
  RAISE EXCEPTION 'At least one delivery leg is required';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM inventory_locations il
  WHERE il.id = p_origin_location_id AND il.organization_id = v_org_id
 ) OR NOT EXISTS (
  SELECT 1 FROM inventory_locations il
  WHERE il.id = p_final_destination_id AND il.organization_id = v_org_id
 ) THEN
  RAISE EXCEPTION 'Origin or destination is outside your organization';
 END IF;
 IF p_primary_driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d WHERE d.id = p_primary_driver_id AND d.organization_id = v_org_id
 ) THEN
  RAISE EXCEPTION 'Driver is outside your organization';
 END IF;
 IF p_primary_vehicle_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM vehicles v WHERE v.id = p_primary_vehicle_id AND v.organization_id = v_org_id
 ) THEN
  RAISE EXCEPTION 'Vehicle is outside your organization';
 END IF;

 v_order_number := generate_fleet_number('DO');
 INSERT INTO delivery_orders (
  organization_id, order_number, status, origin_location_id, final_destination_id,
  primary_driver_id, primary_vehicle_id, scheduled_date, notes, created_by,
  ai_route_summary, ai_optimized_at
 ) VALUES (
  v_org_id, v_order_number, 'PENDING', p_origin_location_id, p_final_destination_id,
  p_primary_driver_id, p_primary_vehicle_id, p_scheduled_date, p_notes, v_user_id,
  p_ai_route_summary, CASE WHEN p_ai_route_summary IS NOT NULL THEN now() ELSE NULL END
 ) RETURNING id INTO v_order_id;

 FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
 LOOP
  IF NOT EXISTS (
   SELECT 1 FROM inventory_locations il
   WHERE il.id IN ((v_leg->>'from_location_id')::UUID, (v_leg->>'to_location_id')::UUID)
     AND il.organization_id = v_org_id
   GROUP BY il.organization_id HAVING COUNT(DISTINCT il.id) = 2
  ) THEN
   RAISE EXCEPTION 'Delivery leg contains a location outside your organization';
  END IF;
  IF NULLIF(v_leg->>'driver_id', '') IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d
   WHERE d.id = (v_leg->>'driver_id')::UUID AND d.organization_id = v_org_id
  ) THEN
   RAISE EXCEPTION 'Delivery leg contains a driver outside your organization';
  END IF;
  IF NULLIF(v_leg->>'vehicle_id', '') IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM vehicles v
   WHERE v.id = (v_leg->>'vehicle_id')::UUID AND v.organization_id = v_org_id
  ) THEN
   RAISE EXCEPTION 'Delivery leg contains a vehicle outside your organization';
  END IF;

  INSERT INTO delivery_legs (
   delivery_order_id, leg_sequence, leg_type, from_location_id, to_location_id,
   driver_id, vehicle_id, status
  ) VALUES (
   v_order_id, (v_leg->>'leg_sequence')::INT, (v_leg->>'leg_type')::delivery_leg_type,
   (v_leg->>'from_location_id')::UUID, (v_leg->>'to_location_id')::UUID,
   NULLIF(v_leg->>'driver_id', '')::UUID, NULLIF(v_leg->>'vehicle_id', '')::UUID, 'PENDING'
  ) RETURNING id INTO v_leg_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_leg->'items', '[]'::JSONB))
  LOOP
   SELECT si.* INTO v_stock
   FROM stock_items si
   WHERE si.id = (v_item->>'stock_item_id')::UUID AND si.organization_id = v_org_id;
   IF NOT FOUND OR COALESCE((v_item->>'quantity')::NUMERIC, 0) <= 0 THEN
    RAISE EXCEPTION 'Invalid stock item or quantity in delivery leg';
   END IF;
   INSERT INTO delivery_leg_items (leg_id, stock_item_id, quantity, unit)
   VALUES (
    v_leg_id, v_stock.id, (v_item->>'quantity')::NUMERIC,
    COALESCE(NULLIF(v_item->>'unit', '')::stock_unit, v_stock.base_unit)
   );
  END LOOP;
 END LOOP;

 RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

-- Old overloads predate the AI-route contract and lack complete tenant checks.
REVOKE EXECUTE ON FUNCTION public.create_delivery_order(UUID, UUID, JSONB, UUID, UUID, DATE, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_delivery_order(UUID, JSONB, TEXT, UUID, UUID, UUID, DATE) FROM authenticated;

REVOKE ALL ON FUNCTION public.clock_in_staff(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clock_out_staff(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pos_product_availability(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branch_route_stop_meta(UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_delivery_order(UUID, UUID, JSONB, UUID, UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.clock_in_staff(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clock_out_staff(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pos_product_availability(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branch_route_stop_meta(UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_delivery_order(UUID, UUID, JSONB, UUID, UUID, DATE, TEXT, TEXT) TO authenticated, service_role;
