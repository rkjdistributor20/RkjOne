-- Close the operational shift independently of reviewable QR. Existing sale,
-- stock, receipt, cash and provider state are not rewritten.
SET LOCAL lock_timeout = '5s';

-- Create the existing manual review atomically with its sale, so the close
-- snapshot cannot miss a QR row because the second API write was delayed.
CREATE OR REPLACE FUNCTION public.process_pos_manual_qr_sale(
  p_actor_id uuid, p_device_id uuid, p_enrollment_generation integer,
  p_shift_id uuid, p_branch_id uuid, p_sale jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_org uuid;
  v_before_subject text := current_setting('request.jwt.claim.sub',true);
  v_result jsonb;
  v_tx public.pos_transactions%ROWTYPE;
  v_review public.pos_online_payments%ROWTYPE;
  v_ref text;
BEGIN
  SELECT organization_id INTO STRICT v_org FROM public.profiles WHERE id=p_actor_id AND status='ACTIVE';
  PERFORM id FROM public.pos_devices WHERE id=p_device_id AND organization_id=v_org AND branch_id=p_branch_id
    AND status='ACTIVE' AND enrollment_generation=p_enrollment_generation
    AND asset_verified_at IS NOT NULL AND asset_verified_by IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tablet POS rasmi diperlukan'; END IF;
  IF coalesce(p_sale->>'payment_method','') NOT IN ('QR','MIXED')
    OR coalesce(p_sale->>'qr_amount','') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Butiran QR manual tidak sah';
  END IF;
  IF (p_sale->>'qr_amount')::numeric<=0 THEN RAISE EXCEPTION 'Amaun QR manual mesti positif'; END IF;
  v_ref := nullif(btrim(coalesce(p_sale->>'manual_fiuu_transaction_id','')),'');
  IF v_ref IS NOT NULL AND v_ref !~ '^[0-9]{6,30}$' THEN RAISE EXCEPTION 'ID transaksi Fiuu tidak sah'; END IF;

  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_result := public.process_pos_sale(p_shift_id,p_branch_id,p_sale->'items',
    (p_sale->>'payment_method')::public.payment_method,(p_sale->>'cash_amount')::numeric,
    (p_sale->>'qr_amount')::numeric,coalesce((p_sale->>'discount')::numeric,0),
    p_sale->>'offline_id',p_sale->>'receipt_email',p_sale->>'receipt_phone');
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_before_subject,''),true);
  PERFORM id FROM public.pos_shifts WHERE id=p_shift_id AND organization_id=v_org AND branch_id=p_branch_id FOR UPDATE;

  -- Normal and replayed sale paths must bind to the same exact transaction.
  SELECT * INTO STRICT v_tx FROM public.pos_transactions WHERE id=(v_result->>'transaction_id')::uuid
    AND organization_id=v_org AND branch_id=p_branch_id AND shift_id=p_shift_id
    AND status='COMPLETED' AND qr_amount=(p_sale->>'qr_amount')::numeric FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.pos_online_payments WHERE transaction_id=v_tx.id AND provider<>'manual_qr') THEN
    RAISE EXCEPTION 'Jualan ini sudah dipautkan kepada saluran pembayaran lain';
  END IF;
  SELECT * INTO v_review FROM public.pos_online_payments WHERE transaction_id=v_tx.id AND provider='manual_qr';
  IF NOT FOUND THEN
    -- New sales take the shift lock in process_pos_sale. Refuse old replays
    -- that lack a review on a closed shift instead of changing its snapshot.
    IF NOT EXISTS (SELECT 1 FROM public.pos_shifts WHERE id=p_shift_id AND status='OPEN') THEN
      RAISE EXCEPTION 'Syif asal sudah ditutup; semakan sedia ada diperlukan';
    END IF;
    INSERT INTO public.pos_online_payments(organization_id,branch_id,shift_id,amount_rm,status,provider,gateway_ref,
      sale_payload,transaction_id,created_by)
    VALUES(v_org,p_branch_id,p_shift_id,v_tx.qr_amount,'PENDING','manual_qr','MANUAL-'||v_tx.transaction_number,
      (p_sale-'manual_fiuu_transaction_id') || jsonb_build_object('manual_verification_required',true,
        'manual_verification_source','POS_QR_MANUAL','transaction_number',v_tx.transaction_number,
        'manual_fiuu_reference_candidate',v_ref),v_tx.id,v_tx.created_by)
    RETURNING * INTO v_review;
  ELSIF v_ref IS NOT NULL AND v_review.sale_payload->>'manual_fiuu_reference_candidate' IS DISTINCT FROM v_ref THEN
    RAISE EXCEPTION 'Percubaan semula mempunyai rujukan Fiuu yang berbeza';
  END IF;
  RETURN jsonb_build_object('result',v_result,'manual_payment_review',jsonb_build_object('id',v_review.id,'status',v_review.status));
END;
$$;
REVOKE ALL ON FUNCTION public.process_pos_manual_qr_sale(uuid,uuid,integer,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_manual_qr_sale(uuid,uuid,integer,uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_pos_shift_close_pending_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_allowed boolean;
  v_review_ids uuid[] := ARRAY[]::uuid[];
  v_review_amount numeric := 0;
  v_unconfirmed_manual_qr numeric := 0;
  v_manual_review_count integer := 0;
BEGIN
  IF OLD.status <> 'OPEN' OR NEW.status <> 'CLOSED' THEN RETURN NEW; END IF;

  v_allowed := NEW.actual_work_ended_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pos_fiuu_vt_shift_closures closure
    WHERE closure.shift_id=OLD.id AND closure.branch_id=OLD.branch_id
      AND closure.organization_id=OLD.organization_id
      AND closure.close_snapshot->>'close_intent_xid'=txid_current()::text
  );

  IF v_allowed THEN
    -- Manual HQ review only writes the payment row. VT callbacks may write
    -- that row before checking the shift, so never take VT row locks here.
    PERFORM p.id FROM public.pos_online_payments p
    WHERE p.organization_id=OLD.organization_id AND p.branch_id=OLD.branch_id AND p.shift_id=OLD.id
      AND p.provider='manual_qr' ORDER BY p.id FOR UPDATE;

    SELECT coalesce(array_agg(p.id ORDER BY p.id),ARRAY[]::uuid[]),coalesce(sum(p.amount_rm),0),
      count(*) FILTER (WHERE p.provider='manual_qr')
    INTO v_review_ids,v_review_amount,v_manual_review_count
    FROM public.pos_online_payments p
    WHERE p.organization_id=OLD.organization_id AND p.branch_id=OLD.branch_id AND p.shift_id=OLD.id
      AND (
        (p.provider='manual_qr' AND p.status IN ('PENDING','REPORTED','QUARANTINED')
          AND p.paid_at IS NULL AND p.amount_rm>0 AND EXISTS (
            SELECT 1 FROM public.pos_transactions tx
            WHERE tx.id=p.transaction_id AND tx.organization_id=p.organization_id
              AND tx.branch_id=p.branch_id AND tx.shift_id=p.shift_id
              AND tx.status='COMPLETED' AND tx.payment_method IN ('QR','MIXED') AND tx.qr_amount=p.amount_rm
          ))
        OR (p.provider='fiuu_vt' AND p.sale_payload->>'payment_method'='QR'
          AND p.sale_payload->>'cash_amount' IN ('0','0.0','0.00')
          AND p.transaction_id IS NULL AND p.paid_at IS NULL
          AND ((p.status='QUARANTINED' AND p.fiuu_vt_review_required)
            OR (p.status IN ('PENDING','REPORTED') AND p.fiuu_vt_cashier_released_at IS NOT NULL))
          AND NOT EXISTS (
            SELECT 1 FROM public.pos_fiuu_vt_attempts a WHERE a.payment_id=p.id AND a.op_type='SALE'
              AND ((a.state IN ('PREPARED','LAUNCHED') AND coalesce(a.launch_lease_expires_at,a.expires_at)>clock_timestamp())
                   OR (a.processing_lease_token IS NOT NULL AND a.processing_lease_expires_at>clock_timestamp()))
          ))
      );

    -- Manual QR merchandise is already booked and any cash component is in
    -- total_cash. Remove only the unconfirmed QR component from collected sums.
    -- EXISTS prevents duplicate historical rows from double-subtracting a sale.
    SELECT coalesce(sum(tx.qr_amount),0) INTO v_unconfirmed_manual_qr
    FROM public.pos_transactions tx
    WHERE tx.organization_id=OLD.organization_id AND tx.branch_id=OLD.branch_id AND tx.shift_id=OLD.id
      AND tx.status='COMPLETED' AND tx.payment_method IN ('QR','MIXED') AND tx.qr_amount>0
      AND EXISTS (
        SELECT 1 FROM public.pos_online_payments p WHERE p.transaction_id=tx.id
          AND p.organization_id=tx.organization_id AND p.branch_id=tx.branch_id AND p.shift_id=tx.shift_id
          AND p.provider='manual_qr' AND p.amount_rm=tx.qr_amount AND (p.status<>'PAID' OR p.paid_at IS NULL)
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pos_online_payments p
    WHERE p.organization_id=OLD.organization_id AND p.branch_id=OLD.branch_id AND p.shift_id=OLD.id
      AND NOT (p.id=ANY(v_review_ids))
      AND (p.status='REPORTED' OR (p.provider='fiuu' AND p.status='PENDING')
        OR (p.status='PENDING' AND coalesce(p.expires_at,'infinity'::timestamptz)>now())
        OR (p.provider IN ('fiuu','fiuu_vt','fiuu_cloudecr') AND p.status IN ('PENDING','EXPIRED')
          AND p.expires_at+interval '20 minutes'>now())
        OR (p.provider='fiuu_vt' AND p.status='QUARANTINED' AND p.fiuu_vt_review_required)
        OR (v_allowed AND p.provider='fiuu_vt' AND p.status='PENDING'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='check_violation',MESSAGE='POS shift cannot close while a Fiuu payment remains unresolved';
  END IF;

  IF v_allowed THEN
    UPDATE public.pos_fiuu_vt_shift_closures SET review_payment_ids=v_review_ids,
      close_snapshot=jsonb_build_object(
        'closed_at',NEW.closed_at,'closed_by',NEW.closed_by,'actual_work_ended_at',NEW.actual_work_ended_at,
        'opening_cash',OLD.opening_cash,'closing_cash',NEW.closing_cash,'expected_cash',NEW.expected_cash,'cash_variance',NEW.cash_variance,
        'confirmed_cash_sales',OLD.total_cash,'confirmed_qr_rm',greatest(0,OLD.total_qr-v_unconfirmed_manual_qr),
        'confirmed_sales_rm',greatest(0,OLD.total_sales-v_unconfirmed_manual_qr),'transaction_count',OLD.transaction_count,
        'qr_review_count',cardinality(v_review_ids),'qr_review_attempt_total_rm',v_review_amount,
        'manual_qr_review_count',v_manual_review_count,'manual_qr_unconfirmed_at_close_rm',v_unconfirmed_manual_qr,
        'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('member_id',m.id,'staff_id',m.staff_id,
          'profile_id',m.profile_id,'started_at',m.started_at,'ended_at',m.ended_at,'role',m.role_in_shift)
          ORDER BY m.started_at,m.id) FROM public.pos_shift_staff_members m WHERE m.shift_id=OLD.id AND m.status='ENDED'),'[]'::jsonb))
    WHERE shift_id=OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments() FROM PUBLIC, anon, authenticated;

-- Keep the established service-only close RPC and every cash/SOP/role check.
-- Only the confirmed QR amount returned to the cashier changes.
DO $close_result$
DECLARE
  v_fn regprocedure := 'public.close_pos_shift_with_qr_review(uuid,uuid,uuid,integer,numeric,timestamptz,text)'::regprocedure;
  v_before text := pg_get_functiondef(v_fn);
  v_after text;
BEGIN
  v_after := replace(v_before, $old$'confirmed_qr_rm', v_shift.total_qr,$old$,
    $new$'confirmed_qr_rm', COALESCE((v_snapshot->>'confirmed_qr_rm')::NUMERIC, v_shift.total_qr),$new$);
  IF v_before=v_after THEN RAISE EXCEPTION 'Unexpected POS close RPC definition'; END IF;
  EXECUTE v_after;
END;
$close_result$;

-- A late success can be verified in the background only with exact durable
-- STATUS evidence attached to the original registered-device callback. SALE,
-- email, timeout, a bare transaction ID and ambiguous replays are not proof.
CREATE OR REPLACE FUNCTION public.pos_fiuu_vt_status_is_verified(p_payment_id uuid,p_reference text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.pos_online_payments p
  JOIN public.pos_fiuu_vt_attempts a ON a.payment_id=p.id AND a.provider_order_id=p.provider_order_id
  WHERE p.id=p_payment_id AND p.provider='fiuu_vt'
    AND p.status='QUARANTINED' AND p.fiuu_vt_review_required AND p.fiuu_vt_reconciliation_state='LATE_SUCCESS_REVIEW'
    AND p.transaction_id IS NULL AND p.paid_at IS NULL AND p.provider_status_checked_at IS NOT NULL
    AND p.provider_transaction_id=p_reference AND p_reference ~ '^[A-Za-z0-9_-]{1,80}$'
    AND p.provider_result=a.result_json AND a.op_type='STATUS' AND a.state IN ('CONSUMED','QUARANTINED')
    AND a.result_fingerprint ~ '^[0-9a-f]{64}$' AND a.received_at IS NOT NULL
    AND a.result_json->>'callbackAttemptId'=a.id::text AND a.result_json->>'callbackHost'=a.callback_host
    AND a.result_json->>'opType'='STATUS' AND a.result_json->>'status'='00' AND NOT (a.result_json ? 'kind')
    AND a.result_json->>'orderId'=p.provider_order_id AND a.result_json->>'transactionId'=p_reference
    AND a.result_json->>'currency'='MYR' AND a.result_json->>'channel'='RPP_DuitNowQR-Offline'
    AND CASE WHEN coalesce(a.result_json->>'amountRm','') ~ '^[0-9]{1,10}([.][0-9]{1,2})?$'
       THEN (a.result_json->>'amountRm')::numeric=p.amount_rm ELSE false END
    AND NOT EXISTS (SELECT 1 FROM public.pos_trial_payment_markers t WHERE t.payment_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM public.pos_trial_shift_markers t WHERE t.shift_id=p.shift_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.pos_fiuu_vt_attempts x WHERE x.payment_id=p.id AND x.id<>a.id
      AND ((x.state IN ('PREPARED','LAUNCHED','RECEIVED') AND coalesce(x.processing_lease_expires_at,x.launch_lease_expires_at,x.expires_at)>now())
        OR (x.result_json->>'status'='00' AND (x.op_type='VOID' OR x.result_json->>'transactionId' IS DISTINCT FROM p_reference))
        OR (x.received_at>=a.received_at AND x.op_type='STATUS' AND x.result_json->>'status' IN ('11','33','44','45','55'))
        OR x.result_json ? 'replay')
    )
);
$$;
REVOKE ALL ON FUNCTION public.pos_fiuu_vt_status_is_verified(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Verify the provider independently of ledger posting. A historical cashier
-- could have accepted cash/manual QR for the basket while VT was pending.
-- Without durable cross-tender ownership, HQ must decide how to book it.
CREATE OR REPLACE FUNCTION public.reconcile_pos_fiuu_vt_review_status(p_branch_ids uuid[],p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE
  v_verified integer;
BEGIN
  IF coalesce(cardinality(p_branch_ids),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Branch scope required'; END IF;
  WITH due AS (
    SELECT p.id,p.provider_transaction_id FROM public.pos_online_payments p
    WHERE p.branch_id=ANY(p_branch_ids) AND p.provider='fiuu_vt' AND p.status='QUARANTINED'
      AND p.fiuu_vt_review_required AND p.fiuu_vt_reconciliation_state='LATE_SUCCESS_REVIEW'
      AND p.provider_result->>'opType'='STATUS' AND p.provider_result->>'status'='00'
      AND coalesce(p.fiuu_vt_review_evidence->'automaticStatusValidated'->>'providerTransactionId','')<>p.provider_transaction_id
      AND public.pos_fiuu_vt_status_is_verified(p.id,p.provider_transaction_id)
    ORDER BY p.provider_status_checked_at,p.id LIMIT least(greatest(coalesce(p_limit,20),1),25)
    FOR UPDATE SKIP LOCKED
  ), changed AS (
    UPDATE public.pos_online_payments p SET fiuu_vt_review_evidence=jsonb_set(
      coalesce(p.fiuu_vt_review_evidence,'{}'::jsonb),'{automaticStatusValidated}',
      jsonb_build_object('source','REGISTERED_VT_STATUS','providerTransactionId',p.provider_transaction_id,
        'verifiedAt',clock_timestamp(),'ledgerReviewReason','CROSS_TENDER_OWNERSHIP_NOT_ESTABLISHED'))
    FROM due WHERE p.id=due.id
      AND p.provider_transaction_id=due.provider_transaction_id
      AND p.status='QUARANTINED' AND p.fiuu_vt_review_required
    RETURNING p.id,p.organization_id,p.fiuu_vt_review_evidence->'automaticStatusValidated' AS evidence
  )
  INSERT INTO public.audit_logs (organization_id,user_id,action,entity_type,entity_id,new_values)
  SELECT organization_id,NULL,'FIUU_VT_STATUS_MATCHED','pos_online_payments',id,evidence FROM changed;
  GET DIAGNOSTICS v_verified=ROW_COUNT;
  RETURN jsonb_build_object('verified',v_verified);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_pos_fiuu_vt_review_status(uuid[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_pos_fiuu_vt_review_status(uuid[],integer) TO service_role;
