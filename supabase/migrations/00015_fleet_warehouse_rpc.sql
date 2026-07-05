-- RKJ One: Fleet delivery & warehouse audit RPC
-- Migration 00015

CREATE OR REPLACE FUNCTION generate_fleet_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
 RETURN p_prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' ||
 lpad(floor(random() * 9000 + 1000)::int::text, 4, '0');
END;
$$;

-- ============================================================
-- CREATE DELIVERY ORDER (multi-leg)
-- ============================================================

CREATE OR REPLACE FUNCTION create_delivery_order(
 p_origin_location_id UUID,
 p_final_destination_id UUID,
 p_legs JSONB,
 p_primary_driver_id UUID DEFAULT NULL,
 p_primary_vehicle_id UUID DEFAULT NULL,
 p_scheduled_date DATE DEFAULT NULL,
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
 scheduled_date, notes, created_by
 ) VALUES (
 v_org_id, v_order_number, 'PENDING',
 p_origin_location_id, p_final_destination_id,
 p_primary_driver_id, p_primary_vehicle_id,
 p_scheduled_date, p_notes, v_user_id
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

-- ============================================================
-- DISPATCH DELIVERY LEG
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_delivery_leg(p_leg_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_leg RECORD;
 v_item RECORD;
 v_balance NUMERIC;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT dl.*, d.organization_id
 INTO v_leg FROM delivery_legs dl
 JOIN delivery_orders d ON d.id = dl.delivery_order_id
 WHERE dl.id = p_leg_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Leg not found'; END IF;
 IF v_leg.status != 'PENDING' THEN RAISE EXCEPTION 'Leg already dispatched'; END IF;

 FOR v_item IN SELECT * FROM delivery_leg_items WHERE leg_id = p_leg_id
 LOOP
 SELECT COALESCE(quantity, 0) INTO v_balance
 FROM inventory_balances
 WHERE location_id = v_leg.from_location_id AND stock_item_id = v_item.stock_item_id;

 IF COALESCE(v_balance, 0) < v_item.quantity THEN
 RAISE EXCEPTION 'Insufficient stock at origin for dispatch';
 END IF;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, created_by
 ) VALUES (
 v_leg.organization_id, 'TRANSFER_OUT', v_leg.from_location_id,
 v_item.stock_item_id, -v_item.quantity, v_item.unit,
 'delivery_leg', p_leg_id, v_user_id
 );
 END LOOP;

 UPDATE delivery_legs SET
 status = 'IN_TRANSIT', dispatched_at = now(), updated_at = now()
 WHERE id = p_leg_id;

 UPDATE delivery_orders SET status = 'IN_TRANSIT', updated_at = now()
 WHERE id = v_leg.delivery_order_id;

 RETURN jsonb_build_object('leg_id', p_leg_id, 'status', 'IN_TRANSIT');
END;
$$;

-- ============================================================
-- SUBMIT PROOF OF DELIVERY (complete leg)
-- ============================================================

CREATE OR REPLACE FUNCTION submit_proof_of_delivery(
 p_leg_id UUID,
 p_receiver_name TEXT,
 p_receiver_signature_url TEXT DEFAULT NULL,
 p_gps_latitude NUMERIC DEFAULT NULL,
 p_gps_longitude NUMERIC DEFAULT NULL,
 p_driver_notes TEXT DEFAULT NULL,
 p_image_urls JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_leg RECORD;
 v_item RECORD;
 v_pod_id UUID;
 v_img TEXT;
 v_pending INT;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT dl.*, d.organization_id, d.id AS order_id
 INTO v_leg FROM delivery_legs dl
 JOIN delivery_orders d ON d.id = dl.delivery_order_id
 WHERE dl.id = p_leg_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Leg not found'; END IF;
 IF v_leg.status != 'IN_TRANSIT' THEN RAISE EXCEPTION 'Leg must be in transit'; END IF;

 FOR v_item IN SELECT * FROM delivery_leg_items WHERE leg_id = p_leg_id
 LOOP
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, created_by
 ) VALUES (
 v_leg.organization_id, 'TRANSFER_IN', v_leg.to_location_id,
 v_item.stock_item_id, v_item.quantity, v_item.unit,
 'delivery_leg', p_leg_id, v_user_id
 );
 UPDATE delivery_leg_items SET received_quantity = quantity WHERE id = v_item.id;
 END LOOP;

 INSERT INTO proof_of_delivery (
 organization_id, delivery_leg_id, receiver_name,
 receiver_signature_url, driver_id, driver_notes,
 gps_latitude, gps_longitude, created_by
 ) VALUES (
 v_leg.organization_id, p_leg_id, p_receiver_name,
 p_receiver_signature_url, v_leg.driver_id, p_driver_notes,
 p_gps_latitude, p_gps_longitude, v_user_id
 ) RETURNING id INTO v_pod_id;

 FOR v_img IN SELECT jsonb_array_elements_text(p_image_urls)
 LOOP
 INSERT INTO delivery_images (proof_of_delivery_id, image_url)
 VALUES (v_pod_id, v_img);
 END LOOP;

 UPDATE delivery_legs SET
 status = 'DELIVERED', delivered_at = now(), updated_at = now()
 WHERE id = p_leg_id;

 SELECT COUNT(*) INTO v_pending FROM delivery_legs
 WHERE delivery_order_id = v_leg.order_id AND status != 'DELIVERED';

 IF v_pending = 0 THEN
 UPDATE delivery_orders SET status = 'DELIVERED', updated_at = now()
 WHERE id = v_leg.order_id;
 END IF;

 PERFORM check_low_stock(v_leg.organization_id);

 RETURN jsonb_build_object(
 'leg_id', p_leg_id,
 'pod_id', v_pod_id,
 'status', 'DELIVERED'
 );
END;
$$;

-- ============================================================
-- LOG FLEET STATUS
-- ============================================================

CREATE OR REPLACE FUNCTION log_fleet_status(
 p_vehicle_id UUID,
 p_status TEXT,
 p_driver_id UUID DEFAULT NULL,
 p_location_description TEXT DEFAULT NULL,
 p_gps_latitude NUMERIC DEFAULT NULL,
 p_gps_longitude NUMERIC DEFAULT NULL,
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
 v_log_id UUID;
BEGIN
 v_user_id := auth.uid();
 SELECT organization_id INTO v_org_id FROM vehicles WHERE id = p_vehicle_id;

 INSERT INTO fleet_status_log (
 organization_id, vehicle_id, driver_id, status,
 location_description, gps_latitude, gps_longitude, notes
 ) VALUES (
 v_org_id, p_vehicle_id, p_driver_id, p_status,
 p_location_description, p_gps_latitude, p_gps_longitude, p_notes
 ) RETURNING id INTO v_log_id;

 RETURN jsonb_build_object('log_id', v_log_id);
END;
$$;

-- ============================================================
-- WAREHOUSE AUDIT
-- ============================================================

CREATE OR REPLACE FUNCTION submit_warehouse_audit(
 p_location_id UUID,
 p_items JSONB,
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
 v_loc RECORD;
 v_item JSONB;
 v_stock RECORD;
 v_audit_id UUID;
 v_audit_number TEXT;
 v_system NUMERIC;
 v_auto BOOLEAN;
BEGIN
 v_user_id := auth.uid();
 SELECT * INTO v_loc FROM inventory_locations
 WHERE id = p_location_id AND location_type = 'HQ_WAREHOUSE';

 IF NOT FOUND THEN RAISE EXCEPTION 'HQ warehouse location required'; END IF;
 v_org_id := v_loc.organization_id;
 v_auto := public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER');
 v_audit_number := generate_fleet_number('WA');

 INSERT INTO warehouse_audits (
 organization_id, audit_number, location_id, audit_date,
 status, notes, audited_by, approved_by
 ) VALUES (
 v_org_id, v_audit_number, p_location_id, CURRENT_DATE,
 CASE WHEN v_auto THEN 'APPROVED'::approval_status ELSE 'PENDING'::approval_status END,
 p_notes, v_user_id,
 CASE WHEN v_auto THEN v_user_id ELSE NULL END
 ) RETURNING id INTO v_audit_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items WHERE id = (v_item->>'stock_item_id')::uuid;
 SELECT COALESCE(quantity, 0) INTO v_system
 FROM inventory_balances WHERE location_id = p_location_id AND stock_item_id = v_stock.id;

 INSERT INTO warehouse_audit_items (
 audit_id, stock_item_id, system_quantity, audited_quantity, unit
 ) VALUES (
 v_audit_id, v_stock.id, COALESCE(v_system, 0),
 (v_item->>'audited_quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
 );

 IF v_auto AND (v_item->>'audited_quantity')::numeric != COALESCE(v_system, 0) THEN
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_org_id, 'ADJUSTMENT', p_location_id, v_stock.id,
 (v_item->>'audited_quantity')::numeric - COALESCE(v_system, 0),
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 'warehouse_audit', v_audit_id, p_notes, v_user_id
 );
 END IF;
 END LOOP;

 RETURN jsonb_build_object('audit_id', v_audit_id, 'audit_number', v_audit_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_warehouse_audit(p_audit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_audit RECORD;
 v_item RECORD;
BEGIN
 v_user_id := auth.uid();
 IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 SELECT * INTO v_audit FROM warehouse_audits WHERE id = p_audit_id AND status = 'PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;

 FOR v_item IN SELECT * FROM warehouse_audit_items WHERE audit_id = p_audit_id
 LOOP
 IF v_item.variance != 0 THEN
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, created_by
 ) VALUES (
 v_audit.organization_id, 'ADJUSTMENT', v_audit.location_id, v_item.stock_item_id,
 v_item.variance, v_item.unit, 'warehouse_audit', p_audit_id, v_user_id
 );
 END IF;
 END LOOP;

 UPDATE warehouse_audits SET status = 'APPROVED', approved_by = v_user_id WHERE id = p_audit_id;
 RETURN jsonb_build_object('audit_id', p_audit_id, 'status', 'APPROVED');
END;
$$;

GRANT EXECUTE ON FUNCTION create_delivery_order TO authenticated;
GRANT EXECUTE ON FUNCTION dispatch_delivery_leg TO authenticated;
GRANT EXECUTE ON FUNCTION submit_proof_of_delivery TO authenticated;
GRANT EXECUTE ON FUNCTION log_fleet_status TO authenticated;
GRANT EXECUTE ON FUNCTION submit_warehouse_audit TO authenticated;
GRANT EXECUTE ON FUNCTION approve_warehouse_audit TO authenticated;

-- RLS policies
CREATE POLICY delivery_orders_org ON delivery_orders
 FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY delivery_legs_org ON delivery_legs
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM delivery_orders d
 WHERE d.id = delivery_order_id AND d.organization_id = public.organization_id()
 )
 );

CREATE POLICY pod_org ON proof_of_delivery
 FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY fleet_status_org ON fleet_status_log
 FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY warehouse_audits_org ON warehouse_audits
 FOR ALL USING (organization_id = public.organization_id());

CREATE POLICY production_output_org ON production_output
 FOR ALL USING (organization_id = public.organization_id());

ALTER TABLE proof_of_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_output ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_audit_items_via ON warehouse_audit_items
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM warehouse_audits wa
 WHERE wa.id = audit_id AND wa.organization_id = public.organization_id()
 )
 );

ALTER TABLE warehouse_audit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_leg_items_org ON delivery_leg_items
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM delivery_legs dl
 JOIN delivery_orders d ON d.id = dl.delivery_order_id
 WHERE dl.id = leg_id AND d.organization_id = public.organization_id()
 )
 );

ALTER TABLE delivery_leg_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_images_org ON delivery_images
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM proof_of_delivery pod
 WHERE pod.id = proof_of_delivery_id AND pod.organization_id = public.organization_id()
 )
 );
