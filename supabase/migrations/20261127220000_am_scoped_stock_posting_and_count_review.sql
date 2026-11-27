-- AM kiosk posting and stock-count decisions. No transfer, payment or shift workflow changes.
ALTER TABLE public.stock_receives ADD COLUMN document_reference text;
CREATE UNIQUE INDEX stock_receives_manual_document_once
  ON public.stock_receives (location_id, lower(source), lower(document_reference))
  WHERE document_reference IS NOT NULL;

ALTER TABLE public.stock_counts
  ADD COLUMN rejection_reason text,
  ADD COLUMN recount_of uuid REFERENCES public.stock_counts(id);
CREATE UNIQUE INDEX stock_counts_recount_once ON public.stock_counts (recount_of) WHERE recount_of IS NOT NULL;
CREATE INDEX stock_counts_location_version ON public.stock_counts (location_id, created_at DESC, id DESC);

-- RLS and RPCs use the same active tenant/branch checks. This function reveals
-- only whether the caller has access to the specified kiosk in their tenant.
CREATE FUNCTION public.stock_kiosk_in_scope(p_location_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_locations l
    WHERE l.id = p_location_id AND l.organization_id = p_org_id
      AND p_org_id = public.organization_id()
      AND l.location_type = 'BRANCH_KIOSK'
      AND public.has_branch_access(l.branch_id)
  );
$$;

CREATE FUNCTION public.require_am_stock_kiosk(p_location_id uuid)
RETURNS public.inventory_locations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_location public.inventory_locations;
BEGIN
  SELECT * INTO v_location FROM public.inventory_locations WHERE id = p_location_id AND is_active;
  IF public.user_role() IS DISTINCT FROM 'AREA_MANAGER'
    OR NOT public.stock_kiosk_in_scope(p_location_id, v_location.organization_id) THEN
    RAISE EXCEPTION 'Lokasi inventori di luar skop anda' USING ERRCODE = '42501';
  END IF;
  RETURN v_location;
END;
$$;

-- Base-unit balance rows are the serialization point for count snapshots,
-- adjustments and every ledger movement (including a first movement for an item).
CREATE FUNCTION public.lock_stock_balance(p_org uuid, p_location uuid, p_item uuid, p_unit public.stock_unit)
RETURNS public.inventory_balances LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_balance public.inventory_balances;
BEGIN
  INSERT INTO public.inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
  VALUES (p_org, p_location, p_item, 0, p_unit)
  ON CONFLICT (location_id, stock_item_id) DO NOTHING;

  SELECT * INTO STRICT v_balance FROM public.inventory_balances
  WHERE location_id = p_location AND stock_item_id = p_item FOR UPDATE;
  IF v_balance.organization_id IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'Baki stok di luar organisasi' USING ERRCODE = '42501';
  END IF;
  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT quantity INTO NEW.balance_before
  FROM public.lock_stock_balance(NEW.organization_id, NEW.location_id, NEW.stock_item_id, NEW.unit);
  NEW.balance_after := NEW.balance_before + NEW.quantity;
  UPDATE public.inventory_balances SET quantity = NEW.balance_after,
    last_movement_at = now(), updated_at = now()
  WHERE location_id = NEW.location_id AND stock_item_id = NEW.stock_item_id;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.post_am_stock_receipt(
  p_location_id uuid, p_items jsonb, p_source text, p_document_reference text, p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loc public.inventory_locations := public.require_am_stock_kiosk(p_location_id);
  v_source text := regexp_replace(coalesce(p_source, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_doc text := nullif(regexp_replace(p_document_reference, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_id uuid;
  v_number text := public.generate_inv_number('RCV', v_loc.organization_id);
  v_line jsonb;
  v_item public.stock_items;
  v_qty numeric;
  v_date date;
BEGIN
  IF length(v_source) NOT BETWEEN 1 AND 200 OR length(v_doc) > 200 THEN
    RAISE EXCEPTION 'Nyatakan sumber luar dan dokumen rujukan yang sah';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Masukkan 1 hingga 100 baris stok';
  END IF;
  -- Manual receipts are for external stock, never a substitute for a linked handoff.
  IF upper(v_source) IN ('HQ', 'HQ_WAREHOUSE', 'FACTORY', 'BRANCH_KIOSK', 'TRANSFER') OR EXISTS (
    SELECT 1 FROM public.stock_transfers t WHERE t.organization_id = v_loc.organization_id
      AND v_loc.id IN (t.from_location_id, t.to_location_id)
      AND (lower(t.transfer_number) = lower(v_doc) OR t.id::text = lower(v_doc))
  ) OR EXISTS (
    SELECT 1 FROM public.pos_stock_receipts r WHERE r.organization_id = v_loc.organization_id AND r.location_id = v_loc.id
      AND (r.id::text = lower(v_doc) OR r.route_stop_id::text = lower(v_doc))
  ) THEN
    RAISE EXCEPTION 'Gunakan penerimaan berpaut untuk stok pindahan/HQ';
  END IF;

  INSERT INTO public.stock_receives (organization_id, receive_number, location_id, source, document_reference, notes, received_by)
  VALUES (v_loc.organization_id, v_number, v_loc.id, v_source, v_doc, p_notes, auth.uid()) RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'stock_item_id')::uuid LOOP
    SELECT * INTO v_item FROM public.stock_items
    WHERE id = (v_line->>'stock_item_id')::uuid AND organization_id = v_loc.organization_id AND status = 'ACTIVE';
    v_qty := (v_line->>'quantity')::numeric;
    IF NOT FOUND OR NOT coalesce(v_qty > 0 AND v_qty = round(v_qty, 4) AND v_qty < 10000000000, false)
      OR coalesce(nullif(v_line->>'unit', ''), v_item.base_unit::text) IS DISTINCT FROM v_item.base_unit::text THEN
      RAISE EXCEPTION 'Item, kuantiti positif atau unit asas tidak sah';
    END IF;
    IF (public.lock_stock_balance(v_loc.organization_id, v_loc.id, v_item.id, v_item.base_unit)).unit <> v_item.base_unit THEN
      RAISE EXCEPTION 'Unit baki stok tidak sepadan: %', v_item.name;
    END IF;
    v_date := nullif(v_line->>'production_date', '')::date;
    IF public.is_roti_stock_item(v_item.id) AND (
      v_date IS NULL OR NOT isfinite(v_date) OR v_date > (clock_timestamp() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    ) THEN
      RAISE EXCEPTION 'Tarikh production sebenar diperlukan untuk %', v_item.name;
    END IF;

    INSERT INTO public.stock_receive_items (receive_id, stock_item_id, quantity, unit)
    VALUES (v_id, v_item.id, v_qty, v_item.base_unit);
    INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, notes, created_by, production_date)
    VALUES (v_loc.organization_id, 'RECEIVE', v_loc.id, v_item.id, v_qty, v_item.base_unit,
      'stock_receive', v_id, concat_ws(' | ', v_source, v_doc, nullif(btrim(p_notes), '')), auth.uid(), v_date);
  END LOOP;

  RETURN jsonb_build_object('receive_id', v_id, 'receive_number', v_number);
END;
$$;

CREATE FUNCTION public.post_am_stock_adjustment(p_location_id uuid, p_reason text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loc public.inventory_locations := public.require_am_stock_kiosk(p_location_id);
  v_reason text := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_id uuid;
  v_number text := public.generate_inv_number('ADJ', v_loc.organization_id);
  v_line jsonb;
  v_item public.stock_items;
  v_balance public.inventory_balances;
  v_after numeric;
  v_delta numeric;
  v_date date;
  v_movement_id uuid;
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF length(v_reason) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Sebab pelarasan diperlukan'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Masukkan 1 hingga 100 baris stok';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i GROUP BY (i->>'stock_item_id')::uuid HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Satu baris pelarasan sahaja bagi setiap item';
  END IF;

  INSERT INTO public.stock_adjustments (organization_id, adjustment_number, location_id, reason, status, created_by, approved_by, approved_at)
  VALUES (v_loc.organization_id, v_number, v_loc.id, v_reason, 'APPROVED', auth.uid(), auth.uid(), clock_timestamp())
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'stock_item_id')::uuid LOOP
    SELECT * INTO v_item FROM public.stock_items
    WHERE id = (v_line->>'stock_item_id')::uuid AND organization_id = v_loc.organization_id;
    v_after := (v_line->>'quantity_after')::numeric;
    IF NOT FOUND OR NOT coalesce(v_after >= 0 AND v_after = round(v_after, 4) AND v_after < 10000000000, false) THEN
      RAISE EXCEPTION 'Item atau baki baharu tidak sah';
    END IF;
    v_balance := public.lock_stock_balance(v_loc.organization_id, v_loc.id, v_item.id, v_item.base_unit);
    IF v_balance.unit <> v_item.base_unit THEN RAISE EXCEPTION 'Unit baki stok tidak sepadan: %', v_item.name; END IF;
    IF v_balance.quantity IS DISTINCT FROM (v_line->>'expected_quantity')::numeric THEN
      RAISE EXCEPTION 'Baki % telah berubah. Muat semula sebelum melaras.', v_item.name USING ERRCODE = '40001';
    END IF;
    v_delta := v_after - v_balance.quantity;
    IF v_delta = 0 THEN RAISE EXCEPTION 'Tiada perubahan kuantiti untuk %', v_item.name; END IF;
    v_date := nullif(v_line->>'production_date', '')::date;
    IF v_delta > 0 AND public.is_roti_stock_item(v_item.id)
      AND (v_date IS NULL OR NOT isfinite(v_date) OR v_date > v_today) THEN
      RAISE EXCEPTION 'Tarikh production sebenar diperlukan untuk menambah %', v_item.name;
    END IF;

    INSERT INTO public.stock_adjustment_items (adjustment_id, stock_item_id, quantity_before, quantity_after, unit)
    VALUES (v_id, v_item.id, v_balance.quantity, v_after, v_item.base_unit);
    INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, notes, created_by, production_date)
    VALUES (v_loc.organization_id, 'ADJUSTMENT', v_loc.id, v_item.id, v_delta, v_item.base_unit,
      'stock_adjustment', v_id, v_reason, auth.uid(), v_date) RETURNING id INTO v_movement_id;

    IF v_delta > 0 AND public.is_roti_stock_item(v_item.id) THEN
      INSERT INTO public.stock_batches (organization_id, location_id, stock_item_id, quantity_remaining,
        unit, production_date, expires_on, inbound_movement_id, status)
      VALUES (v_loc.organization_id, v_loc.id, v_item.id, v_delta, v_item.base_unit, v_date,
        v_date + public.roti_shelf_life_days(), v_movement_id,
        CASE WHEN v_date + public.roti_shelf_life_days() < v_today THEN 'EXPIRED' ELSE 'ACTIVE' END);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('adjustment_id', v_id, 'adjustment_number', v_number, 'status', 'APPROVED');
END;
$$;

-- Keep the three-argument RPC for callers not performing a recount. The four-
-- argument RPC intentionally has no defaults, so PostgREST can disambiguate.
CREATE FUNCTION public.submit_stock_count(p_location_id uuid, p_items jsonb, p_notes text, p_recount_of uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loc public.inventory_locations;
  v_item record;
  v_balance public.inventory_balances;
  v_actor uuid := auth.uid();
  v_role public.user_role := public.user_role();
  v_id uuid;
  v_number text;
  v_auto boolean := v_role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER');
  v_snapshot jsonb := '{}'::jsonb;
  v_line jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO v_loc FROM public.inventory_locations
  WHERE id = p_location_id AND organization_id = public.organization_id() AND is_active;
  IF NOT FOUND OR v_role IS NULL OR v_role NOT IN (
    'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY', 'AREA_MANAGER', 'STAFF'
  ) OR (v_role IN ('AREA_MANAGER', 'STAFF') AND NOT public.stock_kiosk_in_scope(v_loc.id, v_loc.organization_id))
    OR (v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id)) THEN
    RAISE EXCEPTION 'Lokasi kiraan stok di luar skop anda' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Masukkan 1 hingga 100 baris kiraan stok';
  END IF;
  IF p_recount_of IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stock_counts c WHERE c.id = p_recount_of AND c.location_id = v_loc.id
      AND c.organization_id = v_loc.organization_id AND c.status = 'REJECTED' AND c.counted_by = v_actor
  ) THEN
    RAISE EXCEPTION 'Kiraan ditolak untuk dikira semula tidak dijumpai' USING ERRCODE = '42501';
  END IF;
  IF p_recount_of IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stock_count_items old WHERE old.count_id = p_recount_of AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) i WHERE (i->>'stock_item_id')::uuid = old.stock_item_id
    )
  ) THEN
    RAISE EXCEPTION 'Kira semula setiap item dalam rekod yang ditolak';
  END IF;

  -- Lock every counted item before taking the baseline, in a stable order.
  FOR v_item IN SELECT DISTINCT (i->>'stock_item_id')::uuid AS id FROM jsonb_array_elements(p_items) i ORDER BY 1 LOOP
    SELECT b.* INTO v_balance FROM public.stock_items s
    CROSS JOIN LATERAL public.lock_stock_balance(v_loc.organization_id, v_loc.id, s.id, s.base_unit) b
    WHERE s.id = v_item.id AND s.organization_id = v_loc.organization_id AND s.base_unit = b.unit;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item atau unit baki kiraan stok tidak sah'; END IF;
    v_snapshot := v_snapshot || jsonb_build_object(v_item.id::text,
      jsonb_build_object('quantity', v_balance.quantity, 'unit', v_balance.unit));
  END LOOP;

  v_number := public.generate_inv_number('CNT', v_loc.organization_id);
  INSERT INTO public.stock_counts (organization_id, count_number, location_id, status, notes, counted_by, approved_by, created_at, recount_of)
  VALUES (v_loc.organization_id, v_number, v_loc.id,
    CASE WHEN v_auto THEN 'APPROVED'::public.approval_status ELSE 'PENDING'::public.approval_status END,
    p_notes, v_actor, CASE WHEN v_auto THEN v_actor END, clock_timestamp(), p_recount_of)
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_line->>'stock_item_id')::uuid;
    v_qty := (v_line->>'counted_quantity')::numeric;
    IF NOT coalesce(v_qty >= 0 AND v_qty = round(v_qty, 4) AND v_qty < 10000000000, false)
      OR coalesce(nullif(v_line->>'unit', ''), v_snapshot->v_item_id::text->>'unit')
        IS DISTINCT FROM (v_snapshot->v_item_id::text->>'unit') THEN
      RAISE EXCEPTION 'Kuantiti kiraan atau unit asas tidak sah';
    END IF;
    INSERT INTO public.stock_count_items (count_id, stock_item_id, system_quantity, counted_quantity, unit, production_date, notes)
    VALUES (v_id, v_item_id,
      CASE WHEN v_item_id = ANY(v_seen) THEN 0
        ELSE (v_snapshot->v_item_id::text->>'quantity')::numeric END,
      v_qty, (v_snapshot->v_item_id::text->>'unit')::public.stock_unit,
      nullif(v_line->>'production_date', '')::date, nullif(v_line->>'note', ''));
    v_seen := array_append(v_seen, v_item_id);
  END LOOP;

  IF v_auto THEN
    INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
      quantity, unit, reference_type, reference_id, notes, created_by)
    SELECT v_loc.organization_id, 'COUNT', v_loc.id, stock_item_id,
      sum(variance), unit, 'stock_count', v_id, p_notes, v_actor
    FROM public.stock_count_items WHERE count_id = v_id
    GROUP BY stock_item_id, unit HAVING sum(variance) <> 0 ORDER BY stock_item_id;
  ELSE
    INSERT INTO public.approval_requests (organization_id, entity_type, entity_id, title, status, requested_by, branch_id)
    VALUES (v_loc.organization_id, 'STOCK_TRANSFER', v_id, 'Kiraan stok ' || v_number,
      'PENDING', v_actor, v_loc.branch_id);
  END IF;
  RETURN jsonb_build_object('count_id', v_id, 'count_number', v_number,
    'status', CASE WHEN v_auto THEN 'APPROVED' ELSE 'PENDING' END);
END;
$$;

-- Preserve other approval types through the previous implementation. Route all
-- stock-count decisions (including from the existing approval centre) through
-- one lock, scope check, ledger post and notification transaction.
ALTER FUNCTION public.resolve_approval_request(uuid, text, text) RENAME TO resolve_approval_request_before_am_stock;
CREATE FUNCTION public.resolve_approval_request(p_request_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.approval_requests;
BEGIN
  SELECT * INTO v_req FROM public.approval_requests WHERE id = p_request_id
    AND organization_id = public.organization_id() AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found'; END IF;
  IF public.user_role() = 'AREA_MANAGER' AND (v_req.branch_id IS NULL OR NOT public.has_branch_access(v_req.branch_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Rekod kelulusan di luar cawangan AM';
  END IF;
  IF v_req.entity_type='POS_SHIFT_STAFF' THEN
    PERFORM 1 FROM public.approval_requests WHERE id=p_request_id AND status='PENDING' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Keputusan syif sudah direkodkan'; END IF;
  END IF;
  IF FOUND AND v_req.entity_type = 'STOCK_TRANSFER' AND EXISTS (
    SELECT 1 FROM public.stock_counts WHERE id = v_req.entity_id
  ) THEN
    RETURN public.review_stock_count(v_req.entity_id, upper(p_action), p_reason);
  END IF;
  IF FOUND AND v_req.entity_type = 'STOCK_ADJUSTMENT' AND public.user_role() = 'AREA_MANAGER' THEN
    PERFORM public.require_am_stock_kiosk((
      SELECT location_id FROM public.stock_adjustments WHERE id = v_req.entity_id
        AND organization_id = v_req.organization_id
    ));
  END IF;
  RETURN public.resolve_approval_request_before_am_stock(p_request_id, p_action, p_reason);
END;
$$;

-- Legacy direct RPCs remain available to their existing non-AM API roles only;
-- AMs must use the validated external-receipt/posted-adjustment contracts.
ALTER FUNCTION public.receive_stock(uuid, jsonb, text, text) RENAME TO receive_stock_before_am_stock;
CREATE FUNCTION public.receive_stock(
  p_location_id uuid, p_items jsonb, p_source text DEFAULT 'FACTORY', p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY'), true)
    OR NOT EXISTS (SELECT 1 FROM public.inventory_locations
      WHERE id = p_location_id AND organization_id = public.organization_id()) THEN
    RAISE EXCEPTION 'Tiada kebenaran menerima stok melalui aliran ini' USING ERRCODE = '42501';
  END IF;
  RETURN public.receive_stock_before_am_stock(p_location_id, p_items, p_source, p_notes);
END;
$$;

ALTER FUNCTION public.submit_stock_adjustment(uuid, text, jsonb) RENAME TO submit_stock_adjustment_before_am_stock;
CREATE FUNCTION public.submit_stock_adjustment(p_location_id uuid, p_reason text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY'), true)
    OR NOT EXISTS (SELECT 1 FROM public.inventory_locations
      WHERE id = p_location_id AND organization_id = public.organization_id()) THEN
    RAISE EXCEPTION 'Tiada kebenaran melaras stok melalui aliran ini' USING ERRCODE = '42501';
  END IF;
  RETURN public.submit_stock_adjustment_before_am_stock(p_location_id, p_reason, p_items);
END;
$$;

ALTER FUNCTION public.approve_stock_adjustment(uuid) RENAME TO approve_stock_adjustment_before_am_stock;
CREATE FUNCTION public.approve_stock_adjustment(p_adjustment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_adj public.stock_adjustments;
BEGIN
  SELECT * INTO v_adj FROM public.stock_adjustments WHERE id = p_adjustment_id
    AND organization_id = public.organization_id() AND status = 'PENDING' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelarasan tiada dalam skop atau sudah diputuskan' USING ERRCODE = '42501'; END IF;
  IF public.user_role() = 'AREA_MANAGER' THEN
    PERFORM public.require_am_stock_kiosk(v_adj.location_id);
  END IF;
  RETURN public.approve_stock_adjustment_before_am_stock(p_adjustment_id);
END;
$$;

-- POS expiry summary is a SECURITY DEFINER read; AMs must not bypass the
-- scoped stock-batch policy by supplying a different location to this RPC.
ALTER FUNCTION public.get_roti_expiry_summary(uuid) RENAME TO get_roti_expiry_summary_before_am_stock;
CREATE FUNCTION public.get_roti_expiry_summary(p_location_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.user_role() = 'AREA_MANAGER' THEN PERFORM public.require_am_stock_kiosk(p_location_id); END IF;
  RETURN public.get_roti_expiry_summary_before_am_stock(p_location_id);
END;
$$;

-- Preserve existing policies for other roles. Restrictive policies prevent the
-- older org-wide permissive policies from bypassing the AM read restriction.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['inventory_balances', 'stock_movements', 'stock_batches',
    'stock_receives', 'stock_adjustments', 'stock_counts']
  LOOP
    EXECUTE format('CREATE POLICY am_kiosk_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
      USING ((SELECT public.user_role()) IS DISTINCT FROM ''AREA_MANAGER''
        OR public.stock_kiosk_in_scope(location_id, organization_id))', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['inventory_balances', 'stock_movements', 'stock_batches']
  LOOP
    EXECUTE format('CREATE POLICY am_ledger_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT public.user_role()) IS DISTINCT FROM ''AREA_MANAGER'')', v_table);
    EXECUTE format('CREATE POLICY am_ledger_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT public.user_role()) IS DISTINCT FROM ''AREA_MANAGER'')', v_table);
    EXECUTE format('CREATE POLICY am_ledger_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((SELECT public.user_role()) IS DISTINCT FROM ''AREA_MANAGER'')', v_table);
  END LOOP;
END;
$$;

-- Child SELECT policies already join their parent; authenticated clients have
-- no direct write path around the immutable stock records and scoped RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.stock_counts, public.stock_count_items,
  public.stock_adjustments, public.stock_adjustment_items, public.stock_receives, public.stock_receive_items
  FROM PUBLIC, anon, authenticated;

CREATE POLICY stock_count_requests_read ON public.approval_requests AS RESTRICTIVE FOR SELECT TO authenticated
USING ((SELECT public.user_role()) IS DISTINCT FROM 'AREA_MANAGER' OR entity_type NOT IN ('STOCK_TRANSFER', 'STOCK_ADJUSTMENT')
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id)));

CREATE POLICY staff_kiosk_count_read ON public.stock_counts AS RESTRICTIVE FOR SELECT TO authenticated
USING ((SELECT public.user_role()) IS DISTINCT FROM 'STAFF' OR public.stock_kiosk_in_scope(location_id, organization_id));

CREATE POLICY stock_count_requests_update ON public.approval_requests AS RESTRICTIVE FOR UPDATE TO authenticated
USING (entity_type <> 'STOCK_TRANSFER' OR NOT EXISTS (
  SELECT 1 FROM public.stock_counts c WHERE c.id = approval_requests.entity_id
));

REVOKE EXECUTE ON FUNCTION public.require_am_stock_kiosk(uuid),
  public.lock_stock_balance(uuid, uuid, uuid, public.stock_unit),
  public.resolve_approval_request_before_am_stock(uuid, text, text),
  public.receive_stock_before_am_stock(uuid, jsonb, text, text),
  public.submit_stock_adjustment_before_am_stock(uuid, text, jsonb),
  public.approve_stock_adjustment_before_am_stock(uuid), public.get_roti_expiry_summary_before_am_stock(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.stock_kiosk_in_scope(uuid, uuid),
  public.post_am_stock_receipt(uuid, jsonb, text, text, text), public.post_am_stock_adjustment(uuid, text, jsonb),
  public.submit_stock_count(uuid, jsonb, text, uuid),
  public.resolve_approval_request(uuid, text, text), public.receive_stock(uuid, jsonb, text, text),
  public.submit_stock_adjustment(uuid, text, jsonb), public.approve_stock_adjustment(uuid), public.get_roti_expiry_summary(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_kiosk_in_scope(uuid, uuid),
  public.post_am_stock_receipt(uuid, jsonb, text, text, text), public.post_am_stock_adjustment(uuid, text, jsonb),
  public.submit_stock_count(uuid, jsonb, text, uuid),
  public.resolve_approval_request(uuid, text, text), public.receive_stock(uuid, jsonb, text, text),
  public.submit_stock_adjustment(uuid, text, jsonb), public.approve_stock_adjustment(uuid), public.get_roti_expiry_summary(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_stock_count(p_location_id uuid, p_items jsonb, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.submit_stock_count(p_location_id, p_items, p_notes, NULL::uuid);
$$;

CREATE FUNCTION public.review_stock_count(p_count_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count public.stock_counts;
  v_loc public.inventory_locations;
  v_role public.user_role := public.user_role();
  v_actor uuid := auth.uid();
  v_reason text := nullif(regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_line record;
  v_balance public.inventory_balances;
  v_delta numeric;
  v_audit jsonb := '[]'::jsonb;
  v_resolved_at timestamptz;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER') THEN
    RAISE EXCEPTION 'Tiada kebenaran menyemak kiraan stok' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Keputusan kiraan stok tidak sah';
  END IF;
  IF p_action = 'REJECT' AND (v_reason IS NULL OR length(v_reason) > 1000) THEN
    RAISE EXCEPTION 'Sebab penolakan diperlukan';
  END IF;

  SELECT c.* INTO v_count FROM public.stock_counts c
  WHERE c.id = p_count_id AND c.organization_id = public.organization_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kiraan stok di luar skop anda' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_loc FROM public.inventory_locations WHERE id = v_count.location_id
    AND organization_id = v_count.organization_id AND is_active;
  IF NOT FOUND OR (v_role = 'AREA_MANAGER' AND NOT public.stock_kiosk_in_scope(v_loc.id, v_count.organization_id))
    OR (v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id)) THEN
    RAISE EXCEPTION 'Kiraan stok di luar skop anda' USING ERRCODE = '42501';
  END IF;
  IF v_count.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Kiraan stok ini sudah diputuskan. Muat semula senarai.' USING ERRCODE = '40001';
  END IF;

  IF p_action = 'APPROVE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stock_count_items WHERE count_id = p_count_id) THEN
      RAISE EXCEPTION 'Kiraan kosong. Tolak dan minta staf membuat kiraan baharu.' USING ERRCODE = '40001';
    END IF;

    FOR v_line IN
      SELECT i.stock_item_id, sum(i.system_quantity) AS baseline, sum(i.counted_quantity) AS counted,
        bool_and(i.unit = s.base_unit) AS valid_unit, s.base_unit, s.organization_id, min(i.counted_quantity) AS smallest
      FROM public.stock_count_items i JOIN public.stock_items s ON s.id = i.stock_item_id
      WHERE i.count_id = p_count_id GROUP BY i.stock_item_id, s.base_unit, s.organization_id ORDER BY i.stock_item_id
    LOOP
      IF v_line.organization_id <> v_count.organization_id OR NOT v_line.valid_unit OR v_line.smallest < 0
        OR NOT (v_line.counted < 10000000000) THEN
        RAISE EXCEPTION 'Item, kuantiti atau unit kiraan tidak sah. Minta kiraan semula.' USING ERRCODE = '40001';
      END IF;
      v_balance := public.lock_stock_balance(v_count.organization_id, v_loc.id, v_line.stock_item_id, v_line.base_unit);
      -- Do not stack two independent physical corrections for the same item.
      -- The lock also prevents a fresh submission from missing this decision.
      IF EXISTS (
        SELECT 1 FROM public.stock_counts newer JOIN public.stock_count_items i ON i.count_id = newer.id
        WHERE newer.location_id = v_loc.id AND newer.organization_id = v_count.organization_id
          AND newer.status IN ('PENDING', 'APPROVED')
          AND (newer.created_at, newer.id) > (v_count.created_at, v_count.id)
          AND i.stock_item_id = v_line.stock_item_id
      ) OR EXISTS (
        SELECT 1 FROM public.stock_movements m WHERE m.location_id = v_loc.id
          AND m.stock_item_id = v_line.stock_item_id AND m.movement_type = 'COUNT'
          AND m.created_at > v_count.created_at
      ) THEN
        RAISE EXCEPTION 'Versi kiraan stok ini lapuk. Gunakan kiraan terbaharu atau kira semula.' USING ERRCODE = '40001';
      END IF;

      -- Count at snapshot + (live balance - snapshot balance) is exactly
      -- live balance + variance. Never overwrite sales/transfers/receipts.
      -- As before, batch lines are retained as evidence; the COUNT posting
      -- reconciles the SKU total using the existing batch movement rules.
      v_delta := v_line.counted - v_line.baseline;
      IF v_balance.unit <> v_line.base_unit OR v_balance.quantity + v_delta < 0 THEN
        RAISE EXCEPTION 'Baki semasa tidak serasi dengan kiraan. Minta kiraan semula.' USING ERRCODE = '40001';
      END IF;
      IF v_delta <> 0 THEN
        INSERT INTO public.stock_movements (organization_id, movement_type, location_id, stock_item_id,
          quantity, unit, reference_type, reference_id, notes, created_by, created_at)
        VALUES (v_count.organization_id, 'COUNT', v_loc.id, v_line.stock_item_id, v_delta,
          v_line.base_unit, 'stock_count', p_count_id, v_count.notes, v_actor, clock_timestamp());
      END IF;
      v_audit := v_audit || jsonb_build_array(jsonb_build_object(
        'stock_item_id', v_line.stock_item_id, 'unit', v_line.base_unit,
        'snapshot_balance', v_line.baseline, 'counted_quantity', v_line.counted,
        'net_since_count', v_balance.quantity - v_line.baseline, 'delta', v_delta,
        'balance_before', v_balance.quantity, 'balance_after', v_balance.quantity + v_delta));
    END LOOP;
  END IF;

  v_resolved_at := clock_timestamp();
  UPDATE public.stock_counts SET status = CASE WHEN p_action = 'APPROVE' THEN 'APPROVED'::public.approval_status
    ELSE 'REJECTED'::public.approval_status END,
    approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor END,
    rejection_reason = CASE WHEN p_action = 'REJECT' THEN v_reason END
  WHERE id = p_count_id;

  UPDATE public.approval_requests SET status = CASE WHEN p_action = 'APPROVE' THEN 'APPROVED'::public.approval_status
    ELSE 'REJECTED'::public.approval_status END,
    approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor END,
    rejected_by = CASE WHEN p_action = 'REJECT' THEN v_actor END,
    rejection_reason = CASE WHEN p_action = 'REJECT' THEN v_reason END,
    resolved_at = v_resolved_at
  WHERE entity_type = 'STOCK_TRANSFER' AND entity_id = p_count_id
    AND organization_id = v_count.organization_id AND status = 'PENDING';

  IF p_action = 'REJECT' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_count.counted_by AND organization_id = v_count.organization_id
  ) THEN
    INSERT INTO public.notifications (organization_id, recipient_id, type, title, message, link, entity_type, entity_id)
    VALUES (v_count.organization_id, v_count.counted_by, 'PENDING_APPROVAL', 'Kiraan stok ditolak',
      v_count.count_number || ': ' || v_reason || '. Kira semula / Hantar semula dalam SOP Stok POS.',
      '/pos', 'stock_count', p_count_id);
  END IF;

  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  VALUES (v_count.organization_id, v_actor, 'STOCK_COUNT_' || p_action, 'stock_count', p_count_id,
    jsonb_build_object('location_id', v_loc.id, 'branch_id', v_loc.branch_id,
      'counted_at', v_count.created_at, 'resolved_at', v_resolved_at, 'reason', v_reason, 'items', v_audit));
  RETURN jsonb_build_object('count_id', p_count_id,
    'status', CASE WHEN p_action = 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_stock_count(p_count_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.review_stock_count(p_count_id, 'APPROVE');
$$;

REVOKE EXECUTE ON FUNCTION public.review_stock_count(uuid, text, text),
  public.submit_stock_count(uuid, jsonb, text), public.approve_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_stock_count(uuid, text, text),
  public.submit_stock_count(uuid, jsonb, text), public.approve_stock_count(uuid) TO authenticated, service_role;

-- The stock check history is deliberately short; unresolved rejections must
-- remain actionable even after newer unrelated counts fill that history.
CREATE FUNCTION public.list_pos_stock_recounts(p_location_id uuid)
RETURNS TABLE(id uuid, count_number text, rejection_reason text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id, c.count_number, c.rejection_reason
  FROM public.stock_counts c
  WHERE c.location_id = p_location_id AND c.organization_id = public.organization_id()
    AND public.user_role() = 'STAFF' AND c.counted_by = auth.uid()
    AND c.status = 'REJECTED' AND public.stock_kiosk_in_scope(c.location_id, c.organization_id)
    AND NOT EXISTS (SELECT 1 FROM public.stock_counts replacement WHERE replacement.recount_of = c.id)
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.list_pos_stock_recounts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pos_stock_recounts(uuid) TO authenticated;
