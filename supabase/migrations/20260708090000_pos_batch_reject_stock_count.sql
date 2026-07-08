-- POS batch-aware stock count and reject flow.
-- Staf boleh kira/reject item sama mengikut production date berbeza.

ALTER TABLE stock_count_items
 ADD COLUMN IF NOT EXISTS production_date DATE;

ALTER TABLE stock_write_off_items
 ADD COLUMN IF NOT EXISTS production_date DATE;

CREATE INDEX IF NOT EXISTS idx_stock_count_items_batch
 ON stock_count_items(count_id, stock_item_id, production_date);

CREATE INDEX IF NOT EXISTS idx_stock_write_off_items_batch
 ON stock_write_off_items(write_off_id, stock_item_id, production_date);

CREATE OR REPLACE FUNCTION consume_stock_batches_targeted(
 p_location_id UUID,
 p_stock_item_id UUID,
 p_qty NUMERIC,
 p_production_date DATE DEFAULT NULL,
 p_full_consume_status TEXT DEFAULT 'DEPLETED'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
 v_remaining NUMERIC := GREATEST(p_qty, 0);
 v_status TEXT := CASE
 WHEN p_full_consume_status IN ('DEPLETED', 'REJECTED') THEN p_full_consume_status
 ELSE 'DEPLETED'
 END;
 r RECORD;
 v_take NUMERIC;
BEGIN
 IF v_remaining <= 0 THEN RETURN; END IF;

 IF p_production_date IS NOT NULL THEN
 FOR r IN
 SELECT id, quantity_remaining
 FROM stock_batches
 WHERE location_id = p_location_id
 AND stock_item_id = p_stock_item_id
 AND production_date = p_production_date
 AND status IN ('ACTIVE', 'EXPIRED')
 AND quantity_remaining > 0
 ORDER BY production_date ASC, created_at ASC
 FOR UPDATE
 LOOP
 EXIT WHEN v_remaining <= 0;

 v_take := LEAST(r.quantity_remaining, v_remaining);
 v_remaining := v_remaining - v_take;

 UPDATE stock_batches
 SET quantity_remaining = quantity_remaining - v_take,
 status = CASE WHEN quantity_remaining - v_take <= 0 THEN v_status ELSE status END,
 updated_at = now()
 WHERE id = r.id;
 END LOOP;
 END IF;

 FOR r IN
 SELECT id, quantity_remaining
 FROM stock_batches
 WHERE location_id = p_location_id
 AND stock_item_id = p_stock_item_id
 AND (p_production_date IS NULL OR production_date <> p_production_date)
 AND status IN ('ACTIVE', 'EXPIRED')
 AND quantity_remaining > 0
 ORDER BY production_date ASC, created_at ASC
 FOR UPDATE
 LOOP
 EXIT WHEN v_remaining <= 0;

 v_take := LEAST(r.quantity_remaining, v_remaining);
 v_remaining := v_remaining - v_take;

 UPDATE stock_batches
 SET quantity_remaining = quantity_remaining - v_take,
 status = CASE WHEN quantity_remaining - v_take <= 0 THEN v_status ELSE status END,
 updated_at = now()
 WHERE id = r.id;
 END LOOP;
END;
$$;

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
 RAISE EXCEPTION 'Roti memerlukan tarikh production - ditetapkan oleh pembuat order';
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
 PERFORM consume_stock_batches_targeted(
 NEW.location_id,
 NEW.stock_item_id,
 ABS(NEW.quantity),
 NEW.production_date,
 CASE WHEN NEW.movement_type = 'WRITE_OFF' THEN 'REJECTED' ELSE 'DEPLETED' END
 );
 END IF;

 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION get_expired_roti_stock(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_result JSONB;
BEGIN
 PERFORM mark_expired_roti_batches();

 SELECT COALESCE(jsonb_agg(row ORDER BY row->>'expires_on', row->>'item_name'), '[]'::jsonb)
 INTO v_result
 FROM (
 SELECT jsonb_build_object(
 'batch_id', b.id,
 'stock_item_id', b.stock_item_id,
 'item_code', si.item_code,
 'item_name', si.name,
 'pos_menu', CASE si.item_code
 WHEN 'ST-PLANTA' THEN 'Roti Kaya'
 WHEN 'ST-KELAPA' THEN 'Roti Kelapa'
 WHEN 'ST-KACANG' THEN 'Roti Kacang'
 WHEN 'ST-BENGGALI' THEN 'Roti Benggali'
 ELSE si.name
 END,
 'quantity_remaining', b.quantity_remaining,
 'unit', b.unit,
 'production_date', b.production_date,
 'expires_on', b.expires_on,
 'days_expired', (CURRENT_DATE - b.expires_on)::int,
 'shelf_life_days', roti_shelf_life_days()
 ) AS row
 FROM stock_batches b
 JOIN stock_items si ON si.id = b.stock_item_id
 WHERE b.location_id = p_location_id
 AND b.status IN ('ACTIVE', 'EXPIRED')
 AND b.quantity_remaining > 0
 AND b.expires_on < CURRENT_DATE
 AND si.category = 'Roti'
 ) sub;

 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_roti_expiry_summary(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_expired JSONB;
 v_expiring JSONB;
BEGIN
 PERFORM mark_expired_roti_batches();
 v_expired := get_expired_roti_stock(p_location_id);

 SELECT COALESCE(jsonb_agg(row ORDER BY row->>'expires_on'), '[]'::jsonb)
 INTO v_expiring
 FROM (
 SELECT jsonb_build_object(
 'stock_item_id', b.stock_item_id,
 'item_code', si.item_code,
 'item_name', si.name,
 'pos_menu', CASE si.item_code
 WHEN 'ST-PLANTA' THEN 'Roti Kaya'
 WHEN 'ST-KELAPA' THEN 'Roti Kelapa'
 WHEN 'ST-KACANG' THEN 'Roti Kacang'
 WHEN 'ST-BENGGALI' THEN 'Roti Benggali'
 ELSE si.name
 END,
 'quantity_remaining', b.quantity_remaining,
 'unit', b.unit,
 'production_date', b.production_date,
 'expires_on', b.expires_on,
 'days_until_expiry', (b.expires_on - CURRENT_DATE)::int
 ) AS row
 FROM stock_batches b
 JOIN stock_items si ON si.id = b.stock_item_id
 WHERE b.location_id = p_location_id
 AND b.status = 'ACTIVE'
 AND b.quantity_remaining > 0
 AND b.expires_on >= CURRENT_DATE
 AND b.expires_on <= CURRENT_DATE + 1
 AND si.category = 'Roti'
 ) sub;

 RETURN jsonb_build_object(
 'expired', v_expired,
 'expiring_soon', v_expiring,
 'has_expired', jsonb_array_length(v_expired) > 0,
 'shelf_life_days', roti_shelf_life_days()
 );
END;
$$;

CREATE OR REPLACE FUNCTION submit_stock_count(
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
 v_count_id UUID;
 v_count_number TEXT;
 v_system NUMERIC;
 v_line_system NUMERIC;
 v_auto_approve BOOLEAN;
 v_seen UUID[] := ARRAY[]::UUID[];
 v_agg RECORD;
BEGIN
 v_user_id := auth.uid();
 SELECT * INTO v_loc FROM inventory_locations WHERE id = p_location_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 v_org_id := v_loc.organization_id;

 IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
 RAISE EXCEPTION 'No branch access';
 END IF;

 v_auto_approve := public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER');
 v_count_number := generate_inv_number('CNT', v_org_id);

 INSERT INTO stock_counts (
 organization_id, count_number, location_id, status, notes, counted_by,
 approved_by
 ) VALUES (
 v_org_id, v_count_number, p_location_id,
 CASE WHEN v_auto_approve THEN 'APPROVED'::approval_status ELSE 'PENDING'::approval_status END,
 p_notes, v_user_id,
 CASE WHEN v_auto_approve THEN v_user_id ELSE NULL END
 ) RETURNING id INTO v_count_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items WHERE id = (v_item->>'stock_item_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 SELECT COALESCE(quantity, 0) INTO v_system
 FROM inventory_balances WHERE location_id = p_location_id AND stock_item_id = v_stock.id;

 IF v_stock.id = ANY(v_seen) THEN
 v_line_system := 0;
 ELSE
 v_seen := array_append(v_seen, v_stock.id);
 v_line_system := COALESCE(v_system, 0);
 END IF;

 INSERT INTO stock_count_items (
 count_id, stock_item_id, system_quantity, counted_quantity, unit, production_date, notes
 ) VALUES (
 v_count_id,
 v_stock.id,
 v_line_system,
 (v_item->>'counted_quantity')::numeric,
 COALESCE(NULLIF(v_item->>'unit', '')::stock_unit, v_stock.base_unit),
 NULLIF(v_item->>'production_date', '')::date,
 NULLIF(v_item->>'note', '')
 );
 END LOOP;

 IF v_auto_approve THEN
 FOR v_agg IN
 SELECT
 sci.stock_item_id,
 SUM(sci.counted_quantity) AS counted_quantity,
 SUM(sci.system_quantity) AS system_quantity,
 (array_agg(sci.unit))[1] AS unit
 FROM stock_count_items sci
 WHERE sci.count_id = v_count_id
 GROUP BY sci.stock_item_id
 LOOP
 IF v_agg.counted_quantity != v_agg.system_quantity THEN
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_org_id, 'COUNT', p_location_id, v_agg.stock_item_id,
 v_agg.counted_quantity - v_agg.system_quantity,
 v_agg.unit, 'stock_count', v_count_id, p_notes, v_user_id
 );
 END IF;
 END LOOP;
 END IF;

 IF NOT v_auto_approve THEN
 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, status, requested_by, branch_id
 ) VALUES (
 v_org_id, 'STOCK_TRANSFER', v_count_id,
 'Stock Count ' || v_count_number, 'PENDING', v_user_id, v_loc.branch_id
 );
 END IF;

 RETURN jsonb_build_object('count_id', v_count_id, 'count_number', v_count_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_stock_count(p_count_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_count RECORD;
 v_item RECORD;
BEGIN
 v_user_id := auth.uid();
 SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id AND status = 'PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'Count not found'; END IF;

 FOR v_item IN
 SELECT
 stock_item_id,
 SUM(counted_quantity) AS counted_quantity,
 SUM(system_quantity) AS system_quantity,
 (array_agg(unit))[1] AS unit
 FROM stock_count_items
 WHERE count_id = p_count_id
 GROUP BY stock_item_id
 LOOP
 IF v_item.counted_quantity != v_item.system_quantity THEN
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_count.organization_id, 'COUNT', v_count.location_id, v_item.stock_item_id,
 v_item.counted_quantity - v_item.system_quantity,
 v_item.unit, 'stock_count', p_count_id, v_count.notes, v_user_id
 );
 END IF;
 END LOOP;

 UPDATE stock_counts SET status = 'APPROVED', approved_by = v_user_id WHERE id = p_count_id;
 RETURN jsonb_build_object('count_id', p_count_id, 'status', 'APPROVED');
END;
$$;

CREATE OR REPLACE FUNCTION submit_stock_write_off(
 p_location_id UUID,
 p_reason TEXT,
 p_items JSONB
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
 v_wo_id UUID;
 v_wo_number TEXT;
 v_auto_approve BOOLEAN;
 v_balance NUMERIC;
 v_qty NUMERIC;
 v_unit stock_unit;
 v_prod DATE;
 v_line_note TEXT;
BEGIN
 v_user_id := auth.uid();
 SELECT * INTO v_loc FROM inventory_locations WHERE id = p_location_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 v_org_id := v_loc.organization_id;

 IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
 RAISE EXCEPTION 'No branch access';
 END IF;

 v_auto_approve :=
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
 OR (
 v_loc.location_type = 'BRANCH_KIOSK'
 AND public.user_role() IN ('STAFF', 'AREA_MANAGER')
 );

 v_wo_number := generate_inv_number('WO', v_org_id);

 INSERT INTO stock_write_offs (
 organization_id, write_off_number, location_id, reason, status, created_by, approved_by
 ) VALUES (
 v_org_id, v_wo_number, p_location_id, p_reason,
 CASE WHEN v_auto_approve THEN 'APPROVED'::approval_status ELSE 'PENDING'::approval_status END,
 v_user_id, CASE WHEN v_auto_approve THEN v_user_id ELSE NULL END
 ) RETURNING id INTO v_wo_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items WHERE id = (v_item->>'stock_item_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 v_qty := (v_item->>'quantity')::numeric;
 v_unit := COALESCE(NULLIF(v_item->>'unit', '')::stock_unit, v_stock.base_unit);
 v_prod := NULLIF(v_item->>'production_date', '')::date;
 v_line_note := NULLIF(v_item->>'note', '');

 INSERT INTO stock_write_off_items (write_off_id, stock_item_id, quantity, unit, production_date, notes)
 VALUES (v_wo_id, v_stock.id, v_qty, v_unit, v_prod, v_line_note);

 IF v_auto_approve THEN
 SELECT COALESCE(quantity, 0) INTO v_balance
 FROM inventory_balances WHERE location_id = p_location_id AND stock_item_id = v_stock.id;

 IF v_balance < v_qty THEN
 RAISE EXCEPTION 'Insufficient stock for write-off';
 END IF;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by, production_date
 ) VALUES (
 v_org_id, 'WRITE_OFF', p_location_id, v_stock.id,
 -v_qty, v_unit, 'stock_write_off', v_wo_id,
 concat_ws(' | ', p_reason, v_line_note), v_user_id, v_prod
 );
 END IF;
 END LOOP;

 IF NOT v_auto_approve THEN
 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, status, requested_by, branch_id
 ) VALUES (
 v_org_id, 'STOCK_WRITE_OFF', v_wo_id,
 'Write Off ' || v_wo_number, 'PENDING', v_user_id, v_loc.branch_id
 );
 END IF;

 RETURN jsonb_build_object('write_off_id', v_wo_id, 'write_off_number', v_wo_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_stock_write_off(p_write_off_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_wo RECORD;
 v_item RECORD;
 v_balance NUMERIC;
BEGIN
 v_user_id := auth.uid();
 SELECT * INTO v_wo FROM stock_write_offs WHERE id = p_write_off_id AND status = 'PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'Write-off not found'; END IF;

 FOR v_item IN SELECT * FROM stock_write_off_items WHERE write_off_id = p_write_off_id
 LOOP
 SELECT COALESCE(quantity, 0) INTO v_balance
 FROM inventory_balances
 WHERE location_id = v_wo.location_id AND stock_item_id = v_item.stock_item_id;

 IF v_balance < v_item.quantity THEN
 RAISE EXCEPTION 'Insufficient stock for write-off';
 END IF;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by, production_date
 ) VALUES (
 v_wo.organization_id, 'WRITE_OFF', v_wo.location_id, v_item.stock_item_id,
 -v_item.quantity, v_item.unit, 'stock_write_off', p_write_off_id,
 concat_ws(' | ', v_wo.reason, v_item.notes), v_user_id, v_item.production_date
 );
 END LOOP;

 UPDATE stock_write_offs SET status = 'APPROVED', approved_by = v_user_id WHERE id = p_write_off_id;
 UPDATE approval_requests SET status = 'APPROVED', approved_by = v_user_id, resolved_at = now()
 WHERE entity_type = 'STOCK_WRITE_OFF' AND entity_id = p_write_off_id;

 RETURN jsonb_build_object('write_off_id', p_write_off_id, 'status', 'APPROVED');
END;
$$;

GRANT EXECUTE ON FUNCTION consume_stock_batches_targeted TO authenticated;
GRANT EXECUTE ON FUNCTION submit_stock_count TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_count TO authenticated;
GRANT EXECUTE ON FUNCTION submit_stock_write_off TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_write_off TO authenticated;
