-- Serialize late-callback review and sale fulfilment on the same shift lock.
-- This closes the final race where a replacement payment could become PAID
-- while an older Fiuu VT callback was being quarantined for the same cashier
-- or tablet.  Review evidence is also propagated to a replacement that has
-- already completed so Finance never loses the double-payment warning.

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
BEGIN
  IF p_state NOT IN (
    'LATE_SUCCESS_REVIEW',
    'REVERSAL_REVIEW',
    'FOREIGN_CALLBACK_REVIEW'
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

  -- Keep the same lock order as fulfilment: shift first, payment second.
  -- The shift row is the serialization boundary for every related checkout.
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

  v_device_code := NULLIF(v_payment.sale_payload->>'fiuu_device_code', '');

  UPDATE public.pos_online_payments
  SET fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = p_evidence,
      updated_at = v_now
  WHERE id = v_payment.id;

  -- An unresolved replacement in the same cashier/device lane must stop until
  -- HQ reviews the late callback.  Active rows remain deliberately broad: a
  -- cashier may already have started the next customer with a different cart.
  UPDATE public.pos_online_payments candidate
  SET fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = jsonb_build_object(
        'reason', 'RELATED_ACTIVE_PAYMENT_AT_REVIEW',
        'sourcePaymentId', v_payment.id,
        'observedAt', v_now,
        'sourceEvidence', p_evidence
      ),
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

  -- A completed replacement is marked only when it is the nearest later sale
  -- with the same amount and immutable sale intent.  The shared shift lock
  -- makes this selection and update atomic with both VT fulfilment paths.
  -- This avoids attaching a late callback to every unrelated PAID transaction
  -- performed by the cashier during the shift.
  SELECT candidate.id INTO v_paid_replacement_id
  FROM public.pos_online_payments candidate
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
    UPDATE public.pos_online_payments candidate
    SET fiuu_vt_review_required = true,
        fiuu_vt_reconciliation_state = p_state,
        fiuu_vt_review_evidence = jsonb_build_object(
          'reason', 'RELATED_PAID_PAYMENT_AT_REVIEW',
          'sourcePaymentId', v_payment.id,
          'observedAt', v_now,
          'sourceEvidence', p_evidence
        ),
        updated_at = v_now
    WHERE candidate.id = v_paid_replacement_id;

    v_related_count := v_related_count + 1;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'related_payments', v_related_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_vt_payment(
  p_payment_id UUID,
  p_provider_order_id TEXT,
  p_provider_transaction_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel TEXT,
  p_provider_result JSONB,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_device_code TEXT;
  v_related_review_count INTEGER := 0;
  v_result JSONB;
  v_existing_receipt JSONB;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT POS payment not found';
  END IF;

  -- Shared serialization boundary with mark_pos_fiuu_vt_review().
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
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_vt' THEN
    RAISE EXCEPTION 'Fiuu VT POS payment not found';
  END IF;

  -- A completed sale remains idempotent even when a later callback marks it
  -- for Finance review.  Preserve the review flag, but never turn a receipt
  -- replay into a cashier-facing failure after stock and sale committed.
  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    SELECT receipt_data INTO v_existing_receipt
    FROM public.pos_receipts
    WHERE transaction_id = v_payment.transaction_id;
    RETURN COALESCE(
      v_existing_receipt,
      jsonb_build_object('transaction_id', v_payment.transaction_id)
    );
  END IF;

  IF v_payment.fiuu_vt_review_required THEN
    RAISE EXCEPTION 'Fiuu VT POS payment requires reconciliation review';
  END IF;

  v_device_code := NULLIF(v_payment.sale_payload->>'fiuu_device_code', '');
  SELECT count(*) INTO v_related_review_count
  FROM public.pos_online_payments related
  WHERE related.id <> v_payment.id
    AND related.organization_id = v_payment.organization_id
    AND related.branch_id = v_payment.branch_id
    AND related.shift_id = v_payment.shift_id
    AND related.provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND related.fiuu_vt_review_required
    -- Historical PAID rows retain their Finance warning, but must not block a
    -- later customer.  Only an active replacement in this checkout lane is a
    -- fulfilment interlock.
    AND related.status IN ('PENDING', 'REPORTED')
    AND (
      related.created_by IS NOT DISTINCT FROM v_payment.created_by
      OR (
        v_device_code IS NOT NULL
        AND NULLIF(related.sale_payload->>'fiuu_device_code', '') = v_device_code
      )
    );

  IF v_related_review_count > 0 THEN
    RAISE EXCEPTION 'A related Fiuu VT payment requires reconciliation review';
  END IF;

  IF COALESCE(p_provider_order_id, '') !~ '^RKJ_[A-F0-9]{32}$'
    OR p_provider_order_id IS DISTINCT FROM v_payment.provider_order_id THEN
    RAISE EXCEPTION 'Fiuu VT order reference mismatch';
  END IF;

  IF COALESCE(p_provider_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' THEN
    RAISE EXCEPTION 'Fiuu VT transaction reference is invalid';
  END IF;

  IF v_payment.provider_transaction_id IS NOT NULL
    AND p_provider_transaction_id IS DISTINCT FROM v_payment.provider_transaction_id THEN
    RAISE EXCEPTION 'Fiuu VT transaction reference mismatch';
  END IF;

  IF v_payment.provider_sale_reported_at IS NULL
    OR v_payment.provider_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT SALE result is required before STATUS confirmation';
  END IF;

  IF p_confirmed_by IS NULL OR p_confirmed_by IS DISTINCT FROM v_payment.created_by THEN
    RAISE EXCEPTION 'Fiuu VT confirmer does not own the payment intent';
  END IF;

  IF round(v_payment.amount_rm, 2) <> round(p_amount, 2)
    OR upper(COALESCE(p_currency, '')) <> 'MYR'
    OR COALESCE(p_channel, '') <> 'RPP_DuitNowQR-Offline' THEN
    RAISE EXCEPTION 'Fiuu VT payment details mismatch';
  END IF;

  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) <> 'object'
    OR p_provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR p_provider_result->>'status' IS DISTINCT FROM '00'
    OR p_provider_result->>'orderId' IS DISTINCT FROM p_provider_order_id
    OR p_provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
    OR p_provider_result->>'currency' IS DISTINCT FROM 'MYR'
    OR p_provider_result->>'channel' IS DISTINCT FROM 'RPP_DuitNowQR-Offline'
    OR COALESCE(p_provider_result->>'amountRm', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((p_provider_result->>'amountRm')::NUMERIC, 2) <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Fiuu VT STATUS result is not fulfillable';
  END IF;

  IF v_payment.provider_status_checked_at IS NULL
    OR v_payment.provider_result IS NULL
    OR jsonb_typeof(v_payment.provider_result) <> 'object'
    OR v_payment.provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR v_payment.provider_result->>'status' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'orderId' IS DISTINCT FROM p_provider_order_id
    OR v_payment.provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
    OR v_payment.provider_result->>'currency' IS DISTINCT FROM 'MYR'
    OR v_payment.provider_result->>'channel' IS DISTINCT FROM 'RPP_DuitNowQR-Offline'
    OR COALESCE(v_payment.provider_result->>'amountRm', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((v_payment.provider_result->>'amountRm')::NUMERIC, 2) <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Stored Fiuu VT STATUS is not successful';
  END IF;

  IF v_payment.status <> 'REPORTED' THEN
    RAISE EXCEPTION 'Fiuu VT POS payment is not fulfillable';
  END IF;

  v_result := public.process_pos_sale_internal(
    v_payment.created_by,
    v_payment.shift_id,
    v_payment.branch_id,
    v_payment.sale_payload->'items',
    (v_payment.sale_payload->>'payment_method')::payment_method,
    COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0),
    COALESCE((v_payment.sale_payload->>'qr_amount')::NUMERIC, 0),
    COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0),
    NULLIF(v_payment.sale_payload->>'offline_id', ''),
    NULLIF(v_payment.sale_payload->>'receipt_email', ''),
    NULLIF(v_payment.sale_payload->>'receipt_phone', '')
  );

  UPDATE public.pos_online_payments
  SET status = 'PAID',
      provider_transaction_id = p_provider_transaction_id,
      provider_result = p_provider_result,
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      provider_confirmed_by = p_confirmed_by,
      gateway_ref = p_provider_transaction_id,
      transaction_id = (v_result->>'transaction_id')::UUID,
      paid_at = now(),
      failed_at = NULL,
      fiuu_vt_review_evidence = NULL,
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_vt_payment(
  UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_vt_payment(
  UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID
) TO service_role;

-- cloudECR fulfilment predates the review interlock.  Its sale and payment
-- update execute in one transaction, so rejecting the REPORTED -> PAID update
-- also rolls back process_pos_sale_internal() (sale, receipt and stock).  The
-- cloudECR function already takes the same shift lock before its payment lock;
-- this trigger is the final serialized guard and cannot be bypassed by its
-- existing function body.
CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_cloudecr_review_fulfillment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.provider = 'fiuu_cloudecr'
    AND NEW.provider = 'fiuu_cloudecr'
    AND NEW.status = 'PAID'
    AND OLD.status IS DISTINCT FROM 'PAID'
    AND (
      COALESCE(OLD.fiuu_vt_review_required, false)
      OR COALESCE(NEW.fiuu_vt_review_required, false)
    ) THEN
    RAISE EXCEPTION 'Fiuu cloudECR payment requires reconciliation review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pos_fiuu_cloudecr_review_fulfillment
  ON public.pos_online_payments;
CREATE TRIGGER guard_pos_fiuu_cloudecr_review_fulfillment
BEFORE UPDATE OF status, fiuu_vt_review_required
ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_cloudecr_review_fulfillment();

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_cloudecr_review_fulfillment()
  FROM PUBLIC, anon, authenticated;
