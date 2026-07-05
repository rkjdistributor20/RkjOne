-- POS SOP: driver drop-off, staff stock confirmation, AM/OM approval, branch supply requests
-- Migration 00096

CREATE TABLE IF NOT EXISTS pos_stock_receipts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 location_id UUID NOT NULL REFERENCES inventory_locations(id),
 route_stop_id UUID REFERENCES hq_delivery_route_stops(id),
 stock_transfer_id UUID REFERENCES stock_transfers(id),
 driver_id UUID REFERENCES drivers(id),
 status TEXT NOT NULL DEFAULT 'DRIVER_DROPPED' CHECK (
 status IN (
 'DRIVER_DROPPED',
 'STAFF_CONFIRMED',
 'DISCREPANCY_PENDING_APPROVAL',
 'APPROVED',
 'REJECTED',
 'CANCELLED'
 )
 ),
 receiver_name TEXT,
 driver_notes TEXT,
 staff_notes TEXT,
 manager_notes TEXT,
 delivered_by UUID REFERENCES profiles(id),
 delivered_at TIMESTAMPTZ,
 staff_confirmed_by UUID REFERENCES profiles(id),
 staff_confirmed_at TIMESTAMPTZ,
 manager_approved_by UUID REFERENCES profiles(id),
 manager_approved_at TIMESTAMPTZ,
 metadata JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_receipts_transfer
 ON pos_stock_receipts(stock_transfer_id)
 WHERE stock_transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_stock_receipts_branch_status
 ON pos_stock_receipts(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_stock_receipts_route_stop
 ON pos_stock_receipts(route_stop_id);

CREATE TABLE IF NOT EXISTS pos_stock_receipt_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 receipt_id UUID NOT NULL REFERENCES pos_stock_receipts(id) ON DELETE CASCADE,
 stock_transfer_item_id UUID REFERENCES stock_transfer_items(id),
 stock_item_id UUID NOT NULL REFERENCES stock_items(id),
 expected_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
 actual_quantity NUMERIC(14, 4),
 variance_quantity NUMERIC(14, 4) GENERATED ALWAYS AS (COALESCE(actual_quantity, expected_quantity) - expected_quantity) STORED,
 unit stock_unit NOT NULL,
 production_date DATE,
 staff_note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_receipt_items_receipt
 ON pos_stock_receipt_items(receipt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_receipt_items_unique_line
 ON pos_stock_receipt_items(receipt_id, stock_item_id, COALESCE(production_date, DATE '1900-01-01'));

CREATE TABLE IF NOT EXISTS pos_branch_supply_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 location_id UUID NOT NULL REFERENCES inventory_locations(id),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED')),
 request_type TEXT NOT NULL DEFAULT 'BRANCH_NECESSITY',
 priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'URGENT')),
 needed_by DATE,
 notes TEXT,
 requested_by UUID NOT NULL REFERENCES profiles(id),
 approved_by UUID REFERENCES profiles(id),
 approved_at TIMESTAMPTZ,
 rejected_by UUID REFERENCES profiles(id),
 rejected_at TIMESTAMPTZ,
 rejection_reason TEXT,
 items JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_branch_supply_requests_branch_status
 ON pos_branch_supply_requests(branch_id, status, created_at DESC);

ALTER TABLE pos_stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_stock_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_branch_supply_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_stock_receipts_scope ON pos_stock_receipts;
CREATE POLICY pos_stock_receipts_scope ON pos_stock_receipts
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

DROP POLICY IF EXISTS pos_stock_receipt_items_scope ON pos_stock_receipt_items;
CREATE POLICY pos_stock_receipt_items_scope ON pos_stock_receipt_items
 FOR ALL USING (
 EXISTS (
 SELECT 1
 FROM pos_stock_receipts r
 WHERE r.id = receipt_id
 AND r.organization_id = public.organization_id()
 AND public.has_branch_access(r.branch_id)
 )
 );

DROP POLICY IF EXISTS pos_branch_supply_requests_scope ON pos_branch_supply_requests;
CREATE POLICY pos_branch_supply_requests_scope ON pos_branch_supply_requests
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

CREATE OR REPLACE FUNCTION _pos_apply_receipt_stock(p_receipt_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_receipt RECORD;
 v_item RECORD;
 v_qty NUMERIC;
BEGIN
 SELECT * INTO v_receipt FROM pos_stock_receipts WHERE id = p_receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rekod penerimaan stok tidak dijumpai'; END IF;

 FOR v_item IN
 SELECT * FROM pos_stock_receipt_items WHERE receipt_id = p_receipt_id
 LOOP
 v_qty := COALESCE(v_item.actual_quantity, v_item.expected_quantity);
 IF v_qty < 0 THEN
 RAISE EXCEPTION 'Kuantiti sebenar tidak boleh negatif';
 END IF;

 IF v_qty > 0 THEN
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_receipt.organization_id,
 'TRANSFER_IN',
 v_receipt.location_id,
 v_item.stock_item_id,
 v_qty,
 v_item.unit,
 'pos_stock_receipt',
 p_receipt_id,
 'Pengesahan staf POS: stok diterima daripada driver',
 p_user_id
 );
 END IF;

 IF v_item.stock_transfer_item_id IS NOT NULL THEN
 UPDATE stock_transfer_items
 SET received_quantity = v_qty
 WHERE id = v_item.stock_transfer_item_id;
 END IF;
 END LOOP;

 IF v_receipt.stock_transfer_id IS NOT NULL THEN
 UPDATE stock_transfers
 SET status = 'DELIVERED',
 delivered_at = COALESCE(delivered_at, now()),
 updated_at = now()
 WHERE id = v_receipt.stock_transfer_id;
 END IF;

 PERFORM check_low_stock(v_receipt.organization_id);
END;
$$;

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
 v_receipt_id UUID;
 v_line RECORD;
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
 RAISE EXCEPTION 'Hentian sambut stok - gunakan fungsi handoff HQ';
 END IF;
 IF v_stop.branch_id IS NULL THEN
 RAISE EXCEPTION 'Bukan hentian cawangan';
 END IF;
 IF v_stop.status = 'DELIVERED' THEN
 SELECT id INTO v_receipt_id
 FROM pos_stock_receipts
 WHERE route_stop_id = p_stop_id
 ORDER BY created_at DESC
 LIMIT 1;

 RETURN jsonb_build_object(
 'stop_id', p_stop_id,
 'status', 'DRIVER_DROPPED',
 'receipt_id', v_receipt_id,
 'already', true
 );
 END IF;
 IF v_stop.status != 'IN_TRANSIT' OR v_stop.stock_transfer_id IS NULL THEN
 RAISE EXCEPTION 'Hentian belum dihantar - tunggu kilang sahkan order';
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

 INSERT INTO pos_stock_receipts (
 organization_id, branch_id, location_id, route_stop_id, stock_transfer_id,
 driver_id, status, receiver_name, driver_notes, delivered_by, delivered_at,
 metadata
 ) VALUES (
 v_transfer.organization_id,
 v_stop.branch_id,
 v_stop.location_id,
 p_stop_id,
 v_stop.stock_transfer_id,
 v_stop.plan_driver_id,
 'DRIVER_DROPPED',
 p_receiver_name,
 p_driver_notes,
 v_user_id,
 now(),
 jsonb_build_object('source', 'driver_route_stop', 'requires_staff_confirmation', true)
 )
 ON CONFLICT (stock_transfer_id)
 WHERE stock_transfer_id IS NOT NULL
 DO UPDATE SET
 receiver_name = EXCLUDED.receiver_name,
 driver_notes = EXCLUDED.driver_notes,
 delivered_by = EXCLUDED.delivered_by,
 delivered_at = COALESCE(pos_stock_receipts.delivered_at, EXCLUDED.delivered_at),
 updated_at = now()
 RETURNING id INTO v_receipt_id;

 FOR v_line IN
 SELECT sti.*, si.base_unit
 FROM stock_transfer_items sti
 JOIN stock_items si ON si.id = sti.stock_item_id
 WHERE sti.transfer_id = v_stop.stock_transfer_id
 LOOP
 INSERT INTO pos_stock_receipt_items (
 receipt_id, stock_transfer_item_id, stock_item_id,
 expected_quantity, actual_quantity, unit, production_date
 ) VALUES (
 v_receipt_id,
 v_line.id,
 v_line.stock_item_id,
 v_line.quantity,
 NULL,
 v_line.unit,
 v_line.production_date
 )
 ON CONFLICT (receipt_id, stock_item_id, COALESCE(production_date, DATE '1900-01-01'))
 DO UPDATE SET
 expected_quantity = EXCLUDED.expected_quantity,
 unit = EXCLUDED.unit,
 stock_transfer_item_id = EXCLUDED.stock_transfer_item_id;
 END LOOP;

 UPDATE hq_delivery_route_stops SET
 status = 'DELIVERED',
 delivered_at = now(),
 delivered_by = v_user_id,
 notes = trim(concat_ws(E'\n', NULLIF(notes, ''), 'Driver drop-off; tunggu pengesahan stok oleh staf POS.'))
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

 RETURN jsonb_build_object(
 'stop_id', p_stop_id,
 'receipt_id', v_receipt_id,
 'status', 'DRIVER_DROPPED',
 'message', 'Driver sudah drop stok. Staf POS perlu sahkan sebelum jualan.'
 );
END;
$$;

CREATE OR REPLACE FUNCTION pos_staff_confirm_stock_delivery(
 p_receipt_id UUID,
 p_items JSONB,
 p_staff_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_receipt RECORD;
 v_payload JSONB;
 v_receipt_item_id UUID;
 v_stock_item_id UUID;
 v_actual NUMERIC;
 v_staff_note TEXT;
 v_has_mismatch BOOLEAN;
 v_title TEXT;
 v_description TEXT;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_receipt FROM pos_stock_receipts WHERE id = p_receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rekod penerimaan stok tidak dijumpai'; END IF;
 IF NOT public.has_branch_access(v_receipt.branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;
 IF v_receipt.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
 RAISE EXCEPTION 'Penerimaan stok ini sudah diproses';
 END IF;
 IF v_receipt.status NOT IN ('DRIVER_DROPPED', 'DISCREPANCY_PENDING_APPROVAL') THEN
 RAISE EXCEPTION 'Status penerimaan stok tidak sah untuk pengesahan staf';
 END IF;

 FOR v_payload IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
 LOOP
 v_receipt_item_id := NULLIF(v_payload->>'receipt_item_id', '')::uuid;
 v_stock_item_id := NULLIF(v_payload->>'stock_item_id', '')::uuid;
 v_actual := COALESCE((v_payload->>'actual_quantity')::numeric, 0);
 v_staff_note := NULLIF(v_payload->>'note', '');

 IF v_actual < 0 THEN RAISE EXCEPTION 'Kuantiti sebenar tidak boleh negatif'; END IF;

 UPDATE pos_stock_receipt_items
 SET actual_quantity = v_actual,
 staff_note = v_staff_note
 WHERE receipt_id = p_receipt_id
 AND (
 (v_receipt_item_id IS NOT NULL AND id = v_receipt_item_id)
 OR (v_receipt_item_id IS NULL AND v_stock_item_id IS NOT NULL AND stock_item_id = v_stock_item_id)
 );
 END LOOP;

 UPDATE pos_stock_receipt_items
 SET actual_quantity = expected_quantity
 WHERE receipt_id = p_receipt_id
 AND actual_quantity IS NULL;

 SELECT EXISTS (
 SELECT 1 FROM pos_stock_receipt_items
 WHERE receipt_id = p_receipt_id
 AND COALESCE(actual_quantity, expected_quantity) <> expected_quantity
 ) INTO v_has_mismatch;

 IF v_has_mismatch THEN
 UPDATE pos_stock_receipts
 SET status = 'DISCREPANCY_PENDING_APPROVAL',
 staff_confirmed_by = v_user_id,
 staff_confirmed_at = now(),
 staff_notes = p_staff_notes,
 updated_at = now(),
 metadata = metadata || jsonb_build_object('stock_enters_pos_after_manager_approval', true)
 WHERE id = p_receipt_id;

 v_title := 'Kelulusan beza stok delivery POS';
 v_description := 'Staf melaporkan jumlah sebenar tidak sama dengan jumlah driver. Stok hanya masuk POS selepas AM/OM lulus.';
 ELSE
 PERFORM _pos_apply_receipt_stock(p_receipt_id, v_user_id);

 UPDATE pos_stock_receipts
 SET status = 'STAFF_CONFIRMED',
 staff_confirmed_by = v_user_id,
 staff_confirmed_at = now(),
 staff_notes = p_staff_notes,
 updated_at = now(),
 metadata = metadata || jsonb_build_object('stock_entered_pos_at_staff_confirmation', true)
 WHERE id = p_receipt_id;

 v_title := 'Sahkan penerima stok cawangan';
 v_description := 'Staf sudah sahkan jumlah stok sama seperti driver. Stok telah masuk POS; AM/OM perlu sahkan penerima sebagai audit operasi.';
 END IF;

 IF NOT EXISTS (
 SELECT 1 FROM approval_requests
 WHERE entity_type = 'STOCK_TRANSFER'
 AND entity_id = p_receipt_id
 AND status = 'PENDING'
 ) THEN
 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, description,
 status, requested_by, branch_id, metadata
 ) VALUES (
 v_receipt.organization_id,
 'STOCK_TRANSFER',
 p_receipt_id,
 v_title,
 v_description,
 'PENDING',
 v_user_id,
 v_receipt.branch_id,
 jsonb_build_object(
 'workflow', 'POS_STAFF_STOCK_RECEIPT',
 'has_mismatch', v_has_mismatch,
 'stock_transfer_id', v_receipt.stock_transfer_id,
 'route_stop_id', v_receipt.route_stop_id
 )
 );
 END IF;

 RETURN jsonb_build_object(
 'receipt_id', p_receipt_id,
 'status', CASE WHEN v_has_mismatch THEN 'DISCREPANCY_PENDING_APPROVAL' ELSE 'STAFF_CONFIRMED' END,
 'has_mismatch', v_has_mismatch
 );
END;
$$;

CREATE OR REPLACE FUNCTION approve_pos_stock_receipt(p_receipt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_receipt RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT (
 public.is_admin()
 OR public.user_role() IN ('OPERATION_MANAGER', 'AREA_MANAGER', 'CEO_FACTORY')
 ) THEN
 RAISE EXCEPTION 'Hanya AM/OM/HQ boleh sahkan penerimaan stok';
 END IF;

 SELECT * INTO v_receipt FROM pos_stock_receipts WHERE id = p_receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rekod penerimaan stok tidak dijumpai'; END IF;
 IF NOT public.has_branch_access(v_receipt.branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;

 IF v_receipt.status = 'DISCREPANCY_PENDING_APPROVAL' THEN
 PERFORM _pos_apply_receipt_stock(p_receipt_id, v_user_id);
 ELSIF v_receipt.status NOT IN ('STAFF_CONFIRMED', 'APPROVED') THEN
 RAISE EXCEPTION 'Penerimaan stok belum disahkan oleh staf';
 END IF;

 UPDATE pos_stock_receipts
 SET status = 'APPROVED',
 manager_approved_by = v_user_id,
 manager_approved_at = now(),
 updated_at = now()
 WHERE id = p_receipt_id;

 RETURN jsonb_build_object('receipt_id', p_receipt_id, 'status', 'APPROVED');
END;
$$;

CREATE OR REPLACE FUNCTION reject_pos_stock_receipt(p_receipt_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_receipt RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT (
 public.is_admin()
 OR public.user_role() IN ('OPERATION_MANAGER', 'AREA_MANAGER', 'CEO_FACTORY')
 ) THEN
 RAISE EXCEPTION 'Hanya AM/OM/HQ boleh tolak penerimaan stok';
 END IF;

 SELECT * INTO v_receipt FROM pos_stock_receipts WHERE id = p_receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rekod penerimaan stok tidak dijumpai'; END IF;
 IF NOT public.has_branch_access(v_receipt.branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;
 IF v_receipt.status = 'APPROVED' THEN
 RAISE EXCEPTION 'Penerimaan sudah diluluskan';
 END IF;

 UPDATE pos_stock_receipts
 SET status = 'REJECTED',
 manager_notes = p_reason,
 manager_approved_by = v_user_id,
 manager_approved_at = now(),
 updated_at = now()
 WHERE id = p_receipt_id;

 RETURN jsonb_build_object('receipt_id', p_receipt_id, 'status', 'REJECTED');
END;
$$;

CREATE OR REPLACE FUNCTION create_pos_branch_supply_request(
 p_branch_id UUID,
 p_items JSONB,
 p_notes TEXT DEFAULT NULL,
 p_priority TEXT DEFAULT 'NORMAL',
 p_needed_by DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_loc RECORD;
 v_req_id UUID;
 v_branch RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.has_branch_access(p_branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;

 SELECT il.*, b.branch_code, b.branch_name
 INTO v_loc
 FROM inventory_locations il
 JOIN branches b ON b.id = il.branch_id
 WHERE il.branch_id = p_branch_id
 AND il.location_type = 'BRANCH_KIOSK'
 AND il.is_active = true
 LIMIT 1;

 IF NOT FOUND THEN RAISE EXCEPTION 'Lokasi POS cawangan tidak dijumpai'; END IF;
 IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
 RAISE EXCEPTION 'Masukkan sekurang-kurangnya satu item';
 END IF;

 INSERT INTO pos_branch_supply_requests (
 organization_id, branch_id, location_id, status, priority, needed_by,
 notes, requested_by, items
 ) VALUES (
 v_loc.organization_id,
 p_branch_id,
 v_loc.id,
 'PENDING',
 CASE WHEN upper(COALESCE(p_priority, 'NORMAL')) IN ('LOW', 'NORMAL', 'URGENT') THEN upper(COALESCE(p_priority, 'NORMAL')) ELSE 'NORMAL' END,
 p_needed_by,
 p_notes,
 v_user_id,
 p_items
 ) RETURNING id INTO v_req_id;

 SELECT * INTO v_branch FROM branches WHERE id = p_branch_id;

 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, description,
 status, requested_by, branch_id, region_id, metadata
 ) VALUES (
 v_loc.organization_id,
 'STOCK_TRANSFER',
 v_req_id,
 'Request barang cawangan',
 COALESCE(v_branch.branch_code || ' - ' || v_branch.branch_name, 'Cawangan') || ': ' || COALESCE(p_notes, 'Permintaan barang POS'),
 'PENDING',
 v_user_id,
 p_branch_id,
 v_branch.region_id,
 jsonb_build_object('workflow', 'POS_BRANCH_SUPPLY_REQUEST', 'priority', COALESCE(p_priority, 'NORMAL'))
 );

 RETURN jsonb_build_object('request_id', v_req_id, 'status', 'PENDING');
END;
$$;

CREATE OR REPLACE FUNCTION approve_pos_branch_supply_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_req RECORD;
BEGIN
 v_user_id := auth.uid();
 IF NOT (
 public.is_admin()
 OR public.user_role() IN ('OPERATION_MANAGER', 'AREA_MANAGER', 'CEO_FACTORY')
 ) THEN
 RAISE EXCEPTION 'Hanya AM/OM/HQ boleh luluskan request cawangan';
 END IF;

 SELECT * INTO v_req FROM pos_branch_supply_requests WHERE id = p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request tidak dijumpai'; END IF;
 IF NOT public.has_branch_access(v_req.branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;

 UPDATE pos_branch_supply_requests
 SET status = 'APPROVED',
 approved_by = v_user_id,
 approved_at = now(),
 updated_at = now()
 WHERE id = p_request_id;

 RETURN jsonb_build_object('request_id', p_request_id, 'status', 'APPROVED');
END;
$$;

CREATE OR REPLACE FUNCTION reject_pos_branch_supply_request(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_req RECORD;
BEGIN
 v_user_id := auth.uid();
 IF NOT (
 public.is_admin()
 OR public.user_role() IN ('OPERATION_MANAGER', 'AREA_MANAGER', 'CEO_FACTORY')
 ) THEN
 RAISE EXCEPTION 'Hanya AM/OM/HQ boleh tolak request cawangan';
 END IF;

 SELECT * INTO v_req FROM pos_branch_supply_requests WHERE id = p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request tidak dijumpai'; END IF;
 IF NOT public.has_branch_access(v_req.branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;

 UPDATE pos_branch_supply_requests
 SET status = 'REJECTED',
 rejected_by = v_user_id,
 rejected_at = now(),
 rejection_reason = p_reason,
 updated_at = now()
 WHERE id = p_request_id;

 RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
END;
$$;

CREATE OR REPLACE FUNCTION resolve_approval_request(
 p_request_id UUID,
 p_action TEXT,
 p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_req RECORD;
 v_result JSONB;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_req FROM approval_requests
 WHERE id = p_request_id AND organization_id = public.organization_id() AND status = 'PENDING';

 IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found'; END IF;

 IF NOT (
 public.is_admin()
 OR public.user_role() IN ('HR', 'FINANCE', 'OPERATION_MANAGER', 'CEO_FACTORY', 'AREA_MANAGER')
 OR (v_req.branch_id IS NOT NULL AND public.has_branch_access(v_req.branch_id))
 ) THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 IF upper(p_action) = 'APPROVE' THEN
 CASE v_req.entity_type
 WHEN 'SHIFT' THEN
 v_result := approve_staff_shift(v_req.entity_id);
 WHEN 'PAYROLL' THEN
 v_result := approve_payroll_run(v_req.entity_id);
 WHEN 'STOCK_ADJUSTMENT' THEN
 v_result := approve_stock_adjustment(v_req.entity_id);
 WHEN 'STOCK_WRITE_OFF' THEN
 v_result := approve_stock_write_off(v_req.entity_id);
 WHEN 'CASH_RECONCILIATION' THEN
 v_result := approve_cash_reconciliation(v_req.entity_id);
 WHEN 'STOCK_TRANSFER' THEN
 IF EXISTS (SELECT 1 FROM pos_stock_receipts WHERE id = v_req.entity_id) THEN
 v_result := approve_pos_stock_receipt(v_req.entity_id);
 ELSIF EXISTS (SELECT 1 FROM pos_branch_supply_requests WHERE id = v_req.entity_id) THEN
 v_result := approve_pos_branch_supply_request(v_req.entity_id);
 ELSE
 UPDATE approval_requests SET
 status = 'APPROVED',
 approved_by = v_user_id,
 resolved_at = now()
 WHERE id = p_request_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'APPROVED');
 END IF;
 ELSE
 UPDATE approval_requests SET
 status = 'APPROVED',
 approved_by = v_user_id,
 resolved_at = now()
 WHERE id = p_request_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'APPROVED');
 END CASE;

 UPDATE approval_requests SET
 status = 'APPROVED',
 approved_by = v_user_id,
 resolved_at = now()
 WHERE id = p_request_id;
 ELSIF upper(p_action) = 'REJECT' THEN
 CASE v_req.entity_type
 WHEN 'STOCK_TRANSFER' THEN
 IF EXISTS (SELECT 1 FROM pos_stock_receipts WHERE id = v_req.entity_id) THEN
 v_result := reject_pos_stock_receipt(v_req.entity_id, p_reason);
 ELSIF EXISTS (SELECT 1 FROM pos_branch_supply_requests WHERE id = v_req.entity_id) THEN
 v_result := reject_pos_branch_supply_request(v_req.entity_id, p_reason);
 ELSE
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 END IF;
 WHEN 'SHIFT' THEN
 UPDATE staff_shifts SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'PAYROLL' THEN
 UPDATE payroll_runs SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'STOCK_ADJUSTMENT' THEN
 UPDATE stock_adjustments SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'STOCK_WRITE_OFF' THEN
 UPDATE stock_write_offs SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'CASH_RECONCILIATION' THEN
 UPDATE cash_reconciliations SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 ELSE
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 END CASE;

 UPDATE approval_requests SET
 status = 'REJECTED',
 rejected_by = v_user_id,
 rejection_reason = p_reason,
 resolved_at = now()
 WHERE id = p_request_id;
 ELSE
 RAISE EXCEPTION 'Invalid action - use APPROVE or REJECT';
 END IF;

 RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_route_stop_delivery(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_staff_confirm_stock_delivery(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_pos_stock_receipt(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_pos_stock_receipt(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_pos_branch_supply_request(UUID, JSONB, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_pos_branch_supply_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_pos_branch_supply_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_approval_request(UUID, TEXT, TEXT) TO authenticated;
