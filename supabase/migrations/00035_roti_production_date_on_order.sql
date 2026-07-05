-- Roti: tarikh production ditetapkan pembuat order (HQ), bukan tarikh terima kiosk
-- Migration 00035

ALTER TABLE stock_transfer_items
 ADD COLUMN IF NOT EXISTS production_date DATE;

CREATE OR REPLACE FUNCTION can_set_roti_production_date()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
 SELECT public.user_role() IN (
 'SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER'
 );
$$;

GRANT EXECUTE ON FUNCTION can_set_roti_production_date TO authenticated;

CREATE OR REPLACE FUNCTION sync_stock_batch_on_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
 v_prod DATE;
BEGIN
 IF NOT is_roti_stock_item(NEW.stock_item_id) THEN
 RETURN NEW;
 END IF;

 IF NEW.quantity > 0 AND NEW.movement_type IN ('RECEIVE', 'TRANSFER_IN') THEN
 IF NEW.production_date IS NULL THEN
 RAISE EXCEPTION 'Roti memerlukan tarikh production — ditetapkan oleh pembuat order';
 END IF;
 v_prod := NEW.production_date;

 INSERT INTO stock_batches (
 organization_id, location_id, stock_item_id,
 quantity_remaining, unit, production_date, expires_on,
 inbound_movement_id, status
 ) VALUES (
 NEW.organization_id, NEW.location_id, NEW.stock_item_id,
 NEW.quantity, NEW.unit, v_prod,
 v_prod + roti_shelf_life_days(),
 NEW.id, 'ACTIVE'
 );
 ELSIF NEW.quantity < 0 THEN
 PERFORM consume_stock_batches_fifo(
 NEW.location_id,
 NEW.stock_item_id,
 ABS(NEW.quantity)
 );
 END IF;

 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION create_stock_transfer(
 p_from_location_id UUID,
 p_to_location_id UUID,
 p_items JSONB,
 p_driver_id UUID DEFAULT NULL,
 p_vehicle_id UUID DEFAULT NULL,
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
 v_from RECORD;
 v_to RECORD;
 v_item JSONB;
 v_stock RECORD;
 v_transfer_id UUID;
 v_transfer_number TEXT;
 v_prod DATE;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_from FROM inventory_locations WHERE id = p_from_location_id;
 SELECT * INTO v_to FROM inventory_locations WHERE id = p_to_location_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 IF v_from.organization_id != v_to.organization_id THEN
 RAISE EXCEPTION 'Cross-org transfer not allowed';
 END IF;

 v_org_id := v_from.organization_id;

 IF v_from.branch_id IS NOT NULL AND NOT public.has_branch_access(v_from.branch_id) THEN
 RAISE EXCEPTION 'No access to source location';
 END IF;

 v_transfer_number := generate_inv_number('TRF', v_org_id);

 INSERT INTO stock_transfers (
 organization_id, transfer_number, from_location_id, to_location_id,
 status, driver_id, vehicle_id, notes, created_by
 ) VALUES (
 v_org_id, v_transfer_number, p_from_location_id, p_to_location_id,
 'PENDING', p_driver_id, p_vehicle_id, p_notes, v_user_id
 ) RETURNING id INTO v_transfer_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 v_prod := NULLIF(v_item->>'production_date', '')::date;

 IF is_roti_stock_item(v_stock.id) THEN
 IF v_prod IS NULL THEN
 RAISE EXCEPTION 'Tarikh production wajib untuk roti: %', v_stock.name;
 END IF;
 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production roti';
 END IF;
 ELSIF v_prod IS NOT NULL AND NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production';
 END IF;

 INSERT INTO stock_transfer_items (
 transfer_id, stock_item_id, quantity, unit, production_date
 ) VALUES (
 v_transfer_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 v_prod
 );
 END LOOP;

 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, description,
 status, requested_by, branch_id
 ) VALUES (
 v_org_id, 'STOCK_TRANSFER', v_transfer_id,
 'Stock Transfer ' || v_transfer_number,
 v_from.name || ' → ' || v_to.name,
 'PENDING', v_user_id, v_from.branch_id
 );

 RETURN jsonb_build_object(
 'transfer_id', v_transfer_id,
 'transfer_number', v_transfer_number
 );
END;
$$;

CREATE OR REPLACE FUNCTION complete_stock_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_transfer RECORD;
 v_item RECORD;
 v_qty NUMERIC;
 v_prod DATE;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT st.*, tl.branch_id AS to_branch
 INTO v_transfer FROM stock_transfers st
 JOIN inventory_locations tl ON tl.id = st.to_location_id
 WHERE st.id = p_transfer_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
 IF v_transfer.status != 'IN_TRANSIT' THEN
 RAISE EXCEPTION 'Transfer is not in transit';
 END IF;

 IF v_transfer.to_branch IS NOT NULL AND NOT public.has_branch_access(v_transfer.to_branch) THEN
 RAISE EXCEPTION 'No branch access to destination';
 END IF;

 FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
 LOOP
 v_qty := COALESCE(v_item.received_quantity, v_item.quantity);
 v_prod := v_item.production_date;

 IF is_roti_stock_item(v_item.stock_item_id) AND v_prod IS NULL THEN
 RAISE EXCEPTION 'Order roti tiada tarikh production — hubungi pembuat order (HQ)';
 END IF;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, created_by, production_date
 ) VALUES (
 v_transfer.organization_id, 'TRANSFER_IN', v_transfer.to_location_id,
 v_item.stock_item_id, v_qty, v_item.unit,
 'stock_transfer', p_transfer_id, v_user_id,
 CASE WHEN is_roti_stock_item(v_item.stock_item_id) THEN v_prod ELSE NULL END
 );

 UPDATE stock_transfer_items SET received_quantity = v_qty WHERE id = v_item.id;
 END LOOP;

 UPDATE stock_transfers SET
 status = 'DELIVERED',
 delivered_at = now(),
 updated_at = now()
 WHERE id = p_transfer_id;

 PERFORM check_low_stock(v_transfer.organization_id);

 RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'DELIVERED');
END;
$$;

CREATE OR REPLACE FUNCTION receive_stock(
 p_location_id UUID,
 p_items JSONB,
 p_source TEXT DEFAULT 'FACTORY',
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
 v_receive_id UUID;
 v_receive_number TEXT;
 v_prod DATE;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT il.*, b.id AS branch_ref
 INTO v_loc FROM inventory_locations il
 LEFT JOIN branches b ON b.id = il.branch_id
 WHERE il.id = p_location_id AND il.is_active = true;

 IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 v_org_id := v_loc.organization_id;

 IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
 RAISE EXCEPTION 'No branch access';
 END IF;

 IF v_loc.branch_id IS NULL AND public.user_role() NOT IN (
 'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY'
 ) THEN
 RAISE EXCEPTION 'Insufficient permissions for this location';
 END IF;

 v_receive_number := generate_inv_number('RCV', v_org_id);

 INSERT INTO stock_receives (
 organization_id, receive_number, location_id, source, notes, received_by
 ) VALUES (
 v_org_id, v_receive_number, p_location_id, p_source, p_notes, v_user_id
 ) RETURNING id INTO v_receive_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 v_prod := NULLIF(v_item->>'production_date', '')::date;

 IF is_roti_stock_item(v_stock.id) THEN
 IF v_prod IS NULL THEN
 RAISE EXCEPTION 'Tarikh production wajib untuk roti: %', v_stock.name;
 END IF;
 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production roti';
 END IF;
 ELSIF v_prod IS NOT NULL AND NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production';
 END IF;

 INSERT INTO stock_receive_items (receive_id, stock_item_id, quantity, unit)
 VALUES (
 v_receive_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
 );

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by, production_date
 ) VALUES (
 v_org_id, 'RECEIVE', p_location_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 'stock_receive', v_receive_id, p_notes, v_user_id,
 CASE WHEN is_roti_stock_item(v_stock.id) THEN v_prod ELSE NULL END
 );
 END LOOP;

 PERFORM check_low_stock(v_org_id);

 RETURN jsonb_build_object(
 'receive_id', v_receive_id,
 'receive_number', v_receive_number
 );
END;
$$;
