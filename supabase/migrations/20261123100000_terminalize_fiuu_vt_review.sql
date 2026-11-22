-- A durable Finance/HQ review lock must also be terminal for any unresolved
-- PENDING/REPORTED checkout. Otherwise the WebView can acknowledge the exact
-- quarantined callback while the native pending order remains permanently
-- ineligible for reviewed release.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review(
  p_payment_id UUID,
  p_state TEXT,
  p_evidence JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_related_count INTEGER := 0;
  v_paid_replacement_id UUID;
  v_device_code TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event JSONB;
  v_payment_status TEXT;
BEGIN
  IF p_state NOT IN (
    'LATE_SUCCESS_REVIEW',
    'REVERSAL_REVIEW',
    'FOREIGN_CALLBACK_REVIEW',
    'PROVIDER_ERROR_REVIEW'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT review state';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'Fiuu VT review evidence must be an object';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RAISE EXCEPTION 'Fiuu VT payment changed during review';
  END IF;

  v_event := p_evidence || jsonb_build_object(
    'eventType', p_state,
    'recordedAt', v_now
  );
  v_device_code := NULLIF(v_payment.sale_payload->>'fiuu_device_code', '');

  UPDATE public.pos_online_payments
  SET status = CASE
        WHEN status IN ('PENDING', 'REPORTED') THEN 'QUARANTINED'
        ELSE status
      END,
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        fiuu_vt_review_evidence,
        v_event
      ),
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = v_now
  WHERE id = v_payment.id
  RETURNING status INTO v_payment_status;

  UPDATE public.pos_online_payments AS candidate
  SET status = 'QUARANTINED',
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        candidate.fiuu_vt_review_evidence,
        jsonb_build_object(
          'eventType', 'RELATED_ACTIVE_PAYMENT_AT_REVIEW',
          'sourcePaymentId', v_payment.id,
          'observedAt', v_now,
          'sourceEvidence', p_evidence
        )
      ),
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = v_now
  WHERE candidate.id <> v_payment.id
    AND candidate.organization_id = v_payment.organization_id
    AND candidate.branch_id = v_payment.branch_id
    AND candidate.shift_id = v_payment.shift_id
    AND candidate.provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND candidate.status IN ('PENDING', 'REPORTED')
    AND (
      candidate.created_by IS NOT DISTINCT FROM v_payment.created_by
      OR (
        v_device_code IS NOT NULL
        AND NULLIF(candidate.sale_payload->>'fiuu_device_code', '') = v_device_code
      )
    );
  GET DIAGNOSTICS v_related_count = ROW_COUNT;

  SELECT candidate.id INTO v_paid_replacement_id
  FROM public.pos_online_payments AS candidate
  WHERE candidate.id <> v_payment.id
    AND candidate.organization_id = v_payment.organization_id
    AND candidate.branch_id = v_payment.branch_id
    AND candidate.shift_id = v_payment.shift_id
    AND candidate.provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND candidate.status = 'PAID'
    AND candidate.created_at > v_payment.created_at
    AND candidate.created_at <= COALESCE(
      v_payment.expires_at + INTERVAL '20 minutes',
      v_payment.created_at + INTERVAL '40 minutes'
    )
    AND round(candidate.amount_rm, 2) = round(v_payment.amount_rm, 2)
    AND candidate.sale_payload->'items'
      IS NOT DISTINCT FROM v_payment.sale_payload->'items'
    AND candidate.sale_payload->'pricing_snapshot'
      IS NOT DISTINCT FROM v_payment.sale_payload->'pricing_snapshot'
    AND candidate.sale_payload->'payment_method'
      IS NOT DISTINCT FROM v_payment.sale_payload->'payment_method'
    AND candidate.sale_payload->'cash_amount'
      IS NOT DISTINCT FROM v_payment.sale_payload->'cash_amount'
    AND candidate.sale_payload->'qr_amount'
      IS NOT DISTINCT FROM v_payment.sale_payload->'qr_amount'
    AND candidate.sale_payload->'discount'
      IS NOT DISTINCT FROM v_payment.sale_payload->'discount'
    AND (
      candidate.created_by IS NOT DISTINCT FROM v_payment.created_by
      OR (
        v_device_code IS NOT NULL
        AND NULLIF(candidate.sale_payload->>'fiuu_device_code', '') = v_device_code
      )
    )
  ORDER BY candidate.created_at ASC, candidate.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_paid_replacement_id IS NOT NULL THEN
    UPDATE public.pos_online_payments AS candidate
    SET fiuu_vt_review_required = true,
        fiuu_vt_reconciliation_state = p_state,
        fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
          candidate.fiuu_vt_review_evidence,
          jsonb_build_object(
            'eventType', 'RELATED_PAID_PAYMENT_AT_REVIEW',
            'sourcePaymentId', v_payment.id,
            'observedAt', v_now,
            'sourceEvidence', p_evidence
          )
        ),
        updated_at = v_now
    WHERE candidate.id = v_paid_replacement_id;

    v_related_count := v_related_count + 1;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_status', v_payment_status,
    'related_payments', v_related_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  TO service_role;

-- Repair rows created by the older function before this migration. PAID and
-- other terminal business states are intentionally preserved; only unresolved
-- active checkouts become terminal review records.
UPDATE public.pos_online_payments
SET status = 'QUARANTINED',
    fiuu_vt_recovery_next_at = NULL,
    fiuu_vt_recovery_last_error = NULL,
    updated_at = clock_timestamp()
WHERE provider IN ('fiuu_vt', 'fiuu_cloudecr')
  AND fiuu_vt_review_required = true
  AND status IN ('PENDING', 'REPORTED');
