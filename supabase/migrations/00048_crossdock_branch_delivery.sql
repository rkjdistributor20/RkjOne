-- Cross-dock Gudang HQ: terima automatik bila kilang sahkan, hantar terus ke cawangan, driver sahkan POD

ALTER TABLE hq_delivery_route_stops
 ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING',
 ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES profiles(id),
 ADD COLUMN IF NOT EXISTS stock_transfer_id UUID REFERENCES stock_transfers(id);

ALTER TABLE hq_delivery_route_stops
 DROP CONSTRAINT IF EXISTS hq_delivery_route_stops_status_check;

ALTER TABLE hq_delivery_route_stops
 ADD CONSTRAINT hq_delivery_route_stops_status_check
 CHECK (status IN ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'SKIPPED'));

ALTER TABLE hq_factory_orders
 ADD COLUMN IF NOT EXISTS auto_received_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS stock_receive_id UUID REFERENCES stock_receives(id);

-- ============================================================
-- Terima stok (dalaman — dipanggil selepas kilang sahkan order)
-- ============================================================

CREATE OR REPLACE FUNCTION _internal_receive_stock(
 p_org_id UUID,
 p_location_id UUID,
 p_items JSONB,
 p_source TEXT,
 p_notes TEXT,
 p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_item JSONB;
 v_stock RECORD;
 v_receive_id UUID;
 v_receive_number TEXT;
BEGIN
 IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
 RAISE EXCEPTION 'Tiada item untuk diterima';
 END IF;

 v_receive_number := generate_inv_number('RCV', p_org_id);

 INSERT INTO stock_receives (
 organization_id, receive_number, location_id, source, notes, received_by
 ) VALUES (
 p_org_id, v_receive_number, p_location_id, p_source, p_notes, p_user_id
 ) RETURNING id INTO v_receive_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = p_org_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 INSERT INTO stock_receive_items (receive_id, stock_item_id, quantity, unit)
 VALUES (
 v_receive_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
 );

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 p_org_id, 'RECEIVE', p_location_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 'stock_receive', v_receive_id, p_notes, p_user_id
 );
 END LOOP;

 RETURN v_receive_id;
END;
$$;

-- ============================================================
-- Cipta & hantar pindahan (cross-dock — stok tidak kekal di HQ)
-- ============================================================

CREATE OR REPLACE FUNCTION _internal_create_dispatch_transfer(
 p_org_id UUID,
 p_from_location_id UUID,
 p_to_location_id UUID,
 p_items JSONB,
 p_driver_id UUID,
 p_vehicle_id UUID,
 p_notes TEXT,
 p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_item JSONB;
 v_stock RECORD;
 v_transfer_id UUID;
 v_transfer_number TEXT;
 v_balance NUMERIC;
BEGIN
 IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
 RAISE EXCEPTION 'Tiada item untuk pindahan';
 END IF;

 v_transfer_number := generate_inv_number('TRF', p_org_id);

 INSERT INTO stock_transfers (
 organization_id, transfer_number, from_location_id, to_location_id,
 status, driver_id, vehicle_id, notes, created_by, dispatched_at
 ) VALUES (
 p_org_id, v_transfer_number, p_from_location_id, p_to_location_id,
 'IN_TRANSIT', p_driver_id, p_vehicle_id, p_notes, p_user_id, now()
 ) RETURNING id INTO v_transfer_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = p_org_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 INSERT INTO stock_transfer_items (transfer_id, stock_item_id, quantity, unit)
 VALUES (
 v_transfer_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
 );

 SELECT COALESCE(quantity, 0) INTO v_balance
 FROM inventory_balances
 WHERE location_id = p_from_location_id AND stock_item_id = v_stock.id;

 IF COALESCE(v_balance, 0) < (v_item->>'quantity')::numeric THEN
 RAISE EXCEPTION 'Stok tidak mencukupi di HQ untuk %', v_stock.item_code;
 END IF;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 p_org_id, 'TRANSFER_OUT', p_from_location_id, v_stock.id,
 -(v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 'stock_transfer', v_transfer_id, p_notes, p_user_id
 );
 END LOOP;

 RETURN v_transfer_id;
END;
$$;

-- ============================================================
-- Auto terima dari kilang + hantar terus ke cawangan (cross-dock)
-- ============================================================

CREATE OR REPLACE FUNCTION auto_fulfill_acknowledged_factory_order(
 p_order_id UUID,
 p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_order RECORD;
 v_hq_location UUID;
 v_receive_items JSONB;
 v_receive_id UUID;
 v_plan RECORD;
 v_stop RECORD;
 v_stop_items JSONB;
 v_transfer_id UUID;
 v_dispatched INT := 0;
BEGIN
 SELECT * INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

 IF v_order.auto_received_at IS NOT NULL THEN
 RETURN jsonb_build_object('order_id', p_order_id, 'already_fulfilled', true);
 END IF;

 IF NOT EXISTS (
 SELECT 1 FROM hq_factory_order_branch_items WHERE order_id = p_order_id
 ) THEN
 RAISE EXCEPTION 'Order mesti ada baris per cawangan';
 END IF;

 IF v_order.routes_planned_at IS NULL THEN
 RAISE EXCEPTION 'HQ belum susun laluan — susun laluan sebelum kilang sahkan';
 END IF;

 SELECT id INTO v_hq_location
 FROM inventory_locations
 WHERE organization_id = v_order.organization_id
 AND location_type = 'HQ_WAREHOUSE'
 AND is_active = true
 ORDER BY name
 LIMIT 1;

 IF v_hq_location IS NULL THEN
 RAISE EXCEPTION 'Lokasi Gudang HQ tidak dijumpai';
 END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'stock_item_id', x.stock_item_id,
 'quantity', x.qty,
 'unit', x.unit
 )), '[]'::jsonb)
 INTO v_receive_items
 FROM (
 SELECT bi.stock_item_id, SUM(bi.quantity) AS qty, MIN(bi.unit::text) AS unit
 FROM hq_factory_order_branch_items bi
 WHERE bi.order_id = p_order_id
 GROUP BY bi.stock_item_id
 ) x;

 v_receive_id := _internal_receive_stock(
 v_order.organization_id,
 v_hq_location,
 v_receive_items,
 'FACTORY',
 'Auto terima order ' || v_order.order_number || ' · cross-dock ke cawangan',
 p_user_id
 );

 FOR v_plan IN
 SELECT p.*
 FROM hq_delivery_route_plans p
 WHERE p.factory_order_id = p_order_id
 AND p.status NOT IN ('CANCELLED', 'COMPLETED')
 LOOP
 FOR v_stop IN
 SELECT s.*
 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = v_plan.id
 AND COALESCE(s.is_handoff, false) = false
 AND s.branch_id IS NOT NULL
 AND s.status = 'PENDING'
 ORDER BY s.stop_sequence
 LOOP
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'stock_item_id', si.stock_item_id,
 'quantity', si.quantity,
 'unit', si.unit::text
 )), '[]'::jsonb)
 INTO v_stop_items
 FROM hq_delivery_route_stop_items si
 WHERE si.stop_id = v_stop.id;

 IF v_stop_items IS NULL OR jsonb_array_length(v_stop_items) = 0 THEN
 CONTINUE;
 END IF;

 v_transfer_id := _internal_create_dispatch_transfer(
 v_order.organization_id,
 v_hq_location,
 v_stop.location_id,
 v_stop_items,
 v_plan.driver_id,
 v_plan.vehicle_id,
 'Pre-order ' || v_order.order_number || ' → hentian ' || v_stop.stop_sequence,
 p_user_id
 );

 UPDATE hq_delivery_route_stops SET
 status = 'IN_TRANSIT',
 stock_transfer_id = v_transfer_id
 WHERE id = v_stop.id;

 v_dispatched := v_dispatched + 1;
 END LOOP;

 IF EXISTS (
 SELECT 1 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = v_plan.id
 AND COALESCE(s.is_handoff, false) = false
 AND s.branch_id IS NOT NULL
 AND s.status = 'IN_TRANSIT'
 ) THEN
 UPDATE hq_delivery_route_plans SET
 status = 'DISPATCHED',
 updated_at = now()
 WHERE id = v_plan.id AND status IN ('PLANNED', 'READY', 'WAITING_HANDOFF');
 END IF;
 END LOOP;

 UPDATE hq_factory_orders SET
 auto_received_at = now(),
 stock_receive_id = v_receive_id,
 updated_at = now()
 WHERE id = p_order_id;

 PERFORM check_low_stock(v_order.organization_id);

 RETURN jsonb_build_object(
 'order_id', p_order_id,
 'receive_id', v_receive_id,
 'stops_dispatched', v_dispatched
 );
END;
$$;

-- ============================================================
-- Driver sahkan penghantaran ke cawangan
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_route_stop_delivery(
 p_stop_id UUID,
 p_receiver_name TEXT DEFAULT NULL,
 p_driver_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_stop RECORD;
 v_order RECORD;
 v_driver_id UUID;
 v_transfer RECORD;
 v_line RECORD;
 v_qty NUMERIC;
 v_pending INT;
 v_all_done BOOLEAN;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT s.*, p.driver_id AS plan_driver_id, p.factory_order_id, p.id AS plan_id
 INTO v_stop
 FROM hq_delivery_route_stops s
 JOIN hq_delivery_route_plans p ON p.id = s.route_plan_id
 WHERE s.id = p_stop_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Hentian tidak dijumpai'; END IF;
 IF COALESCE(v_stop.is_handoff, false) THEN
 RAISE EXCEPTION 'Hentian sambut stok — gunakan fungsi handoff HQ';
 END IF;
 IF v_stop.branch_id IS NULL THEN
 RAISE EXCEPTION 'Bukan hentian cawangan';
 END IF;
 IF v_stop.status = 'DELIVERED' THEN
 RETURN jsonb_build_object('stop_id', p_stop_id, 'status', 'DELIVERED', 'already', true);
 END IF;
 IF v_stop.status != 'IN_TRANSIT' OR v_stop.stock_transfer_id IS NULL THEN
 RAISE EXCEPTION 'Hentian belum dihantar — tunggu kilang sahkan order';
 END IF;

 SELECT id INTO v_driver_id FROM drivers
 WHERE profile_id = v_user_id AND status = 'ACTIVE'
 LIMIT 1;

 IF v_driver_id IS NULL OR v_driver_id != v_stop.plan_driver_id THEN
 IF NOT can_set_roti_production_date() AND public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Hanya driver bertugas boleh sahkan penghantaran';
 END IF;
 END IF;

 SELECT st.* INTO v_transfer FROM stock_transfers st WHERE st.id = v_stop.stock_transfer_id;
 IF NOT FOUND OR v_transfer.status != 'IN_TRANSIT' THEN
 RAISE EXCEPTION 'Pindahan stok tidak dalam perjalanan';
 END IF;

 FOR v_line IN SELECT * FROM stock_transfer_items WHERE transfer_id = v_stop.stock_transfer_id
 LOOP
 v_qty := COALESCE(v_line.received_quantity, v_line.quantity);

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_transfer.organization_id,
 'TRANSFER_IN', v_stop.location_id,
 v_line.stock_item_id, v_qty, v_line.unit,
 'stock_transfer', v_stop.stock_transfer_id,
 COALESCE(p_driver_notes, p_receiver_name), v_user_id
 );

 UPDATE stock_transfer_items SET received_quantity = v_qty WHERE id = v_line.id;
 END LOOP;

 UPDATE stock_transfers SET
 status = 'DELIVERED',
 delivered_at = now(),
 updated_at = now()
 WHERE id = v_stop.stock_transfer_id;

 UPDATE hq_delivery_route_stops SET
 status = 'DELIVERED',
 delivered_at = now(),
 delivered_by = v_user_id
 WHERE id = p_stop_id;

 SELECT COUNT(*) INTO v_pending
 FROM hq_delivery_route_stops s
 WHERE s.route_plan_id = v_stop.plan_id
 AND COALESCE(s.is_handoff, false) = false
 AND s.branch_id IS NOT NULL
 AND s.status != 'DELIVERED';

 IF v_pending = 0 THEN
 UPDATE hq_delivery_route_plans SET status = 'COMPLETED', updated_at = now()
 WHERE id = v_stop.plan_id;
 END IF;

 SELECT * INTO v_order FROM hq_factory_orders WHERE id = v_stop.factory_order_id;

 SELECT NOT EXISTS (
 SELECT 1
 FROM hq_delivery_route_plans p
 JOIN hq_delivery_route_stops s ON s.route_plan_id = p.id
 WHERE p.factory_order_id = v_stop.factory_order_id
 AND p.status NOT IN ('CANCELLED')
 AND COALESCE(s.is_handoff, false) = false
 AND s.branch_id IS NOT NULL
 AND s.status != 'DELIVERED'
 ) INTO v_all_done;

 IF v_all_done AND v_order.status = 'ACKNOWLEDGED' THEN
 UPDATE hq_factory_orders SET status = 'FULFILLED', updated_at = now()
 WHERE id = v_order.id;
 END IF;

 PERFORM check_low_stock(v_order.organization_id);

 RETURN jsonb_build_object(
 'stop_id', p_stop_id,
 'status', 'DELIVERED',
 'receiver_name', p_receiver_name,
 'order_fulfilled', v_all_done
 );
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_route_stop_delivery(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- Kilang sahkan → auto cross-dock
-- ============================================================

CREATE OR REPLACE FUNCTION acknowledge_hq_factory_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_order RECORD;
 v_fulfill JSONB;
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

 IF v_order.routes_planned_at IS NULL THEN
 RAISE EXCEPTION 'HQ belum susun laluan penghantaran — minta HQ susun laluan dahulu';
 END IF;

 UPDATE hq_factory_orders SET
 status = 'ACKNOWLEDGED',
 acknowledged_at = now(),
 acknowledged_by = v_user_id,
 updated_at = now()
 WHERE id = p_order_id;

 v_fulfill := auto_fulfill_acknowledged_factory_order(p_order_id, v_user_id);

 RETURN jsonb_build_object(
 'order_id', p_order_id,
 'status', 'ACKNOWLEDGED',
 'auto_receive', v_fulfill
 );
END;
$$;

-- ============================================================
-- Order HQ wajib per cawangan (tiada stok simpan di gudang)
-- ============================================================

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
 RAISE EXCEPTION 'Order mesti diisi per cawangan — Gudang HQ tidak menyimpan stok, pre-order dihantar terus ke kiosk';
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

-- Jadual kerja driver: hentian boleh disahkan
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
 'order_status', o.status,
 'driver_id', d.id,
 'driver_name', d.full_name,
 'driver_code', d.driver_code,
 'vehicle', COALESCE(v.plate_number, v.vehicle_type),
 'handoff_completed', p.handoff_completed_at IS NOT NULL,
 'depends_on_ready', dep.status IN ('READY', 'DISPATCHED', 'COMPLETED'),
 'stops', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'stop_id', s.id,
 'sequence', s.stop_sequence,
 'branch_code', COALESCE(b.branch_code, 'HANDOFF'),
 'branch_name', COALESCE(b.branch_name, s.notes, 'Sambut Stok'),
 'is_handoff', COALESCE(s.is_handoff, false),
 'status', s.status,
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
