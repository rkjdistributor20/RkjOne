-- Inventory transfers only; fleet/POS-linked deliveries keep their own receipt flow.
ALTER TABLE public.stock_transfers
 ADD COLUMN request_id uuid,
 ADD COLUMN request_fingerprint bytea,
 ADD COLUMN cancelled_at timestamptz,
 ADD COLUMN cancelled_by uuid REFERENCES public.profiles(id),
 ADD COLUMN cancellation_reason text;

CREATE UNIQUE INDEX stock_transfers_request_idx
 ON public.stock_transfers (organization_id, created_by, request_id)
 WHERE request_id IS NOT NULL;
CREATE INDEX stock_transfer_route_stop_idx ON public.hq_delivery_route_stops(stock_transfer_id)
 WHERE stock_transfer_id IS NOT NULL;
CREATE INDEX stock_transfer_delivery_leg_idx ON public.delivery_legs(stock_transfer_id)
 WHERE stock_transfer_id IS NOT NULL;

CREATE FUNCTION private_rkj.stock_transfer_location_readable(p_location public.inventory_locations)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
 SELECT CASE
  WHEN public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR', 'FINANCE')
   THEN p_location.branch_id IS NULL OR public.has_branch_access(p_location.branch_id)
  ELSE p_location.location_type = 'BRANCH_KIOSK' AND public.has_branch_access(p_location.branch_id)
 END
$$;

CREATE FUNCTION private_rkj.stock_transfer_location_manageable(p_location public.inventory_locations)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
 SELECT CASE
  WHEN public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY')
   THEN p_location.branch_id IS NULL OR public.has_branch_access(p_location.branch_id)
  WHEN public.user_role() IN ('AREA_MANAGER', 'OPERATION_MANAGER')
   THEN p_location.location_type = 'BRANCH_KIOSK' AND public.has_branch_access(p_location.branch_id)
  ELSE false
 END
$$;

CREATE FUNCTION private_rkj.stock_transfer_is_delivery_managed(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
 SELECT EXISTS (SELECT 1 FROM public.hq_delivery_route_stops s WHERE s.stock_transfer_id = p_id)
     OR EXISTS (SELECT 1 FROM public.delivery_legs d WHERE d.stock_transfer_id = p_id)
     OR EXISTS (SELECT 1 FROM public.pos_stock_receipts r WHERE r.stock_transfer_id = p_id)
$$;

CREATE FUNCTION public.can_read_stock_transfer(p_org uuid, p_from uuid, p_to uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
 SELECT p_org = public.organization_id() AND EXISTS (
  SELECT 1 FROM public.inventory_locations f
  JOIN public.inventory_locations t ON t.id = p_to AND t.organization_id = p_org
  WHERE f.id = p_from AND f.organization_id = p_org
   AND (private_rkj.stock_transfer_location_readable(f) OR private_rkj.stock_transfer_location_readable(t))
 )
$$;

DROP POLICY stock_transfers_org ON public.stock_transfers;
CREATE POLICY stock_transfers_scoped_read ON public.stock_transfers
 FOR SELECT TO authenticated
 USING (public.can_read_stock_transfer(organization_id, from_location_id, to_location_id));

DROP POLICY stock_transfer_items_via ON public.stock_transfer_items;
CREATE POLICY stock_transfer_items_scoped_read ON public.stock_transfer_items
 FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.stock_transfers t WHERE t.id = transfer_id));

REVOKE INSERT, UPDATE, DELETE ON public.stock_transfers, public.stock_transfer_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stock_transfers, public.stock_transfer_items TO authenticated;

CREATE FUNCTION public.list_stock_transfers(p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
 v_org uuid := public.organization_id();
BEGIN
 IF v_org IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 IF p_location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.inventory_locations l WHERE l.id = p_location_id AND l.organization_id = v_org
   AND private_rkj.stock_transfer_location_readable(l)
 ) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Lokasi di luar skop pindahan anda';
 END IF;

 RETURN (
  SELECT COALESCE(jsonb_agg(r.document ORDER BY r.created_at DESC, r.id DESC), '[]'::jsonb)
  FROM (
   SELECT s.id, s.created_at, jsonb_build_object(
    'id', s.id, 'transfer_number', s.transfer_number, 'status', s.status,
    'created_at', s.created_at, 'dispatched_at', s.dispatched_at, 'delivered_at', s.delivered_at,
    'cancelled_at', s.cancelled_at, 'cancellation_reason', s.cancellation_reason,
    'from_location', jsonb_build_object('id', f.id, 'name', f.name, 'location_type', f.location_type),
    'to_location', jsonb_build_object('id', t.id, 'name', t.name, 'location_type', t.location_type),
    'managed_delivery', d.managed,
    'can_dispatch', NOT d.managed AND s.status IN ('DRAFT', 'PENDING')
      AND s.dispatched_at IS NULL AND f.is_active AND t.is_active AND private_rkj.stock_transfer_location_manageable(f),
    'can_complete', NOT d.managed AND s.status = 'IN_TRANSIT'
      AND s.dispatched_at IS NOT NULL AND t.is_active AND private_rkj.stock_transfer_location_manageable(t),
    'can_cancel', NOT d.managed AND s.status IN ('DRAFT', 'PENDING')
      AND s.dispatched_at IS NULL AND private_rkj.stock_transfer_location_manageable(f),
    'stock_transfer_items', (
     SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'quantity', i.quantity, 'unit', i.unit, 'production_date', i.production_date,
      'stock_item', jsonb_build_object('item_code', si.item_code, 'name', si.name, 'category', si.category)
     ) ORDER BY i.id), '[]'::jsonb)
     FROM public.stock_transfer_items i
     JOIN public.stock_items si ON si.id = i.stock_item_id AND si.organization_id = v_org
     WHERE i.transfer_id = s.id
    )
   ) AS document
   FROM public.stock_transfers s
   JOIN public.inventory_locations f ON f.id = s.from_location_id AND f.organization_id = v_org
   JOIN public.inventory_locations t ON t.id = s.to_location_id AND t.organization_id = v_org
   CROSS JOIN LATERAL (SELECT private_rkj.stock_transfer_is_delivery_managed(s.id) AS managed) d
   WHERE s.organization_id = v_org
    AND (p_location_id IS NULL OR p_location_id IN (f.id, t.id))
    AND (private_rkj.stock_transfer_location_readable(f) OR private_rkj.stock_transfer_location_readable(t))
   ORDER BY s.created_at DESC, s.id DESC
   LIMIT 50
  ) r
 );
END;
$$;

CREATE FUNCTION public.stock_transfer_kiosk_options()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
 WITH options AS MATERIALIZED (
  SELECT l.name, l.id, private_rkj.stock_transfer_location_manageable(l) AS source_allowed,
   jsonb_build_object('id', l.id, 'name', l.name, 'location_type', l.location_type,
    'branch_id', b.id, 'branch', jsonb_build_object('branch_code', b.branch_code, 'branch_name', b.branch_name)
   ) AS option
  FROM public.inventory_locations l
  JOIN public.branches b ON b.id = l.branch_id AND b.organization_id = l.organization_id
  WHERE l.organization_id = public.organization_id() AND l.is_active AND l.location_type = 'BRANCH_KIOSK'
 )
 SELECT jsonb_build_object(
  'origins', COALESCE(jsonb_agg(option ORDER BY name, id) FILTER (WHERE source_allowed), '[]'::jsonb),
  'destinations', CASE WHEN bool_or(source_allowed) THEN jsonb_agg(option ORDER BY name, id) ELSE '[]'::jsonb END
 )
 FROM options
$$;

-- Preserve the old function OID for any internal dependencies, without a public
-- overload that would bypass the key or make positional calls ambiguous.
ALTER FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, uuid, uuid, text) SET SCHEMA private_rkj;
REVOKE ALL ON FUNCTION private_rkj.create_stock_transfer(uuid, uuid, jsonb, uuid, uuid, text)
 FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_stock_transfer(
 p_from_location_id uuid, p_to_location_id uuid, p_items jsonb, p_request_id uuid,
 p_driver_id uuid DEFAULT NULL, p_vehicle_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
 v_user uuid := auth.uid();
 v_org uuid := public.organization_id();
 v_role public.user_role := public.user_role();
 v_from public.inventory_locations;
 v_to public.inventory_locations;
 v_transfer public.stock_transfers;
 v_item jsonb;
 v_stock public.stock_items;
 v_prod date;
 v_qty numeric;
 v_unit public.stock_unit;
 v_kiosk_pair boolean;
 v_id uuid := gen_random_uuid();
 v_fingerprint bytea;
BEGIN
 IF v_org IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Kunci permintaan dan item pindahan diperlukan';
 END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 OR length(p_notes) > 2000 THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Pindahan memerlukan 1 hingga 100 item dan nota maksimum 2000 aksara';
 END IF;

 SELECT * INTO v_from FROM public.inventory_locations WHERE id = p_from_location_id AND organization_id = v_org;
 SELECT * INTO v_to FROM public.inventory_locations WHERE id = p_to_location_id AND organization_id = v_org;
 IF v_from.id IS NULL OR v_to.id IS NULL OR NOT private_rkj.stock_transfer_location_manageable(v_from) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Lokasi asal atau destinasi tidak dibenarkan';
 END IF;
 v_kiosk_pair := v_from.location_type = 'BRANCH_KIOSK' AND v_to.location_type = 'BRANCH_KIOSK';
 -- AM may address another kiosk, not act on its inventory. Only its own receiver can post receipt.
 IF (v_role IN ('AREA_MANAGER', 'OPERATION_MANAGER') AND NOT v_kiosk_pair)
  OR (v_role <> 'AREA_MANAGER' AND NOT private_rkj.stock_transfer_location_manageable(v_to))
  OR (v_to.branch_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.branches b WHERE b.id = v_to.branch_id AND b.organization_id = v_org
  )) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Lokasi destinasi tidak dibenarkan';
 END IF;
 IF v_from.id = v_to.id OR (v_kiosk_pair AND v_from.branch_id IS NOT DISTINCT FROM v_to.branch_id) THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Pilih cawangan destinasi yang berbeza';
 END IF;

 v_fingerprint := sha256(convert_to(jsonb_build_array(
  p_from_location_id, p_to_location_id, p_items, p_driver_id, p_vehicle_id, p_notes
 )::text, 'UTF8'));

 SELECT * INTO v_transfer FROM public.stock_transfers
 WHERE organization_id = v_org AND created_by = v_user AND request_id = p_request_id;
 IF NOT FOUND THEN
  IF NOT v_from.is_active OR NOT v_to.is_active THEN
   RAISE invalid_parameter_value USING MESSAGE = 'Lokasi pindahan tidak aktif';
  END IF;
  IF (v_role IN ('AREA_MANAGER', 'OPERATION_MANAGER') AND (p_driver_id IS NOT NULL OR p_vehicle_id IS NOT NULL))
   OR (p_driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers WHERE id = p_driver_id AND organization_id = v_org
   )) OR (p_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND organization_id = v_org
   )) THEN
   RAISE insufficient_privilege USING MESSAGE = 'Pemandu atau kenderaan tidak dibenarkan';
  END IF;

  INSERT INTO public.stock_transfers (
   id, organization_id, transfer_number, from_location_id, to_location_id, status,
   driver_id, vehicle_id, notes, created_by, request_id, request_fingerprint
  ) VALUES (
   v_id, v_org, 'TRF-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD') || '-' || left(v_id::text, 8),
   v_from.id, v_to.id, 'PENDING', p_driver_id, p_vehicle_id, p_notes, v_user, p_request_id, v_fingerprint
  ) ON CONFLICT (organization_id, created_by, request_id) WHERE request_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_transfer;

  IF FOUND THEN
   FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number' THEN
     RAISE invalid_parameter_value USING MESSAGE = 'Item atau kuantiti pindahan tidak sah';
    END IF;
    SELECT * INTO v_stock FROM public.stock_items
    WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE invalid_parameter_value USING MESSAGE = 'Item stok tidak dijumpai'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := COALESCE((v_item->>'unit')::public.stock_unit, v_stock.base_unit);
    v_prod := NULLIF(v_item->>'production_date', '')::date;
    IF v_qty <= 0 OR v_qty >= 10000000000 OR v_qty <> round(v_qty, 4) OR v_unit IS DISTINCT FROM v_stock.base_unit THEN
     RAISE invalid_parameter_value USING MESSAGE = 'Kuantiti positif dan unit asas diperlukan';
    END IF;
    IF public.is_roti_stock_item(v_stock.id) THEN
     IF v_prod IS NULL THEN RAISE invalid_parameter_value USING MESSAGE = 'Tarikh production wajib untuk roti'; END IF;
     IF NOT v_kiosk_pair THEN PERFORM public.assert_published_production_date(v_org, v_prod); END IF;
    ELSIF v_prod IS NOT NULL AND NOT public.can_set_roti_production_date() THEN
     RAISE insufficient_privilege USING MESSAGE = 'Tiada kebenaran menetapkan tarikh production item ini';
    END IF;
    INSERT INTO public.stock_transfer_items (transfer_id, stock_item_id, quantity, unit, production_date)
    VALUES (v_transfer.id, v_stock.id, v_qty, v_unit, v_prod);
   END LOOP;

   IF v_role <> 'AREA_MANAGER' THEN
    INSERT INTO public.approval_requests (
     organization_id, entity_type, entity_id, title, description, status, requested_by, branch_id
    ) VALUES (
     v_org, 'STOCK_TRANSFER', v_transfer.id, 'Stock Transfer ' || v_transfer.transfer_number,
     v_from.name || ' → ' || v_to.name, 'PENDING', v_user, v_from.branch_id
    );
   END IF;
  ELSE
   -- A concurrent create won the unique key. Read its committed document.
   SELECT * INTO STRICT v_transfer FROM public.stock_transfers
   WHERE organization_id = v_org AND created_by = v_user AND request_id = p_request_id;
  END IF;
 END IF;

 IF v_transfer.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
  RAISE unique_violation USING MESSAGE = 'Kunci permintaan sudah digunakan untuk pindahan yang berbeza';
 END IF;
 RETURN jsonb_build_object('transfer_id', v_transfer.id, 'transfer_number', v_transfer.transfer_number,
  'kiosk_to_kiosk', v_kiosk_pair);
END;
$$;

CREATE FUNCTION private_rkj.transition_stock_transfer(p_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
DECLARE
 v_user uuid := auth.uid();
 v_org uuid := public.organization_id();
 v_transfer public.stock_transfers;
 v_from public.inventory_locations;
 v_to public.inventory_locations;
 v_item public.stock_transfer_items;
 v_balance numeric;
 v_balance_unit public.stock_unit;
 v_qty numeric;
 v_status public.transfer_status;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_reason text := btrim(p_reason);
BEGIN
 IF v_org IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 -- Lock before checking status or inserting any movements; retries are safe after commit.
 SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_id AND organization_id = v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 SELECT * INTO v_from FROM public.inventory_locations WHERE id = v_transfer.from_location_id AND organization_id = v_org;
 SELECT * INTO v_to FROM public.inventory_locations WHERE id = v_transfer.to_location_id AND organization_id = v_org;
 IF v_from.id IS NULL OR v_to.id IS NULL OR NOT (CASE WHEN p_action = 'complete'
  THEN private_rkj.stock_transfer_location_manageable(v_to)
  ELSE private_rkj.stock_transfer_location_manageable(v_from)
 END) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak';
 END IF;
 IF private_rkj.stock_transfer_is_delivery_managed(p_id) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan ini mesti diurus melalui penghantaran atau penerimaan POS';
 END IF;

 IF p_action = 'dispatch' AND v_transfer.status IN ('IN_TRANSIT', 'DELIVERED') THEN
  RETURN jsonb_build_object('transfer_id', p_id, 'status', v_transfer.status);
 ELSIF p_action = 'complete' AND v_transfer.status = 'DELIVERED' THEN
  RETURN jsonb_build_object('transfer_id', p_id, 'status', 'DELIVERED');
 ELSIF p_action = 'cancel' THEN
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 500 THEN
   RAISE invalid_parameter_value USING MESSAGE = 'Sebab pembatalan (1 hingga 500 aksara) diperlukan';
  END IF;
  IF v_transfer.status = 'CANCELLED' THEN
   IF v_transfer.cancellation_reason IS DISTINCT FROM v_reason THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan ini sudah dibatalkan dengan sebab lain';
   END IF;
   RETURN jsonb_build_object('transfer_id', p_id, 'status', 'CANCELLED');
  END IF;
 END IF;

 IF p_action IN ('dispatch', 'cancel') THEN
  IF v_transfer.status NOT IN ('DRAFT', 'PENDING') OR v_transfer.dispatched_at IS NOT NULL
   OR EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = p_id) THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan ini sudah dipos atau tidak lagi dalam draf';
  END IF;
 ELSE
  IF v_transfer.status <> 'IN_TRANSIT' OR v_transfer.dispatched_at IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = p_id
    AND movement_type = 'TRANSFER_OUT' AND location_id = v_from.id
  ) OR EXISTS (
   SELECT 1 FROM public.stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = p_id
    AND movement_type = 'TRANSFER_IN'
  ) THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan ini belum dihantar atau sudah diterima';
  END IF;
 END IF;

 IF p_action = 'cancel' THEN
  UPDATE public.stock_transfers SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_user,
   cancellation_reason = v_reason, updated_at = now() WHERE id = p_id;
  UPDATE public.approval_requests SET status = 'REJECTED', rejected_by = v_user, rejection_reason = v_reason,
   resolved_at = now(), updated_at = now()
  WHERE organization_id = v_org AND entity_type = 'STOCK_TRANSFER' AND entity_id = p_id AND status = 'PENDING';
  RETURN jsonb_build_object('transfer_id', p_id, 'status', 'CANCELLED');
 END IF;

 IF NOT v_to.is_active OR (p_action = 'dispatch' AND NOT v_from.is_active)
  OR v_from.id = v_to.id OR NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = p_id) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Lokasi atau item pindahan tidak sah';
 END IF;

 FOR v_item IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_id ORDER BY stock_item_id, id LOOP
  IF v_item.quantity <= 0 OR v_item.quantity = 'NaN'::numeric OR NOT EXISTS (
   SELECT 1 FROM public.stock_items s WHERE s.id = v_item.stock_item_id AND s.organization_id = v_org
    AND s.base_unit = v_item.unit
  ) THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Item pindahan atau unit asas tidak sah';
  END IF;
  IF public.is_roti_stock_item(v_item.stock_item_id) AND v_item.production_date IS NULL THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Tarikh production wajib untuk roti';
  END IF;

  IF p_action = 'dispatch' THEN
   -- The movement trigger uses this same balance row; serialize competing debits before checking the amount.
   SELECT quantity, unit INTO v_balance, v_balance_unit FROM public.inventory_balances
   WHERE location_id = v_from.id AND stock_item_id = v_item.stock_item_id AND organization_id = v_org FOR UPDATE;
   IF COALESCE(v_balance, 0) < v_item.quantity OR v_balance_unit IS DISTINCT FROM v_item.unit THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Baki stok asal tidak mencukupi atau unit tidak sepadan';
   END IF;
   IF v_from.location_type = 'BRANCH_KIOSK' AND public.is_roti_stock_item(v_item.stock_item_id) THEN
    SELECT COALESCE(sum(b.quantity_remaining), 0) INTO v_balance
    FROM (
     SELECT sb.quantity_remaining FROM public.stock_batches sb
     WHERE sb.organization_id = v_org AND sb.location_id = v_from.id AND sb.stock_item_id = v_item.stock_item_id
      AND sb.production_date = v_item.production_date AND sb.unit = v_item.unit
      AND sb.status = 'ACTIVE' AND sb.expires_on > v_today AND sb.quantity_remaining > 0
     ORDER BY sb.created_at, sb.id FOR UPDATE
    ) b;
    IF v_balance < v_item.quantity THEN
     RAISE SQLSTATE 'PT409' USING MESSAGE = 'Baki batch roti aktif tidak mencukupi';
    END IF;
   END IF;
   INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
    quantity, unit, reference_type, reference_id, created_by, production_date)
   VALUES (v_org, 'TRANSFER_OUT', v_from.id, v_item.stock_item_id, -v_item.quantity, v_item.unit,
    'stock_transfer', p_id, v_user, v_item.production_date);
  ELSE
   v_qty := COALESCE(v_item.received_quantity, v_item.quantity);
   IF v_qty <= 0 OR v_qty > v_item.quantity OR v_qty = 'NaN'::numeric THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Kuantiti penerimaan pindahan tidak sah';
   END IF;
   -- Create a lockable row even for the first receipt, avoiding lost concurrent first credits.
   INSERT INTO public.inventory_balances (organization_id, location_id, stock_item_id, unit)
   VALUES (v_org, v_to.id, v_item.stock_item_id, v_item.unit) ON CONFLICT (location_id, stock_item_id) DO NOTHING;
   SELECT unit INTO v_balance_unit FROM public.inventory_balances
   WHERE location_id = v_to.id AND stock_item_id = v_item.stock_item_id AND organization_id = v_org FOR UPDATE;
   IF v_balance_unit IS DISTINCT FROM v_item.unit THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Unit baki destinasi tidak sepadan';
   END IF;
   INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
    quantity, unit, reference_type, reference_id, created_by, production_date)
   VALUES (v_org, 'TRANSFER_IN', v_to.id, v_item.stock_item_id, v_qty, v_item.unit,
    'stock_transfer', p_id, v_user, v_item.production_date);
   UPDATE public.stock_transfer_items SET received_quantity = v_qty WHERE id = v_item.id;
  END IF;
 END LOOP;

 IF p_action = 'dispatch' THEN
  v_status := 'IN_TRANSIT';
  UPDATE public.stock_transfers SET status = v_status, dispatched_at = now(), updated_at = now() WHERE id = p_id;
  UPDATE public.approval_requests SET status = 'APPROVED', approved_by = v_user, resolved_at = now(), updated_at = now()
  WHERE organization_id = v_org AND entity_type = 'STOCK_TRANSFER' AND entity_id = p_id AND status = 'PENDING';
 ELSE
  v_status := 'DELIVERED';
  UPDATE public.stock_transfers SET status = v_status, delivered_at = now(), updated_at = now() WHERE id = p_id;
  PERFORM public.check_low_stock(v_org);
 END IF;
 RETURN jsonb_build_object('transfer_id', p_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_stock_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT private_rkj.transition_stock_transfer(p_transfer_id, 'dispatch') $$;

CREATE OR REPLACE FUNCTION public.complete_stock_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT private_rkj.transition_stock_transfer(p_transfer_id, 'complete') $$;

CREATE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT private_rkj.transition_stock_transfer(p_transfer_id, 'cancel', p_reason) $$;

REVOKE ALL ON FUNCTION
 private_rkj.stock_transfer_location_readable(public.inventory_locations),
 private_rkj.stock_transfer_location_manageable(public.inventory_locations),
 private_rkj.stock_transfer_is_delivery_managed(uuid),
 private_rkj.transition_stock_transfer(uuid, text, text)
 FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_stock_transfer(uuid, uuid, uuid), public.list_stock_transfers(uuid),
 public.stock_transfer_kiosk_options(), public.create_stock_transfer(uuid, uuid, jsonb, uuid, uuid, uuid, text),
 public.dispatch_stock_transfer(uuid), public.complete_stock_transfer(uuid), public.cancel_stock_transfer(uuid, text)
 FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_read_stock_transfer(uuid, uuid, uuid), public.list_stock_transfers(uuid),
 public.stock_transfer_kiosk_options(), public.create_stock_transfer(uuid, uuid, jsonb, uuid, uuid, uuid, text),
 public.dispatch_stock_transfer(uuid), public.complete_stock_transfer(uuid), public.cancel_stock_transfer(uuid, text)
 TO authenticated;
