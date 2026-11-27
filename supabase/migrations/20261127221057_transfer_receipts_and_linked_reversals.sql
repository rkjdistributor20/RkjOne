-- Extends the deployed, serialized standalone transfer workflow. Fleet and POS
-- receipts continue to write their own records and never use these entry points.
ALTER TABLE public.stock_transfers
 ADD COLUMN receipt_version integer NOT NULL DEFAULT 0,
 ADD COLUMN reversal_of_id uuid REFERENCES public.stock_transfers(id),
 ADD COLUMN reversal_reason text,
 ADD CONSTRAINT stock_transfer_reversal_link CHECK (
  (reversal_of_id IS NULL AND reversal_reason IS NULL)
  OR (reversal_of_id IS NOT NULL AND reversal_of_id <> id AND reversal_reason IS NOT NULL
      AND length(reversal_reason) BETWEEN 1 AND 500)
 );
CREATE UNIQUE INDEX stock_transfer_reversal_once ON public.stock_transfers(reversal_of_id)
 WHERE reversal_of_id IS NOT NULL;

CREATE TABLE public.stock_transfer_receipts (
 transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 version integer NOT NULL CHECK (version > 0),
 received_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 reason text CHECK (length(reason) BETWEEN 1 AND 500),
 items jsonb NOT NULL,
 excess_items jsonb NOT NULL,
 close_requested boolean NOT NULL,
 closed boolean NOT NULL,
 PRIMARY KEY (transfer_id, request_id),
 UNIQUE (transfer_id, version)
);
ALTER TABLE public.stock_transfer_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_transfer_receipts_scoped_read ON public.stock_transfer_receipts
 FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.stock_transfers t WHERE t.id = transfer_id));
REVOKE ALL ON public.stock_transfer_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stock_transfer_receipts TO authenticated;

-- Require the referenced ledger to match the document by item, unit and batch.
-- This also rejects untracked/ambiguous historical postings instead of guessing.
CREATE FUNCTION private_rkj.stock_transfer_postings_match(p_transfer public.stock_transfers)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
 WITH quantities AS (
  SELECT stock_item_id, unit, production_date, quantity AS outgoing,
   coalesce(received_quantity, 0) AS incoming, false AS invalid
  FROM public.stock_transfer_items WHERE transfer_id = p_transfer.id
  UNION ALL
  SELECT stock_item_id, unit, production_date,
   CASE WHEN movement_type = 'TRANSFER_OUT' THEN quantity ELSE 0 END,
   CASE WHEN movement_type = 'TRANSFER_IN' THEN -quantity ELSE 0 END,
   organization_id <> p_transfer.organization_id OR NOT (
    (movement_type = 'TRANSFER_OUT' AND location_id = p_transfer.from_location_id AND quantity < 0)
    OR (movement_type = 'TRANSFER_IN' AND location_id = p_transfer.to_location_id AND quantity > 0)
   )
  FROM public.stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = p_transfer.id
 )
 SELECT NOT EXISTS (
  SELECT 1 FROM quantities GROUP BY stock_item_id, unit, production_date
  HAVING sum(outgoing) <> 0 OR sum(incoming) <> 0 OR bool_or(invalid)
 )
$$;

-- Very old dispatch recorded the quantity but did not preserve batch on the
-- outgoing ledger. Permit its original full-receipt path only when the
-- exact outbound quantities, source, item and units still reconcile.
CREATE FUNCTION private_rkj.legacy_stock_transfer_full_only(p_transfer public.stock_transfers)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT p_transfer.receipt_version=0 AND p_transfer.reversal_of_id IS NULL
  AND EXISTS(SELECT 1 FROM public.stock_transfer_items WHERE transfer_id=p_transfer.id AND production_date IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id=p_transfer.id AND coalesce(received_quantity,0)<>0)
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.reference_type='stock_transfer' AND m.reference_id=p_transfer.id
   AND (m.organization_id<>p_transfer.organization_id OR m.location_id<>p_transfer.from_location_id
    OR m.production_date IS NOT NULL OR m.movement_type<>'TRANSFER_OUT' OR m.quantity>=0))
  AND NOT EXISTS (
   SELECT 1 FROM (
    SELECT stock_item_id,unit,quantity FROM public.stock_transfer_items WHERE transfer_id=p_transfer.id
    UNION ALL
    SELECT stock_item_id,unit,quantity FROM public.stock_movements
    WHERE reference_type='stock_transfer' AND reference_id=p_transfer.id
   ) q GROUP BY stock_item_id,unit HAVING sum(quantity)<>0
  );
$$;
REVOKE ALL ON FUNCTION private_rkj.legacy_stock_transfer_full_only(public.stock_transfers) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.receive_stock_transfer(
 p_transfer_id uuid, p_request_id uuid, p_receipt_version integer, p_items jsonb,
 p_finalize boolean, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
 v_org uuid := public.organization_id();
 v_actor uuid := auth.uid();
 v_transfer public.stock_transfers;
 v_to public.inventory_locations;
 v_existing public.stock_transfer_receipts;
 v_items jsonb;
 v_excess jsonb;
 v_line record;
 v_reason text := nullif(regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
 v_closed boolean;
 v_version integer;
BEGIN
 SELECT * INTO v_transfer FROM public.stock_transfers
 WHERE id = p_transfer_id AND organization_id = v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 SELECT * INTO v_to FROM public.inventory_locations
 WHERE id = v_transfer.to_location_id AND organization_id = v_org;
 IF NOT FOUND OR NOT private_rkj.stock_transfer_location_manageable(v_to) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak';
 END IF;
 IF private_rkj.stock_transfer_is_delivery_managed(p_transfer_id) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Gunakan aliran penerimaan penghantaran/POS';
 END IF;

 IF p_request_id IS NULL OR p_receipt_version IS NULL OR p_receipt_version < 0 OR p_finalize IS NULL
  OR length(v_reason) > 500 OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Butiran penerimaan tidak sah';
 END IF;
 IF jsonb_array_length(p_items) > 500 OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_items) i
  WHERE jsonb_typeof(i) IS DISTINCT FROM 'object'
   OR jsonb_typeof(i->'item_id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(i->'quantity') IS DISTINCT FROM 'number'
 ) THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Baris penerimaan tidak sah';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity) ORDER BY item_id), '[]'::jsonb)
 INTO v_items FROM jsonb_to_recordset(p_items) AS i(item_id uuid, quantity numeric);
 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(v_items) AS i(item_id uuid, quantity numeric)
  GROUP BY item_id HAVING count(*) > 1 OR bool_or(quantity < 0 OR quantity >= 10000000000 OR quantity <> round(quantity, 4))
 ) THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Gunakan satu kuantiti tidak negatif (hingga 4 perpuluhan) bagi setiap baris';
 END IF;

 SELECT * INTO v_existing FROM public.stock_transfer_receipts
 WHERE transfer_id = p_transfer_id AND request_id = p_request_id;
 IF FOUND THEN
  IF v_existing.received_by <> v_actor OR v_existing.version - 1 <> p_receipt_version
   OR v_existing.items IS DISTINCT FROM v_items OR v_existing.reason IS DISTINCT FROM v_reason
   OR v_existing.close_requested <> p_finalize THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Kunci penerimaan sudah digunakan dengan butiran lain';
  END IF;
  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'receipt_version', v_existing.version,
   'status', CASE WHEN v_existing.closed THEN 'DELIVERED' ELSE 'IN_TRANSIT' END);
 END IF;
 IF v_transfer.status <> 'IN_TRANSIT' OR v_transfer.dispatched_at IS NULL
  OR v_transfer.receipt_version <> p_receipt_version OR NOT v_to.is_active THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan sudah dikemas kini, ditutup atau tidak boleh diterima. Muat semula.';
 END IF;
 IF v_transfer.from_location_id = v_to.id OR NOT EXISTS (
  SELECT 1 FROM public.inventory_locations WHERE id = v_transfer.from_location_id AND organization_id = v_org
 ) OR NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id)
  OR NOT private_rkj.stock_transfer_postings_match(v_transfer) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Dokumen dan rekod pergerakan pindahan tidak sepadan';
 END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(v_items) AS r(item_id uuid, quantity numeric)
  LEFT JOIN public.stock_transfer_items i ON i.id = r.item_id AND i.transfer_id = p_transfer_id
  WHERE i.id IS NULL
 ) THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Baris mesti milik pindahan ini';
 END IF;
 IF NOT p_finalize AND NOT EXISTS (
  SELECT 1 FROM jsonb_to_recordset(v_items) AS r(quantity numeric) WHERE r.quantity > 0
 ) THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Masukkan kuantiti diterima atau pilih tutup dengan baki';
 END IF;
 v_closed := NOT EXISTS (
  SELECT 1 FROM public.stock_transfer_items i
  LEFT JOIN jsonb_to_recordset(v_items) AS r(item_id uuid, quantity numeric) ON i.id = r.item_id
  WHERE i.transfer_id = p_transfer_id AND coalesce(i.received_quantity, 0) + coalesce(r.quantity, 0) < i.quantity
 );
 -- Record physical overages, but never create more stock than was dispatched.
 -- The extra stock needs a separate, authorized reconciliation.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'item_id', i.id, 'quantity', r.quantity - (i.quantity - coalesce(i.received_quantity, 0))
 ) ORDER BY i.id), '[]'::jsonb) INTO v_excess
 FROM public.stock_transfer_items i
 JOIN jsonb_to_recordset(v_items) AS r(item_id uuid, quantity numeric) ON i.id = r.item_id
 WHERE i.transfer_id = p_transfer_id AND r.quantity > i.quantity - coalesce(i.received_quantity, 0);
 IF (NOT v_closed OR v_excess <> '[]'::jsonb) AND v_reason IS NULL THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Sebab penerimaan separa atau perbezaan diperlukan';
 END IF;
 v_closed := v_closed OR p_finalize;

 FOR v_line IN
  SELECT i.*, least(r.quantity, i.quantity - coalesce(i.received_quantity, 0)) AS receiving
  FROM public.stock_transfer_items i
  JOIN jsonb_to_recordset(v_items) AS r(item_id uuid, quantity numeric) ON i.id = r.item_id
  WHERE i.transfer_id = p_transfer_id AND r.quantity > 0 AND i.quantity > coalesce(i.received_quantity, 0)
  ORDER BY i.stock_item_id, i.id
 LOOP
  IF NOT EXISTS (
   SELECT 1 FROM public.stock_items s WHERE s.id = v_line.stock_item_id AND s.organization_id = v_org
    AND s.base_unit = v_line.unit
  ) OR (public.is_roti_stock_item(v_line.stock_item_id) AND v_line.production_date IS NULL) THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Item, unit atau tarikh production pindahan tidak sah';
  END IF;
  IF (public.lock_stock_balance(v_org, v_to.id, v_line.stock_item_id, v_line.unit)).unit IS DISTINCT FROM v_line.unit THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Unit baki destinasi tidak sepadan';
  END IF;
  INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
   quantity, unit, reference_type, reference_id, created_by, production_date, notes)
  VALUES (v_org, 'TRANSFER_IN', v_to.id, v_line.stock_item_id, v_line.receiving, v_line.unit,
   'stock_transfer', p_transfer_id, v_actor, v_line.production_date, v_reason);
  UPDATE public.stock_transfer_items SET received_quantity = coalesce(received_quantity, 0) + v_line.receiving
  WHERE id = v_line.id;
 END LOOP;

 v_version := v_transfer.receipt_version + 1;
 INSERT INTO public.stock_transfer_receipts (
  transfer_id, request_id, version, received_by, reason, items, excess_items, close_requested, closed
 )
 VALUES (p_transfer_id, p_request_id, v_version, v_actor, v_reason, v_items, v_excess, p_finalize, v_closed);
 IF v_closed THEN
  UPDATE public.stock_transfer_items SET received_quantity = 0
  WHERE transfer_id = p_transfer_id AND received_quantity IS NULL;
 END IF;
 UPDATE public.stock_transfers SET receipt_version = v_version,
  status = CASE WHEN v_closed THEN 'DELIVERED'::public.transfer_status ELSE status END,
  delivered_at = CASE WHEN v_closed THEN now() ELSE delivered_at END, updated_at = now()
 WHERE id = p_transfer_id;
 PERFORM public.check_low_stock(v_org);
 RETURN jsonb_build_object('transfer_id', p_transfer_id, 'receipt_version', v_version,
  'status', CASE WHEN v_closed THEN 'DELIVERED' ELSE 'IN_TRANSIT' END);
END;
$$;

-- Old clients may still do a full receipt on an untouched standalone document.
-- They cannot bypass a partial receipt, a reversal confirmation, or fleet/POS.
CREATE OR REPLACE FUNCTION public.complete_stock_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
 v_transfer public.stock_transfers;
 v_to public.inventory_locations;
BEGIN
 SELECT * INTO v_transfer FROM public.stock_transfers
 WHERE id = p_transfer_id AND organization_id = public.organization_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 SELECT * INTO v_to FROM public.inventory_locations
 WHERE id = v_transfer.to_location_id AND organization_id = v_transfer.organization_id;
 IF NOT FOUND OR NOT private_rkj.stock_transfer_location_manageable(v_to) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak';
 END IF;
 IF v_transfer.receipt_version <> 0 OR v_transfer.reversal_of_id IS NOT NULL THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Gunakan borang kuantiti penerimaan pindahan';
 END IF;
 IF v_transfer.status='IN_TRANSIT' AND NOT (private_rkj.stock_transfer_postings_match(v_transfer)
  OR private_rkj.legacy_stock_transfer_full_only(v_transfer)) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE='Dokumen lama tidak sepadan dengan pergerakan asal; rujuk Kewangan';
 END IF;
 RETURN private_rkj.transition_stock_transfer(p_transfer_id, 'complete');
END;
$$;

-- The historical date override is not used by fleet/POS or the current app.
-- Keep its OID for internal dependencies, without leaving a less scoped RPC.
DO $$
BEGIN
 IF to_regprocedure('public.complete_stock_transfer(uuid,date)') IS NOT NULL THEN
  ALTER FUNCTION public.complete_stock_transfer(uuid, date) SET SCHEMA private_rkj;
  REVOKE ALL ON FUNCTION private_rkj.complete_stock_transfer(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
 END IF;
END;
$$;

CREATE FUNCTION public.reverse_stock_transfer(p_transfer_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
 v_org uuid := public.organization_id();
 v_actor uuid := auth.uid();
 v_original public.stock_transfers;
 v_return public.stock_transfers;
 v_source public.inventory_locations;
 v_destination public.inventory_locations;
 v_id uuid := gen_random_uuid();
 v_reason text := nullif(regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
BEGIN
 SELECT * INTO v_original FROM public.stock_transfers
 WHERE id = p_transfer_id AND organization_id = v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Akses pindahan ditolak'; END IF;
 SELECT * INTO v_source FROM public.inventory_locations WHERE id = v_original.to_location_id AND organization_id = v_org;
 SELECT * INTO v_destination FROM public.inventory_locations WHERE id = v_original.from_location_id AND organization_id = v_org;
 IF v_source.id IS NULL OR v_destination.id IS NULL OR NOT private_rkj.stock_transfer_location_manageable(v_source) THEN
  RAISE insufficient_privilege USING MESSAGE = 'Hanya pihak penerima asal boleh menghantar pembalikan';
 END IF;
 IF v_reason IS NULL OR length(v_reason) > 500 THEN
  RAISE invalid_parameter_value USING MESSAGE = 'Sebab pembalikan (1 hingga 500 aksara) diperlukan';
 END IF;
 IF private_rkj.stock_transfer_is_delivery_managed(p_transfer_id) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan penghantaran/POS tidak boleh dibalikkan di sini';
 END IF;
 SELECT * INTO v_return FROM public.stock_transfers WHERE reversal_of_id = p_transfer_id AND organization_id = v_org;
 IF FOUND THEN
  IF v_return.reversal_reason IS DISTINCT FROM v_reason OR v_return.created_by IS DISTINCT FROM v_actor THEN
   RAISE SQLSTATE 'PT409' USING MESSAGE = 'Dokumen pembalikan sudah wujud';
  END IF;
  RETURN jsonb_build_object('transfer_id', v_return.id, 'transfer_number', v_return.transfer_number, 'status', v_return.status);
 END IF;
 IF v_original.status <> 'DELIVERED' OR v_original.dispatched_at IS NULL OR v_original.delivered_at IS NULL
  OR v_original.reversal_of_id IS NOT NULL OR v_original.driver_id IS NOT NULL OR v_original.vehicle_id IS NOT NULL
  OR v_source.location_type <> 'BRANCH_KIOSK' OR v_destination.location_type NOT IN ('HQ_WAREHOUSE', 'BRANCH_KIOSK')
  OR v_source.id = v_destination.id OR NOT v_source.is_active OR NOT v_destination.is_active
  OR NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id AND received_quantity > 0)
  OR EXISTS (
   SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id
    AND (received_quantity IS NULL OR received_quantity < 0 OR received_quantity > quantity)
  ) OR NOT private_rkj.stock_transfer_postings_match(v_original) THEN
  RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pindahan ini tidak boleh dibalikkan dengan selamat';
 END IF;

 INSERT INTO public.stock_transfers (
  id, organization_id, transfer_number, from_location_id, to_location_id, status, created_by, reversal_of_id, reversal_reason
 ) VALUES (
  v_id, v_org, 'REV-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD') || '-' || left(v_id::text, 8),
  v_source.id, v_destination.id, 'PENDING', v_actor, p_transfer_id, v_reason
 ) RETURNING * INTO v_return;
 INSERT INTO public.stock_transfer_items (transfer_id, stock_item_id, quantity, unit, production_date)
 SELECT v_id, stock_item_id, received_quantity, unit, production_date
 FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id AND received_quantity > 0 ORDER BY id;
 -- The existing dispatch checks source balances and exact active roti batches.
 -- If any debit would be unsafe, the entire linked document rolls back.
 PERFORM private_rkj.transition_stock_transfer(v_id, 'dispatch');
 RETURN jsonb_build_object('transfer_id', v_id, 'transfer_number', v_return.transfer_number, 'status', 'IN_TRANSIT');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_stock_transfers(p_location_id uuid DEFAULT NULL)
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
    'can_reverse', NOT d.managed AND s.status = 'DELIVERED' AND s.dispatched_at IS NOT NULL
      AND s.delivered_at IS NOT NULL AND s.reversal_of_id IS NULL AND rev.id IS NULL
      AND s.driver_id IS NULL AND s.vehicle_id IS NULL
      AND f.location_type IN ('HQ_WAREHOUSE', 'BRANCH_KIOSK') AND t.location_type = 'BRANCH_KIOSK'
      AND f.is_active AND t.is_active AND private_rkj.stock_transfer_location_manageable(t)
      AND EXISTS (SELECT 1 FROM public.stock_transfer_items i WHERE i.transfer_id = s.id AND i.received_quantity > 0),
    'reversal_of_number', orig.transfer_number, 'reversal_reason', s.reversal_reason,
    'reversal_number', rev.transfer_number, 'reversal_status', rev.status,
    'receipt_version', s.receipt_version,
    'legacy_full_receipt_only', CASE WHEN NOT d.managed AND s.status='IN_TRANSIT' AND s.receipt_version=0
      THEN private_rkj.legacy_stock_transfer_full_only(s) ELSE false END,
    'receipts', (
     SELECT coalesce(jsonb_agg(jsonb_build_object(
      'version', a.version, 'created_at', a.created_at, 'reason', a.reason, 'closed', a.closed,
      'items', a.items, 'excess_items', a.excess_items
     ) ORDER BY a.version DESC), '[]'::jsonb)
     FROM public.stock_transfer_receipts a WHERE a.transfer_id = s.id
    ),
    'stock_transfer_items', (
     SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id, 'quantity', i.quantity, 'received_quantity', i.received_quantity,
      'unit', i.unit, 'production_date', i.production_date,
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
   LEFT JOIN public.stock_transfers orig ON orig.id = s.reversal_of_id AND orig.organization_id = v_org
    AND orig.from_location_id = t.id AND orig.to_location_id = f.id
   LEFT JOIN public.stock_transfers rev ON rev.reversal_of_id = s.id AND rev.organization_id = v_org
    AND rev.from_location_id = t.id AND rev.to_location_id = f.id
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

REVOKE ALL ON FUNCTION private_rkj.stock_transfer_postings_match(public.stock_transfers)
 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.receive_stock_transfer(uuid, uuid, integer, jsonb, boolean, text),
 public.reverse_stock_transfer(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock_transfer(uuid, uuid, integer, jsonb, boolean, text),
 public.reverse_stock_transfer(uuid, text) TO authenticated;
