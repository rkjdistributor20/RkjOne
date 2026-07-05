-- Susunan laluan AI untuk pesanan penghantaran manual (DO)
-- Driver beri lokasi semasa → hentian VEHICLE_TO_BRANCH disusun semula

ALTER TABLE delivery_orders
 ADD COLUMN IF NOT EXISTS ai_route_summary TEXT,
 ADD COLUMN IF NOT EXISTS ai_optimized_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS driver_current_lat DECIMAL(10, 7),
 ADD COLUMN IF NOT EXISTS driver_current_lng DECIMAL(10, 7);

-- Jarak km antara dua titik GPS (Haversine)
CREATE OR REPLACE FUNCTION geo_distance_km(
 p_lat1 DECIMAL,
 p_lng1 DECIMAL,
 p_lat2 DECIMAL,
 p_lng2 DECIMAL
)
RETURNS DECIMAL
LANGUAGE sql
IMMUTABLE
AS $$
 SELECT CASE
 WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN NULL
 ELSE (
 6371.0 * acos(
 LEAST(1.0, GREATEST(-1.0,
 cos(radians(p_lat1::float8)) * cos(radians(p_lat2::float8))
 * cos(radians(p_lng2::float8) - radians(p_lng1::float8))
 + sin(radians(p_lat1::float8)) * sin(radians(p_lat2::float8))
 ))
 )
 )::DECIMAL
 END;
$$;

-- Metadata hentian cawangan untuk susunan laluan
CREATE OR REPLACE FUNCTION branch_route_stop_meta(
 p_org_id UUID,
 p_location_ids UUID[]
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT COALESCE(jsonb_agg(
 jsonb_build_object(
 'location_id', il.id,
 'branch_id', b.id,
 'branch_code', b.branch_code,
 'branch_name', b.branch_name,
 'latitude', b.latitude,
 'longitude', b.longitude,
 'priority', branch_delivery_priority(b.id, p_org_id),
 'sort_key', route_stop_sort_key(b.branch_name, b.branch_code)
 ) ORDER BY il.id
 ), '[]'::jsonb)
 FROM inventory_locations il
 JOIN branches b ON b.id = il.branch_id
 WHERE il.organization_id = p_org_id
 AND il.id = ANY(p_location_ids);
$$;

-- Susun semula leg VEHICLE_TO_BRANCH (baki belum selesai) ikut AI + GPS
CREATE OR REPLACE FUNCTION optimize_delivery_order_route(
 p_order_id UUID,
 p_current_lat DECIMAL DEFAULT NULL,
 p_current_lng DECIMAL DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_order RECORD;
 v_org_id UUID;
 v_role TEXT;
 v_driver_id UUID;
 v_fixed_max INT := 0;
 v_leg RECORD;
 v_remaining UUID[] := '{}';
 v_ordered UUID[] := '{}';
 v_next UUID;
 v_cur_lat DECIMAL;
 v_cur_lng DECIMAL;
 v_kiosk_count INT := 0;
 v_critical INT := 0;
 v_low INT := 0;
 v_summary TEXT;
 v_new_seq INT;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT d.* INTO v_order FROM delivery_orders d WHERE d.id = p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan penghantaran tidak dijumpai'; END IF;

 v_org_id := v_order.organization_id;
 v_role := public.user_role();

 IF v_role = 'DRIVER' THEN
 SELECT id INTO v_driver_id FROM drivers
 WHERE organization_id = v_org_id AND profile_id = v_user_id AND status = 'ACTIVE'
 LIMIT 1;
 IF v_driver_id IS NULL OR v_order.primary_driver_id IS DISTINCT FROM v_driver_id THEN
 RAISE EXCEPTION 'Pesanan ini bukan untuk pemandu anda';
 END IF;
 END IF;

 -- Leg tetap (bukan VEHICLE_TO_BRANCH atau sudah selesai) kekal urutan asal
 SELECT COALESCE(MAX(leg_sequence), 0) INTO v_fixed_max
 FROM delivery_legs
 WHERE delivery_order_id = p_order_id
 AND (leg_type <> 'VEHICLE_TO_BRANCH' OR status = 'DELIVERED');

 SELECT COALESCE(array_agg(id ORDER BY leg_sequence), '{}')
 INTO v_remaining
 FROM delivery_legs
 WHERE delivery_order_id = p_order_id
 AND leg_type = 'VEHICLE_TO_BRANCH'
 AND status NOT IN ('DELIVERED', 'CANCELLED');

 IF v_remaining = '{}' THEN
 RETURN jsonb_build_object(
 'order_id', p_order_id,
 'kiosk_stops', 0,
 'summary', 'Tiada hentian baki untuk disusun'
 );
 END IF;

 v_cur_lat := p_current_lat;
 v_cur_lng := p_current_lng;

 -- Greedy nearest-neighbor dengan berat keutamaan stok
 WHILE array_length(v_remaining, 1) > 0 LOOP
 SELECT dl.id INTO v_next
 FROM unnest(v_remaining) AS rid(id)
 JOIN delivery_legs dl ON dl.id = rid.id
 JOIN inventory_locations il ON il.id = dl.to_location_id
 JOIN branches b ON b.id = il.branch_id
 ORDER BY
 branch_delivery_priority(b.id, v_org_id) DESC,
 CASE
 WHEN v_cur_lat IS NOT NULL AND v_cur_lng IS NOT NULL
 AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
 THEN geo_distance_km(v_cur_lat, v_cur_lng, b.latitude, b.longitude)
 ELSE route_stop_sort_key(b.branch_name, b.branch_code)::DECIMAL
 END ASC NULLS LAST,
 b.branch_code
 LIMIT 1;

 v_ordered := array_append(v_ordered, v_next);
 v_remaining := array_remove(v_remaining, v_next);

 SELECT b.latitude, b.longitude INTO v_cur_lat, v_cur_lng
 FROM delivery_legs dl
 JOIN inventory_locations il ON il.id = dl.to_location_id
 JOIN branches b ON b.id = il.branch_id
 WHERE dl.id = v_next;

 IF v_cur_lat IS NULL OR v_cur_lng IS NULL THEN
 v_cur_lat := p_current_lat;
 v_cur_lng := p_current_lng;
 END IF;
 END LOOP;

 v_new_seq := v_fixed_max;
 FOREACH v_next IN ARRAY v_ordered LOOP
 v_new_seq := v_new_seq + 1;
 UPDATE delivery_legs SET leg_sequence = v_new_seq WHERE id = v_next;
 END LOOP;

 SELECT COUNT(*) INTO v_kiosk_count FROM unnest(v_ordered);

 SELECT
 COUNT(*) FILTER (WHERE branch_delivery_priority(b.id, v_org_id) >= 100),
 COUNT(*) FILTER (
 WHERE branch_delivery_priority(b.id, v_org_id) >= 50
 AND branch_delivery_priority(b.id, v_org_id) < 100
 )
 INTO v_critical, v_low
 FROM delivery_legs dl
 JOIN inventory_locations il ON il.id = dl.to_location_id
 JOIN branches b ON b.id = il.branch_id
 WHERE dl.id = ANY(v_ordered);

 v_summary := format(
 'AI: %s hentian — %s kritikal, %s rendah. %s',
 v_kiosk_count,
 v_critical,
 v_low,
 CASE
 WHEN p_current_lat IS NOT NULL THEN 'Susunan dari lokasi semasa pemandu (GPS).'
 ELSE 'Susunan ikut keutamaan stok & arah jalan Utara→Barat→Selatan.'
 END
 );

 UPDATE delivery_orders
 SET ai_optimized_at = now(),
 ai_route_summary = v_summary,
 driver_current_lat = p_current_lat,
 driver_current_lng = p_current_lng,
 final_destination_id = (
 SELECT to_location_id FROM delivery_legs WHERE id = v_ordered[array_length(v_ordered, 1)]
 ),
 updated_at = now()
 WHERE id = p_order_id;

 RETURN jsonb_build_object(
 'order_id', p_order_id,
 'kiosk_stops', v_kiosk_count,
 'critical_first', v_critical,
 'low_priority', v_low,
 'summary', v_summary,
 'leg_order', to_jsonb(v_ordered)
 );
END;
$$;

-- create_delivery_order: simpan ringkasan AI jika ada
CREATE OR REPLACE FUNCTION create_delivery_order(
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
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_order_id UUID;
 v_order_number TEXT;
 v_leg JSONB;
 v_leg_id UUID;
 v_item JSONB;
 v_stock RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT organization_id INTO v_org_id
 FROM inventory_locations WHERE id = p_origin_location_id;

 IF v_org_id IS NULL THEN RAISE EXCEPTION 'Origin location not found'; END IF;

 v_order_number := generate_fleet_number('DO');

 INSERT INTO delivery_orders (
 organization_id, order_number, status,
 origin_location_id, final_destination_id,
 primary_driver_id, primary_vehicle_id,
 scheduled_date, notes, created_by,
 ai_route_summary, ai_optimized_at
 ) VALUES (
 v_org_id, v_order_number, 'PENDING',
 p_origin_location_id, p_final_destination_id,
 p_primary_driver_id, p_primary_vehicle_id,
 p_scheduled_date, p_notes, v_user_id,
 p_ai_route_summary,
 CASE WHEN p_ai_route_summary IS NOT NULL THEN now() ELSE NULL END
 ) RETURNING id INTO v_order_id;

 FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
 LOOP
 INSERT INTO delivery_legs (
 delivery_order_id, leg_sequence, leg_type,
 from_location_id, to_location_id,
 driver_id, vehicle_id, status
 ) VALUES (
 v_order_id,
 (v_leg->>'leg_sequence')::int,
 (v_leg->>'leg_type')::delivery_leg_type,
 (v_leg->>'from_location_id')::uuid,
 (v_leg->>'to_location_id')::uuid,
 NULLIF(v_leg->>'driver_id', '')::uuid,
 NULLIF(v_leg->>'vehicle_id', '')::uuid,
 'PENDING'
 ) RETURNING id INTO v_leg_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(v_leg->'items')
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 INSERT INTO delivery_leg_items (leg_id, stock_item_id, quantity, unit)
 VALUES (
 v_leg_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
 );
 END LOOP;
 END LOOP;

 RETURN jsonb_build_object(
 'order_id', v_order_id,
 'order_number', v_order_number
 );
END;
$$;

GRANT EXECUTE ON FUNCTION geo_distance_km(DECIMAL, DECIMAL, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION branch_route_stop_meta(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION optimize_delivery_order_route(UUID, DECIMAL, DECIMAL) TO authenticated;
