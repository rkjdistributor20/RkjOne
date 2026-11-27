-- Staff observations can outlive their network connection and POS shift. A
-- capture is an immutable, server-issued version, not a timestamp from a tablet.
CREATE TABLE public.pos_stock_count_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  captured_by uuid NOT NULL REFERENCES public.profiles(id),
  shift_id uuid REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL,
  items jsonb NOT NULL,
  pos_request_hash bytea,
  pos_result jsonb
);
ALTER TABLE public.pos_stock_count_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_stock_count_captures FROM PUBLIC, anon, authenticated;

ALTER TABLE public.stock_counts
  ADD COLUMN capture_id uuid REFERENCES public.pos_stock_count_captures(id),
  ADD COLUMN captured_at timestamptz,
  ADD COLUMN staff_observation boolean,
  ALTER COLUMN count_date DROP NOT NULL;
ALTER TABLE public.stock_count_items ALTER COLUMN system_quantity DROP NOT NULL;
CREATE UNIQUE INDEX stock_counts_capture_once ON public.stock_counts(capture_id) WHERE capture_id IS NOT NULL;

-- Unlike balance or last_movement_at, this version also notices a zero-delta
-- count approval. Captures and decisions read it in the same snapshot as stock.
CREATE FUNCTION public.stock_count_approval_version(p_location uuid, p_item uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*) FROM public.stock_counts c
  WHERE c.location_id = p_location AND c.status = 'APPROVED'
    AND EXISTS (SELECT 1 FROM public.stock_count_items i WHERE i.count_id = c.id AND i.stock_item_id = p_item);
$$;

-- An intervening movement between starting a count and sending it makes the
-- moment of physical observation ambiguous. Even an offsetting pair of
-- movements must invalidate that baseline. Balance row locks serialize the
-- movement version check with stock writers at submission.
CREATE FUNCTION private_rkj.stock_count_movement_version(p_location uuid,p_item uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT count(*) FROM public.stock_movements
 WHERE location_id=p_location AND stock_item_id=p_item
$$;
REVOKE ALL ON FUNCTION private_rkj.stock_count_movement_version(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.capture_pos_stock_count(p_location_id uuid, p_stock_item_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_location public.inventory_locations;
  v_capture public.pos_stock_count_captures;
BEGIN
  SELECT * INTO v_location FROM public.inventory_locations
    WHERE id = p_location_id AND organization_id = public.organization_id() AND is_active;
  IF NOT FOUND OR public.user_role() IS DISTINCT FROM 'STAFF'
    OR NOT public.stock_kiosk_in_scope(v_location.id, v_location.organization_id) THEN
    RAISE EXCEPTION 'Lokasi kiraan stok di luar skop anda' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_stock_item_ids), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Masukkan 1 hingga 100 item untuk snapshot kiraan stok';
  END IF;

  -- One MVCC view for balances, units, approval versions and shift. No
  -- balance initialization or ledger/shift locks while staff count.
  INSERT INTO public.pos_stock_count_captures(location_id, captured_by, shift_id, captured_at, items)
  SELECT v_location.id, auth.uid(), (
      SELECT id FROM public.pos_shifts WHERE branch_id = v_location.branch_id
        AND organization_id = v_location.organization_id AND status = 'OPEN'
      ORDER BY opened_at DESC, id DESC LIMIT 1
    ), clock_timestamp(),
    coalesce(jsonb_object_agg(s.id::text, jsonb_build_object(
      'quantity', coalesce(b.quantity, 0), 'unit', s.base_unit,
      'movement_version', private_rkj.stock_count_movement_version(v_location.id,s.id),
      'approval_version', public.stock_count_approval_version(v_location.id, s.id))), '{}'::jsonb)
  FROM public.stock_items s
  LEFT JOIN public.inventory_balances b ON b.location_id = v_location.id AND b.stock_item_id = s.id
  WHERE s.organization_id = v_location.organization_id AND s.id = ANY(p_stock_item_ids)
    AND (b.id IS NULL OR (b.organization_id = v_location.organization_id AND b.unit = s.base_unit))
  RETURNING * INTO v_capture;

  IF v_capture.shift_id IS NULL THEN
    RAISE EXCEPTION 'Buka syif POS dahulu sebelum memulakan snapshot kiraan stok';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_stock_item_ids) AS sku(id) WHERE NOT coalesce(v_capture.items ? sku.id::text, false)) THEN
    RAISE EXCEPTION 'Item atau unit baki tidak serasi dengan snapshot kiraan stok';
  END IF;
  RETURN jsonb_build_object('id', v_capture.id, 'captured_at', v_capture.captured_at);
END;
$$;

-- Keep the deployed input, scope, item/batch and recount validation. Its
-- staff path never posts stock; use the locked submission to replace only the
-- system baseline (or clear it), before either row is visible to a reviewer.
ALTER FUNCTION public.submit_stock_count(uuid, jsonb, text, uuid) RENAME TO submit_stock_count_at_submission;
REVOKE EXECUTE ON FUNCTION public.submit_stock_count_at_submission(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.submit_captured_stock_count(
  p_location_id uuid, p_items jsonb, p_notes text, p_recount_of uuid, p_capture_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count public.stock_counts;
  v_capture public.pos_stock_count_captures;
  v_result jsonb;
  v_reason text;
  v_line record;
BEGIN
  IF public.user_role() = 'STAFF' AND p_capture_id IS NOT NULL THEN
    -- Single-use, bound to the original counter and kiosk. Never treat
    -- self-reported dates or the submission clock as a physical observation.
    SELECT * INTO v_capture FROM public.pos_stock_count_captures
      WHERE id = p_capture_id AND location_id = p_location_id AND captured_by = v_actor FOR UPDATE;
    IF FOUND AND EXISTS (SELECT 1 FROM public.stock_counts WHERE capture_id = p_capture_id) THEN
      RAISE EXCEPTION 'Versi kiraan ini sudah dihantar. Muat semula rekod kiraan.' USING ERRCODE = '23505';
    END IF;
  END IF;

  v_result := public.submit_stock_count_at_submission(p_location_id, p_items, p_notes, p_recount_of);
  SELECT * INTO STRICT v_count FROM public.stock_counts WHERE id = (v_result->>'count_id')::uuid;
  IF public.user_role() <> 'STAFF' THEN
    UPDATE public.stock_counts SET staff_observation = false WHERE id = v_count.id;
    RETURN v_result;
  END IF;

  IF v_capture.id IS NULL THEN
    v_reason := 'Tiada snapshot kiraan yang sah. Ambil snapshot baharu dan kira semula stok fizikal.';
  ELSE
    FOR v_line IN
      SELECT DISTINCT stock_item_id, unit FROM public.stock_count_items WHERE count_id = v_count.id
    LOOP
      IF v_capture.items->v_line.stock_item_id::text->>'unit' IS DISTINCT FROM v_line.unit::text THEN
        v_reason := 'Snapshot tidak meliputi semua item atau unit kiraan. Ambil snapshot baharu dan kira semula.';
        EXIT;
      END IF;
      IF public.stock_count_approval_version(v_count.location_id, v_line.stock_item_id)
        <> (v_capture.items->v_line.stock_item_id::text->>'approval_version')::bigint
        OR EXISTS (
          SELECT 1 FROM public.stock_counts newer JOIN public.stock_count_items i ON i.count_id = newer.id
          WHERE newer.location_id = v_count.location_id AND newer.id <> v_count.id
            AND newer.status IN ('PENDING', 'APPROVED') AND i.stock_item_id = v_line.stock_item_id
            AND coalesce(newer.captured_at, newer.created_at) >= v_capture.captured_at
        ) THEN
        v_reason := 'Snapshot kiraan lapuk kerana versi kiraan lain. Ambil snapshot baharu dan kira semula.';
        EXIT;
      END IF;
      IF private_rkj.stock_count_movement_version(v_count.location_id,v_line.stock_item_id)
        IS DISTINCT FROM (v_capture.items->v_line.stock_item_id::text->>'movement_version')::bigint THEN
        v_reason := 'Stok bergerak antara snapshot dan penghantaran. Masa kiraan tidak pasti; ambil snapshot baharu dan kira semula.';
        EXIT;
      END IF;
    END LOOP;
  END IF;

  WITH lines AS (
    SELECT id, stock_item_id, row_number() OVER (PARTITION BY stock_item_id ORDER BY id) AS item_line
    FROM public.stock_count_items WHERE count_id = v_count.id
  )
  UPDATE public.stock_count_items i SET system_quantity = CASE
    WHEN v_capture.items->lines.stock_item_id::text->>'unit' IS DISTINCT FROM i.unit::text THEN NULL
    WHEN lines.item_line = 1 THEN (v_capture.items->lines.stock_item_id::text->>'quantity')::numeric
    ELSE 0 END
  FROM lines WHERE i.id = lines.id;
  UPDATE public.stock_counts SET staff_observation = true, capture_id = v_capture.id,
    captured_at = v_capture.captured_at, count_date = (v_capture.captured_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    WHERE id = v_count.id;

  IF v_reason IS NULL THEN
    RETURN v_result || jsonb_build_object('captured_at', v_capture.captured_at, 'capture_shift_id', v_capture.shift_id);
  END IF;

  UPDATE public.stock_counts SET status = 'REJECTED', rejection_reason = v_reason WHERE id = v_count.id;
  UPDATE public.approval_requests SET status = 'REJECTED', rejection_reason = v_reason, resolved_at = clock_timestamp()
    WHERE organization_id = v_count.organization_id AND entity_type = 'STOCK_TRANSFER'
      AND entity_id = v_count.id AND status = 'PENDING';
  INSERT INTO public.notifications (organization_id, recipient_id, type, title, message, link, entity_type, entity_id)
  VALUES (v_count.organization_id, v_actor, 'PENDING_APPROVAL', 'Kiraan stok perlu dikira semula',
    v_count.count_number || ': ' || v_reason || ' Kira semula / Hantar semula dalam SOP Stok POS.',
    '/pos', 'stock_count', v_count.id);
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  VALUES (v_count.organization_id, v_actor, 'STOCK_COUNT_RECOUNT_REQUIRED', 'stock_count', v_count.id,
    jsonb_build_object('location_id', v_count.location_id, 'captured_at', v_capture.captured_at,
      'submitted_at', v_count.created_at, 'reason', v_reason));
  RETURN v_result || jsonb_build_object('status', 'REJECTED', 'captured_at', v_capture.captured_at,
    'correction_required', true, 'rejection_reason', v_reason);
END;
$$;

CREATE FUNCTION public.submit_stock_count(p_location_id uuid, p_items jsonb, p_notes text, p_recount_of uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.submit_captured_stock_count(p_location_id, p_items, p_notes, p_recount_of, NULL::uuid);
$$;

-- Rebind both public signatures explicitly; the legacy client has no trusted
-- version, but its staff observation is still retained as recount evidence.
CREATE OR REPLACE FUNCTION public.submit_stock_count(p_location_id uuid, p_items jsonb, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.submit_captured_stock_count(p_location_id, p_items, p_notes, NULL::uuid, NULL::uuid);
$$;

REVOKE EXECUTE ON FUNCTION public.stock_count_approval_version(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.capture_pos_stock_count(uuid, uuid[]),
  public.submit_captured_stock_count(uuid, jsonb, text, uuid, uuid),
  public.submit_stock_count(uuid, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_pos_stock_count(uuid, uuid[]),
  public.submit_captured_stock_count(uuid, jsonb, text, uuid, uuid),
  public.submit_stock_count(uuid, jsonb, text, uuid) TO authenticated, service_role;

-- Only the POS server may bind an observation to a shift operation. A
-- correction status is independent of the fact that a physical count was
-- submitted for the current shift. No capture or wrong shift: evidence only.
CREATE FUNCTION public.record_verified_pos_staff_stock_check(
 p_actor uuid,p_device uuid,p_generation integer,p_branch uuid,p_location uuid,
 p_items jsonb,p_count_notes text,p_recount uuid,p_capture uuid,p_check_type text,
 p_production_date date,p_shift_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 v_staff public.profiles; v_capture public.pos_stock_count_captures; v_result jsonb; v_hash bytea;
 v_shift uuid; v_count uuid; v_existing_log uuid; v_now timestamptz:=clock_timestamp();
 v_before text:=current_setting('request.jwt.claim.sub',true);
BEGIN
 v_staff:=public.validate_pos_server_actor_device(p_actor,p_device,p_generation,p_branch);
 IF v_staff.role<>'STAFF' OR p_check_type IS NULL OR p_check_type NOT IN ('OPENING','MID_SHIFT','CLOSE_SHIFT')
  OR NOT EXISTS (SELECT 1 FROM public.inventory_locations l WHERE l.id=p_location AND l.branch_id=p_branch
   AND l.organization_id=v_staff.organization_id AND l.location_type='BRANCH_KIOSK' AND l.is_active) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Akses rekod stok syif ditolak';
 END IF;
 -- Inventory writers take shift before balance; retain that lock order.
 SELECT s.id INTO v_shift FROM public.pos_stock_count_captures c
 JOIN public.pos_shifts s ON s.id=c.shift_id AND s.branch_id=p_branch AND s.organization_id=v_staff.organization_id
 WHERE c.id=p_capture AND c.captured_by=p_actor AND c.location_id=p_location AND s.status='OPEN'
 FOR UPDATE OF s;
 SELECT * INTO v_capture FROM public.pos_stock_count_captures
 WHERE id=p_capture AND captured_by=p_actor AND location_id=p_location FOR UPDATE;
 v_hash:=sha256(convert_to(jsonb_build_array(p_items,p_count_notes,p_recount,p_check_type,p_production_date,p_shift_notes)::text,'UTF8'));
 IF v_capture.pos_result IS NOT NULL THEN
  IF v_hash IS DISTINCT FROM v_capture.pos_request_hash THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Snapshot sudah dihantar dengan butiran berbeza';
  END IF;
  RETURN v_capture.pos_result;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 v_result:=public.submit_captured_stock_count(p_location,p_items,p_count_notes,p_recount,p_capture);
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_before,''),true);
 v_count:=(v_result->>'count_id')::uuid;
 IF v_shift IS NOT NULL AND v_count IS NOT NULL AND (p_recount IS NULL OR p_check_type='OPENING')
   AND NOT EXISTS(SELECT 1 FROM public.stock_count_items i WHERE i.count_id=v_count
    AND v_capture.items->i.stock_item_id::text->>'unit' IS DISTINCT FROM i.unit::text) AND
   (p_check_type<>'OPENING' OR NOT EXISTS(
    SELECT 1 FROM public.pos_stock_receipts WHERE branch_id=p_branch AND organization_id=v_staff.organization_id
     AND status IN ('DRIVER_DROPPED','DISCREPANCY_PENDING_APPROVAL')
   )) THEN
  INSERT INTO public.pos_shift_stock_check_logs(organization_id,branch_id,shift_id,stock_count_id,check_type,
   production_date,notes,completed_by,completed_at)
  VALUES(v_staff.organization_id,p_branch,v_shift,v_count,p_check_type,
   coalesce(p_production_date,(v_now AT TIME ZONE 'Asia/Kuala_Lumpur')::date),p_shift_notes,p_actor,v_now)
  ON CONFLICT(shift_id,check_type) DO NOTHING;
  SELECT id INTO v_existing_log FROM public.pos_shift_stock_check_logs WHERE shift_id=v_shift AND check_type=p_check_type;
  IF p_check_type='OPENING' AND v_existing_log IS NOT NULL THEN
   UPDATE public.pos_shifts SET business_started_at=coalesce(business_started_at,v_now),
    payroll_started_at=coalesce(payroll_started_at,business_started_at,v_now) WHERE id=v_shift;
  END IF;
 END IF;
 v_result:=v_result||jsonb_build_object('shift_check_recorded',v_existing_log IS NOT NULL);
 IF v_capture.id IS NOT NULL THEN
  UPDATE public.pos_stock_count_captures SET pos_request_hash=v_hash,pos_result=v_result WHERE id=v_capture.id;
 END IF;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_verified_pos_staff_stock_check(uuid,uuid,integer,uuid,uuid,jsonb,text,uuid,uuid,text,date,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_pos_staff_stock_check(uuid,uuid,integer,uuid,uuid,jsonb,text,uuid,uuid,text,date,text)
 TO service_role;
CREATE POLICY staff_shift_checks_via_pos_only_insert ON public.pos_shift_stock_check_logs
 AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.user_role())<>'STAFF');
CREATE POLICY staff_shift_checks_via_pos_only_update ON public.pos_shift_stock_check_logs
 AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.user_role())<>'STAFF') WITH CHECK ((SELECT public.user_role())<>'STAFF');
CREATE POLICY staff_shift_checks_via_pos_only_delete ON public.pos_shift_stock_check_logs
 AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.user_role())<>'STAFF');

CREATE OR REPLACE FUNCTION public.review_stock_count(p_count_id uuid, p_action text, p_reason text DEFAULT NULL)
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
  v_capture_items jsonb;
  v_staff_observation boolean;
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

  -- Existing pending POS/staff rows have no capture provenance. Leave the
  -- original in place for an explicit rejection/recount, not retroactive dating.
  v_staff_observation := coalesce(v_count.staff_observation,
    v_loc.location_type = 'BRANCH_KIOSK' AND (
      v_count.notes ~ '^POS_(OPENING|MID_SHIFT|CLOSE_SHIFT|RECOUNT)( |$)'
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_count.counted_by AND role = 'STAFF')
    ), false);
  IF p_action = 'APPROVE' THEN
    IF v_staff_observation THEN
      SELECT items INTO v_capture_items FROM public.pos_stock_count_captures
      WHERE id = v_count.capture_id AND location_id = v_loc.id AND captured_by = v_count.counted_by
        AND captured_at = v_count.captured_at;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tiada snapshot kiraan yang sah. Tolak dan minta staf kira semula.' USING ERRCODE = '40001';
      END IF;
    END IF;

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
      IF v_staff_observation AND (
        v_capture_items->v_line.stock_item_id::text->>'unit' IS DISTINCT FROM v_line.base_unit::text
        OR public.stock_count_approval_version(v_loc.id, v_line.stock_item_id)
          IS DISTINCT FROM (v_capture_items->v_line.stock_item_id::text->>'approval_version')::bigint
      ) THEN
        RAISE EXCEPTION 'Snapshot kiraan lapuk. Tolak dan minta staf kira semula.' USING ERRCODE = '40001';
      END IF;
      -- Do not stack two independent physical corrections for the same item.
      -- The lock also prevents a fresh submission from missing this decision.
      IF EXISTS (
        SELECT 1 FROM public.stock_counts newer JOIN public.stock_count_items i ON i.count_id = newer.id
        WHERE newer.location_id = v_loc.id AND newer.organization_id = v_count.organization_id
          AND newer.status IN ('PENDING', 'APPROVED')
          AND newer.id <> v_count.id
          AND (coalesce(newer.captured_at, newer.created_at), newer.id) >
            (coalesce(v_count.captured_at, v_count.created_at), v_count.id)
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
      'counted_at', CASE WHEN v_staff_observation THEN v_count.captured_at ELSE v_count.created_at END,
      'submitted_at', v_count.created_at, 'capture_id', v_count.capture_id,
      'resolved_at', v_resolved_at, 'reason', v_reason, 'items', v_audit));
  RETURN jsonb_build_object('count_id', p_count_id,
    'status', CASE WHEN p_action = 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END);
END;
$$;
