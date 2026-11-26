-- Administrative archive of the one positively identified BR001 trial shift.
-- No end-of-work time or counted cash is invented. Preserve the original
-- shift on all sales, stock, receipts and payments, including late Finance
-- posting. The normal close guard is restored within this same transaction.
SET LOCAL lock_timeout = '5s';

DO $archive$
DECLARE
  v_org constant uuid := '4c6a2501-151c-42b3-b63f-41ccfca29420';
  v_branch constant uuid := '88f37555-4326-4ace-963f-f5645bb60985';
  v_id constant uuid := '1bce9981-6361-4a2b-a722-3dcfe940df26';
  v_trigger constant regprocedure := 'public.guard_pos_shift_close_pending_payments()'::regprocedure;
  v_trigger_md5 constant text := '75fdecfc4cb2f0327ec7bfb2438b83ad';
  v_review_ids constant uuid[] := ARRAY[
    '01d615e3-a4a4-46fd-b2d3-0fb1b8e3008c',
    'bcba67c4-818e-4f52-b7f7-ff5b0a22e75f',
    'faffcfd5-8ab0-41b7-8c67-59b0394c8440',
    'a2a12651-6095-4d07-8095-1353406b3f64'
  ]::uuid[];
  v_shift public.pos_shifts%ROWTYPE;
  v_closed public.pos_fiuu_vt_shift_closures%ROWTYPE;
  v_original text;
  v_modified text;
  v_at timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RETURN; -- never apply the production data action to a different tenant
  END IF;

  SELECT s.* INTO STRICT v_shift
  FROM public.pos_shifts s
  JOIN public.pos_trial_shift_markers marked ON marked.shift_id = s.id
  JOIN public.branches b ON b.id = s.branch_id AND b.organization_id = s.organization_id
  WHERE (s.id,s.organization_id,s.branch_id) = (v_id,v_org,v_branch)
    AND b.branch_code = 'BR001' AND s.shift_number = 'SH-20261125-0001'
  FOR UPDATE OF s;
  IF v_shift.status <> 'OPEN' OR v_shift.actual_work_ended_at IS NOT NULL
    OR v_shift.closed_at IS NOT NULL OR v_shift.closed_by IS NOT NULL
    OR v_shift.closing_cash IS NOT NULL OR v_shift.expected_cash IS NOT NULL
    OR v_shift.cash_variance IS NOT NULL OR v_shift.transaction_count <> 3
    OR v_shift.total_cash <> 0 OR v_shift.total_qr <> 7.50 OR v_shift.total_sales <> 7.50
    OR NOT EXISTS (SELECT 1 FROM public.pos_fiuu_vt_shift_close_rollout WHERE branch_id = v_branch) THEN
    RAISE EXCEPTION 'BR001 trial shift differs from the verified archive preimage';
  END IF;

  -- Serialize with callback/fulfilment in the same shift -> payment -> attempt
  -- order. Never close over in-flight or unclassified activity.
  PERFORM p.id FROM public.pos_online_payments p WHERE p.shift_id = v_id ORDER BY p.id FOR UPDATE;
  PERFORM a.id FROM public.pos_fiuu_vt_attempts a
  JOIN public.pos_online_payments p ON p.id = a.payment_id
  WHERE p.shift_id = v_id ORDER BY a.id FOR UPDATE OF a;
  IF (SELECT count(*) FROM public.pos_transactions WHERE shift_id = v_id) <> 3
    OR EXISTS (
      SELECT 1 FROM public.pos_transactions t
      LEFT JOIN public.pos_trial_sale_markers m ON m.transaction_id=t.id
      WHERE t.shift_id=v_id AND (m.transaction_id IS NULL OR t.status <> 'COMPLETED'
        OR (t.organization_id,t.branch_id) IS DISTINCT FROM (v_org,v_branch))
    )
    OR (SELECT count(*) FROM public.pos_online_payments WHERE shift_id = v_id) <> 7
    OR EXISTS (
      SELECT 1 FROM public.pos_online_payments p
      LEFT JOIN public.pos_trial_payment_markers m ON m.payment_id=p.id
      WHERE p.shift_id=v_id AND (
        m.payment_id IS NULL OR p.provider <> 'fiuu_vt'
        OR (p.organization_id,p.branch_id) IS DISTINCT FROM (v_org,v_branch)
        OR p.sale_payload->>'payment_method' IS DISTINCT FROM 'QR'
        OR COALESCE(p.sale_payload->>'cash_amount','') NOT IN ('0','0.0','0.00')
        OR (p.id = ANY(v_review_ids) AND (p.status <> 'QUARANTINED'
          OR NOT p.fiuu_vt_review_required OR p.transaction_id IS NOT NULL OR p.paid_at IS NOT NULL))
        OR (NOT (p.id = ANY(v_review_ids)) AND (p.status <> 'PAID'
          OR p.fiuu_vt_review_required OR p.transaction_id IS NULL OR p.paid_at IS NULL))
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.pos_fiuu_vt_attempts a
      JOIN public.pos_online_payments p ON p.id = a.payment_id
      WHERE p.shift_id=v_id AND (
        a.state = 'RECEIVED'
        OR (a.state IN ('PREPARED','LAUNCHED') AND
            COALESCE(a.launch_lease_expires_at,a.expires_at) > clock_timestamp())
        OR a.processing_lease_expires_at > clock_timestamp()
      )
    ) THEN
    RAISE EXCEPTION 'BR001 archive blocked by unclassified sale/payment or live callback';
  END IF;

  v_original := pg_get_functiondef(v_trigger);
  IF md5(v_original) IS DISTINCT FROM v_trigger_md5 THEN
    RAISE EXCEPTION 'Shift close guard changed; administrative archive not attempted';
  END IF;
  -- The usual stock/payroll close path is not used for a trial, but still
  -- reuse the real payment guard and closure snapshot in this transaction.
  v_modified := replace(v_original,
    'v_allowed := NEW.actual_work_ended_at IS NOT NULL AND EXISTS (',
    format($guard$v_allowed := (NEW.actual_work_ended_at IS NOT NULL OR (
      NEW.id = %L::uuid AND NEW.actual_work_ended_at IS NULL
      AND NEW.closing_cash IS NULL AND NEW.expected_cash IS NULL AND NEW.cash_variance IS NULL
    )) AND EXISTS ($guard$,v_id));
  IF v_modified = v_original THEN
    RAISE EXCEPTION 'Administrative archive did not match the guarded close preimage';
  END IF;
  EXECUTE v_modified;
  INSERT INTO public.pos_fiuu_vt_shift_closures
    (shift_id,organization_id,branch_id,review_payment_ids,close_snapshot)
  VALUES (v_id,v_org,v_branch,ARRAY[]::uuid[],jsonb_build_object('close_intent_xid',txid_current()::text));
  v_at := clock_timestamp();
  UPDATE public.pos_shifts SET status = 'CLOSED', closed_at = v_at WHERE id=v_id;
  EXECUTE v_original;
  IF md5(pg_get_functiondef(v_trigger)) IS DISTINCT FROM v_trigger_md5 THEN
    RAISE EXCEPTION 'Ordinary close guard was not restored';
  END IF;

  SELECT * INTO STRICT v_closed FROM public.pos_fiuu_vt_shift_closures WHERE shift_id=v_id;
  IF cardinality(v_closed.review_payment_ids) <> 4
    OR NOT (v_closed.review_payment_ids @> v_review_ids)
    OR COALESCE(v_closed.close_snapshot ? 'actual_work_ended_at',false) IS NOT TRUE
    OR v_closed.close_snapshot->>'actual_work_ended_at' IS NOT NULL
    OR v_closed.close_snapshot->>'closing_cash' IS NOT NULL THEN
    RAISE EXCEPTION 'Trial archive did not preserve all original QR review links and unverified counts';
  END IF;
  UPDATE public.pos_fiuu_vt_shift_closures
  SET close_snapshot = close_snapshot || jsonb_build_object(
    'closure_kind','TRIAL_ARCHIVE','administrative_archived_at',v_at)
  WHERE shift_id=v_id;

  INSERT INTO public.audit_logs(organization_id,action,entity_type,entity_id,old_values,new_values)
  VALUES (v_org,'POS_TRIAL_SHIFT_ARCHIVED','pos_shifts',v_id,
    jsonb_build_object('status','OPEN','shift_number',v_shift.shift_number),
    jsonb_build_object('status','CLOSED','shift_number',v_shift.shift_number,
      'reason','VERIFIED_TRIAL_BEFORE_FIRST_LIVE_OPERATION','administrative_archived_at',v_at,
      'closing_cash_verified',false,'actual_work_ended_at_recorded',false,
      'review_payment_count',cardinality(v_closed.review_payment_ids)));
END;
$archive$;
