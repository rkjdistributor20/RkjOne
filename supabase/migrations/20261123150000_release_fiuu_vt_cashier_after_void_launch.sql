-- A Fiuu VOID launch is a request, not confirmation that a payment was
-- cancelled.  Persist that distinction while allowing the cashier lane to be
-- released after the exact VOID launch is durably recorded.  The original
-- payment intentionally remains PENDING so a late, exact STATUS=00 callback
-- can still be fulfilled against its original sale payload exactly once.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS fiuu_vt_cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_vt_cancel_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS fiuu_vt_cashier_released_at TIMESTAMPTZ;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_cancel_attempt_fkey;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_cancel_attempt_fkey
  FOREIGN KEY (fiuu_vt_cancel_attempt_id)
  REFERENCES public.pos_fiuu_vt_attempts(id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_cancel_attempt_fkey;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_cashier_release_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_cashier_release_check CHECK (
    fiuu_vt_cashier_released_at IS NULL
    OR (
      provider = 'fiuu_vt'
      AND fiuu_vt_cancel_requested_at IS NOT NULL
      AND fiuu_vt_cancel_attempt_id IS NOT NULL
      AND fiuu_vt_cashier_released_at >= fiuu_vt_cancel_requested_at
    )
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_cashier_release_check;

-- A released Fiuu VT payment remains auditable/recoverable, but is no longer
-- the checkout currently occupying the cashier or tablet lane. Other Fiuu
-- transports retain their existing one-active-payment guarantee.
DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_actor_shift;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_actor_shift
  ON public.pos_online_payments(organization_id, branch_id, shift_id, created_by)
  WHERE provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
    AND status IN ('PENDING', 'REPORTED')
    AND (provider <> 'fiuu_vt' OR fiuu_vt_cashier_released_at IS NULL);

DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_device;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_device
  ON public.pos_online_payments(
    organization_id,
    branch_id,
    shift_id,
    (sale_payload->>'fiuu_device_code')
  )
  WHERE provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND status IN ('PENDING', 'REPORTED')
    AND NULLIF(sale_payload->>'fiuu_device_code', '') IS NOT NULL
    AND (provider <> 'fiuu_vt' OR fiuu_vt_cashier_released_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_fiuu_vt_released_pending
  ON public.pos_online_payments(expires_at, id)
  WHERE provider = 'fiuu_vt'
    AND status IN ('PENDING', 'REPORTED')
    AND fiuu_vt_cashier_released_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.release_pos_fiuu_vt_cashier_lane(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_actor_id UUID,
  p_device_id UUID,
  p_enrollment_generation INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_payment_id IS NULL
    OR p_attempt_id IS NULL
    OR p_actor_id IS NULL
    OR p_device_id IS NULL
    OR p_enrollment_generation IS NULL
    OR p_enrollment_generation < 1 THEN
    RETURN jsonb_build_object('outcome', 'INVALID_REQUEST');
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- Use the same lock order as review and fulfilment: shift, then payment.
  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- A committed release must remain replay-safe even when its first HTTP
  -- response was lost, the cashier changed shift, the device enrollment was
  -- rotated, or a callback changed the payment in the meantime. The route
  -- still requires an authenticated official tablet for the same branch. The
  -- exact same VOID attempt may finish client cleanup; a different attempt
  -- can never inherit that release.
  IF v_payment.fiuu_vt_cashier_released_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome', CASE
        WHEN v_payment.fiuu_vt_cancel_attempt_id = p_attempt_id THEN 'RELEASED'
        ELSE 'ATTEMPT_CONFLICT'
      END,
      'payment_status', v_payment.status,
      'cancel_requested_at', v_payment.fiuu_vt_cancel_requested_at,
      'cashier_released_at', v_payment.fiuu_vt_cashier_released_at,
      'reused', v_payment.fiuu_vt_cancel_attempt_id = p_attempt_id
    );
  END IF;

  -- First-time release remains bound to the exact original cashier, official
  -- device and enrollment generation. Only the no-op replay above is relaxed.
  IF v_payment.created_by IS DISTINCT FROM p_actor_id
    OR v_payment.sale_payload->>'fiuu_device_id' IS DISTINCT FROM p_device_id::TEXT
    OR (CASE
      WHEN COALESCE(v_payment.sale_payload->>'fiuu_enrollment_generation', '') ~ '^[0-9]+$'
      THEN (v_payment.sale_payload->>'fiuu_enrollment_generation')::INTEGER
           IS DISTINCT FROM p_enrollment_generation
      ELSE true
    END) THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;

  -- Success evidence always wins the race with cancellation. A pending SALE
  -- callback is not success and may still be detached; an exact SALE/STATUS
  -- status 00, REPORTED or PAID result must continue through normal STATUS and
  -- fulfilment and may not release this cart yet.
  IF v_payment.status IN ('REPORTED', 'PAID')
    OR v_payment.paid_at IS NOT NULL
    OR v_payment.transaction_id IS NOT NULL
    OR (
      v_payment.provider_result IS NOT NULL
      AND jsonb_typeof(v_payment.provider_result) = 'object'
      AND v_payment.provider_result->>'opType' IN ('SALE', 'STATUS')
      AND v_payment.provider_result->>'status' = '00'
    )
    OR EXISTS (
      SELECT 1
      FROM public.pos_fiuu_vt_attempts success_attempt
      WHERE success_attempt.payment_id = v_payment.id
        AND success_attempt.op_type IN ('SALE', 'STATUS')
        AND success_attempt.result_json->>'status' = '00'
    ) THEN
    RETURN jsonb_build_object(
      'outcome', 'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED',
      'payment_status', v_payment.status
    );
  END IF;

  IF v_payment.status IN ('FAILED', 'EXPIRED', 'CANCELLED') THEN
    RETURN jsonb_build_object(
      'outcome', 'TERMINAL',
      'payment_status', v_payment.status
    );
  END IF;
  IF v_payment.status = 'QUARANTINED' OR v_payment.fiuu_vt_review_required THEN
    RETURN jsonb_build_object(
      'outcome', 'REVIEW_REQUIRED',
      'payment_status', v_payment.status
    );
  END IF;
  IF v_payment.status <> 'PENDING' THEN
    RETURN jsonb_build_object(
      'outcome', 'STATUS_CHANGED',
      'payment_status', v_payment.status
    );
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = v_payment.id
    AND op_type = 'VOID'
  FOR UPDATE;

  IF NOT FOUND
    OR v_attempt.state NOT IN ('LAUNCHED', 'CONSUMED')
    OR v_attempt.launched_at IS NULL
    OR v_attempt.abandoned_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'VOID_NOT_DURABLY_LAUNCHED');
  END IF;

  -- RECEIVED is intentionally excluded above: a callback currently being
  -- processed must win before native state or the customer cart is released.
  UPDATE public.pos_online_payments
  SET fiuu_vt_cancel_requested_at = v_now,
      fiuu_vt_cancel_attempt_id = v_attempt.id,
      fiuu_vt_cashier_released_at = v_now,
      updated_at = v_now
  WHERE id = v_payment.id
    AND provider = 'fiuu_vt'
    AND status = 'PENDING'
    AND fiuu_vt_review_required = false
    AND fiuu_vt_cashier_released_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'STATUS_CHANGED');
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    v_payment.organization_id,
    p_actor_id,
    'FIUU_VT_CANCEL_REQUESTED_CASHIER_RELEASED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object(
      'status', v_payment.status,
      'cashierReleased', false
    ),
    jsonb_build_object(
      'status', 'PENDING',
      'cancelRequested', true,
      'cashierReleased', true,
      'providerCancellationConfirmed', false,
      'attemptId', v_attempt.id,
      'recordedAt', v_now
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'RELEASED',
    'payment_status', 'PENDING',
    'cancel_requested_at', v_now,
    'cashier_released_at', v_now,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_pos_fiuu_vt_cashier_lane(
  UUID, UUID, UUID, UUID, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_pos_fiuu_vt_cashier_lane(
  UUID, UUID, UUID, UUID, INTEGER
) TO service_role;

-- Return the payment release snapshot obtained under the same shift/payment/
-- attempt locks as the callback claim. A success claim writes the exact result
-- to the attempt before those locks are released, so a concurrent cashier-
-- release request sees success evidence and must fail closed.
CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_result_fingerprint TEXT,
  p_result_json JSONB,
  p_processing_token UUID,
  p_allow_expired BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_duration CONSTANT INTERVAL := interval '30 seconds';
  v_retry_after_ms INTEGER := 0;
  v_payment_snapshot JSONB;
BEGIN
  IF p_payment_id IS NULL
    OR p_attempt_id IS NULL
    OR p_processing_token IS NULL
    OR COALESCE(p_result_fingerprint, '') !~ '^[a-f0-9]{64}$'
    OR p_result_json IS NULL
    OR jsonb_typeof(p_result_json) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback processing claim';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  v_payment_snapshot := jsonb_build_object(
    'payment_status', v_payment.status,
    'cashier_released_at', v_payment.fiuu_vt_cashier_released_at
  );

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND') || v_payment_snapshot;
  END IF;

  IF v_attempt.state IN ('CONSUMED', 'QUARANTINED') THEN
    IF v_attempt.result_fingerprint IS NOT DISTINCT FROM p_result_fingerprint THEN
      RETURN jsonb_build_object('outcome', 'CONSUMED') || v_payment_snapshot;
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'CONFLICT',
      'existing_result', v_attempt.result_json
    ) || v_payment_snapshot;
  END IF;

  IF v_attempt.state = 'RECEIVED' THEN
    IF v_attempt.result_fingerprint IS DISTINCT FROM p_result_fingerprint THEN
      RETURN jsonb_build_object(
        'outcome', 'CONFLICT',
        'existing_result', v_attempt.result_json
      ) || v_payment_snapshot;
    END IF;

    IF v_attempt.processing_lease_token IS NOT NULL
      AND v_attempt.processing_lease_expires_at > v_now THEN
      v_retry_after_ms := GREATEST(
        0,
        LEAST(
          30000,
          ceil(extract(epoch FROM (v_attempt.processing_lease_expires_at - v_now)) * 1000)::INTEGER
        )
      );
      RETURN jsonb_build_object(
        'outcome', 'ACTIVE',
        'retry_after_ms', v_retry_after_ms,
        'processing_generation', v_attempt.processing_lease_generation
      ) || v_payment_snapshot;
    END IF;

    UPDATE public.pos_fiuu_vt_attempts
    SET processing_lease_token = p_processing_token,
        processing_lease_expires_at = v_now + v_lease_duration,
        processing_lease_generation = processing_lease_generation + 1,
        result_json = COALESCE(result_json, p_result_json),
        updated_at = v_now
    WHERE id = v_attempt.id
      AND state = 'RECEIVED'
      AND result_fingerprint = p_result_fingerprint
    RETURNING * INTO v_attempt;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fiuu VT callback processing lease changed concurrently';
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'CLAIMED',
      'resumed', true,
      'processing_generation', v_attempt.processing_lease_generation,
      'lease_expires_at', v_attempt.processing_lease_expires_at
    ) || v_payment_snapshot;
  END IF;

  IF v_attempt.state IN ('PREPARED', 'LAUNCHED')
    OR (v_attempt.state = 'EXPIRED' AND p_allow_expired) THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'RECEIVED',
        result_fingerprint = p_result_fingerprint,
        result_json = p_result_json,
        received_at = COALESCE(received_at, v_now),
        processing_lease_token = p_processing_token,
        processing_lease_expires_at = v_now + v_lease_duration,
        processing_lease_generation = processing_lease_generation + 1,
        updated_at = v_now
    WHERE id = v_attempt.id
      AND payment_id = p_payment_id
      AND (
        state IN ('PREPARED', 'LAUNCHED')
        OR (state = 'EXPIRED' AND p_allow_expired)
      )
    RETURNING * INTO v_attempt;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fiuu VT callback claim changed concurrently';
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'CLAIMED',
      'resumed', false,
      'processing_generation', v_attempt.processing_lease_generation,
      'lease_expires_at', v_attempt.processing_lease_expires_at
    ) || v_payment_snapshot;
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'INELIGIBLE',
    'attempt_state', v_attempt.state
  ) || v_payment_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, JSONB, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, JSONB, UUID, BOOLEAN
) TO service_role;

COMMENT ON COLUMN public.pos_online_payments.fiuu_vt_cancel_requested_at IS
  'Time RKJ durably recorded a launched Fiuu VOID request; not provider cancellation confirmation.';
COMMENT ON COLUMN public.pos_online_payments.fiuu_vt_cashier_released_at IS
  'Time the original PENDING Fiuu VT payment stopped occupying the cashier lane while remaining eligible for exact late-success recovery.';

-- A review raised by a callback for an already released payment belongs only
-- to that original order. The ordinary review RPC deliberately links a still
-- active device checkout to protect an unresolved cashier lane; doing that
-- after this lane was explicitly released would quarantine the next customer.
CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_released_review(
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
  v_now TIMESTAMPTZ := clock_timestamp();
  v_status TEXT;
  v_event JSONB;
BEGIN
  IF p_state NOT IN (
    'LATE_SUCCESS_REVIEW',
    'REVERSAL_REVIEW',
    'FOREIGN_CALLBACK_REVIEW',
    'PROVIDER_ERROR_REVIEW'
  ) THEN
    RAISE EXCEPTION 'Invalid released Fiuu VT review state';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'Released Fiuu VT review evidence must be an object';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Released Fiuu VT payment not found';
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Released Fiuu VT POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.fiuu_vt_cashier_released_at IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT payment is not a released cashier payment';
  END IF;

  v_event := p_evidence || jsonb_build_object(
    'eventType', p_state,
    'cashierReleasedAt', v_payment.fiuu_vt_cashier_released_at,
    'sourcePaymentId', v_payment.id,
    'relatedActiveCheckoutChanged', false,
    'recordedAt', v_now
  );

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
  RETURNING status INTO v_status;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_payment.organization_id,
    v_payment.created_by,
    'FIUU_VT_RELEASED_PAYMENT_REVIEWED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object(
      'status', v_status,
      'reviewState', p_state,
      'relatedActiveCheckoutChanged', false
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_status', v_status,
    'related_payments', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_released_review(
  UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_released_review(
  UUID, TEXT, JSONB
) TO service_role;

-- Choose review scope only after acquiring the same shift/payment locks used
-- by cashier release. A TypeScript snapshot can become stale between its read
-- and this write; making the decision here prevents a callback for the old
-- order from quarantining the next customer's active checkout.
CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review_status_aware(
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
BEGIN
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
    RAISE EXCEPTION 'Fiuu VT payment changed during status-aware review';
  END IF;

  IF v_payment.fiuu_vt_cashier_released_at IS NOT NULL THEN
    RETURN public.mark_pos_fiuu_vt_released_review(
      p_payment_id,
      p_state,
      p_evidence
    );
  END IF;

  RETURN public.mark_pos_fiuu_vt_review(
    p_payment_id,
    p_state,
    p_evidence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware(
  UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware(
  UUID, TEXT, JSONB
) TO service_role;

-- Quarantine the exact callback attempt, lock the original payment for review,
-- and (when supplied) preserve exact provider success evidence in one database
-- transaction. This closes the crash window where an attempt could become
-- QUARANTINED before its payment received the corresponding Finance/HQ lock.
CREATE OR REPLACE FUNCTION public.quarantine_pos_fiuu_vt_callback_review(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_result_fingerprint TEXT,
  p_result_json JSONB,
  p_state TEXT,
  p_evidence JSONB,
  p_provider_transaction_id TEXT,
  p_provider_result JSONB,
  p_provider_sale_reported_at TIMESTAMPTZ,
  p_provider_status_checked_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_review JSONB;
BEGIN
  IF p_payment_id IS NULL
    OR p_attempt_id IS NULL
    OR p_result_fingerprint IS NULL
    OR p_result_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_result_json IS NULL
    OR jsonb_typeof(p_result_json) <> 'object'
    OR p_state IS NULL
    OR p_evidence IS NULL
    OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback quarantine request';
  END IF;
  IF p_state NOT IN (
    'LATE_SUCCESS_REVIEW',
    'REVERSAL_REVIEW',
    'FOREIGN_CALLBACK_REVIEW',
    'PROVIDER_ERROR_REVIEW'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback review state';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT callback payment not found';
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT callback shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RAISE EXCEPTION 'Fiuu VT callback payment changed';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = v_payment.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT callback attempt not found';
  END IF;

  -- The attempt row is the immutable identity anchor for a native callback.
  -- Once one fingerprint has been accepted, a concurrent or later callback
  -- may add payment review evidence but must never replace that first
  -- fingerprint/result pair.  This makes the RPC replay-safe even when two
  -- HTTP requests passed their route-level read before either obtained this
  -- database lock.
  IF v_attempt.state = 'QUARANTINED'
    AND v_attempt.result_fingerprint IS NOT DISTINCT FROM p_result_fingerprint THEN
    RETURN jsonb_build_object(
      'outcome', 'QUARANTINED_FOR_REVIEW',
      'attempt_id', v_attempt.id,
      'payment_status', v_payment.status,
      'reused', true
    );
  END IF;

  IF p_provider_result IS NOT NULL THEN
    IF jsonb_typeof(p_provider_result) <> 'object'
      OR p_provider_result->>'kind' = 'ERROR'
      OR COALESCE(p_provider_result->>'opType', '') NOT IN ('SALE', 'STATUS')
      OR p_provider_result->>'status' IS DISTINCT FROM '00'
      OR p_provider_result->>'orderId' IS DISTINCT FROM v_payment.provider_order_id
      OR COALESCE(p_provider_transaction_id, '') = ''
      OR p_provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
      OR COALESCE(p_provider_result->>'currency', '') <> 'MYR'
      OR NOT (CASE
        WHEN COALESCE(p_provider_result->>'amountRm', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
        THEN round((p_provider_result->>'amountRm')::NUMERIC, 2)
          = round(v_payment.amount_rm, 2)
        ELSE false
      END)
      OR (
        v_payment.provider_transaction_id IS NOT NULL
        AND v_payment.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id
      ) THEN
      RAISE EXCEPTION 'Fiuu VT provider success evidence does not match payment';
    END IF;
  ELSIF p_provider_transaction_id IS NOT NULL
    OR p_provider_sale_reported_at IS NOT NULL
    OR p_provider_status_checked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Fiuu VT provider timestamps require exact success evidence';
  END IF;

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      result_fingerprint = COALESCE(result_fingerprint, p_result_fingerprint),
      result_json = COALESCE(result_json, p_result_json),
      received_at = COALESCE(received_at, v_now),
      quarantined_at = COALESCE(quarantined_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE id = v_attempt.id
    AND payment_id = v_payment.id;

  v_review := public.mark_pos_fiuu_vt_review_status_aware(
    v_payment.id,
    p_state,
    p_evidence
  );

  IF p_provider_result IS NOT NULL THEN
    UPDATE public.pos_online_payments
    SET provider_transaction_id = COALESCE(
          provider_transaction_id,
          p_provider_transaction_id
        ),
        provider_result = p_provider_result,
        provider_sale_reported_at = CASE
          WHEN p_provider_sale_reported_at IS NOT NULL
          THEN COALESCE(provider_sale_reported_at, p_provider_sale_reported_at)
          ELSE provider_sale_reported_at
        END,
        provider_status_checked_at = CASE
          WHEN p_provider_status_checked_at IS NOT NULL
          THEN COALESCE(provider_status_checked_at, p_provider_status_checked_at)
          ELSE provider_status_checked_at
        END,
        updated_at = v_now
    WHERE id = v_payment.id
      AND provider = 'fiuu_vt';
  END IF;

  RETURN COALESCE(v_review, '{}'::JSONB) || jsonb_build_object(
    'outcome', 'QUARANTINED_FOR_REVIEW',
    'attempt_id', v_attempt.id,
    'reused', false,
    'fingerprint_conflict', v_attempt.result_fingerprint IS NOT NULL
      AND v_attempt.result_fingerprint IS DISTINCT FROM p_result_fingerprint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_pos_fiuu_vt_callback_review(
  UUID, UUID, TEXT, JSONB, TEXT, JSONB, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_pos_fiuu_vt_callback_review(
  UUID, UUID, TEXT, JSONB, TEXT, JSONB, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

-- The cashier lane is released immediately, but the payment cannot remain
-- PENDING forever if Fiuu never returns a callback. After the existing
-- 20-minute late-callback grace, move only the original order to Finance/HQ
-- review. A later exact success is still accepted as evidence against this
-- order and can never be attached to the next customer's checkout.
CREATE OR REPLACE FUNCTION public.quarantine_pos_fiuu_vt_released_timeout(
  p_payment_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_deadline TIMESTAMPTZ;
  v_event JSONB;
  v_success_evidence JSONB;
  v_review_state TEXT := 'PROVIDER_ERROR_REVIEW';
  v_recovery_error TEXT := 'CASHIER_RELEASED_CALLBACK_TIMEOUT';
BEGIN
  IF p_payment_id IS NULL OR p_expected_updated_at IS NULL THEN
    RETURN jsonb_build_object('outcome', 'INVALID_REQUEST');
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  IF v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_cashier_released_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'QUARANTINED',
      'payment_status', v_payment.status,
      'reused', true
    );
  END IF;

  v_deadline := COALESCE(
    v_payment.expires_at,
    v_payment.created_at + INTERVAL '15 minutes'
  ) + INTERVAL '20 minutes';

  IF v_payment.updated_at IS DISTINCT FROM p_expected_updated_at
    OR v_payment.status <> 'PENDING'
    OR v_payment.fiuu_vt_review_required
    OR v_payment.fiuu_vt_cashier_released_at IS NULL THEN
    RETURN jsonb_build_object('outcome', 'STATUS_CHANGED');
  END IF;
  IF v_deadline > v_now THEN
    RETURN jsonb_build_object('outcome', 'TOO_EARLY', 'retry_at', v_deadline);
  END IF;

  PERFORM attempt.id
  FROM public.pos_fiuu_vt_attempts AS attempt
  WHERE attempt.payment_id = v_payment.id
  ORDER BY attempt.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.state = 'RECEIVED'
      AND attempt.processing_lease_token IS NOT NULL
      AND attempt.processing_lease_expires_at > v_now
  ) THEN
    RETURN jsonb_build_object('outcome', 'CALLBACK_ACTIVE');
  END IF;

  IF v_payment.provider_result IS NOT NULL
    AND jsonb_typeof(v_payment.provider_result) = 'object'
    AND v_payment.provider_result->>'kind' IS DISTINCT FROM 'ERROR'
    AND v_payment.provider_result->>'opType' IN ('SALE', 'STATUS')
    AND v_payment.provider_result->>'status' = '00'
    AND v_payment.provider_result->>'orderId' = v_payment.provider_order_id
    AND COALESCE(v_payment.provider_result->>'transactionId', '') <> ''
    AND COALESCE(v_payment.provider_result->>'currency', '') = 'MYR'
    AND (CASE
      WHEN COALESCE(v_payment.provider_result->>'amountRm', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
      THEN round((v_payment.provider_result->>'amountRm')::NUMERIC, 2)
        = round(v_payment.amount_rm, 2)
      ELSE false
    END) THEN
    v_success_evidence := v_payment.provider_result;
  ELSE
    SELECT attempt.result_json INTO v_success_evidence
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.op_type IN ('SALE', 'STATUS')
      AND attempt.provider_order_id = v_payment.provider_order_id
      AND attempt.result_json IS NOT NULL
      AND jsonb_typeof(attempt.result_json) = 'object'
      AND attempt.result_json->>'kind' IS DISTINCT FROM 'ERROR'
      AND attempt.result_json->>'opType' IN ('SALE', 'STATUS')
      AND attempt.result_json->>'status' = '00'
      AND attempt.result_json->>'orderId' = v_payment.provider_order_id
      AND COALESCE(attempt.result_json->>'transactionId', '') <> ''
      AND COALESCE(attempt.result_json->>'currency', '') = 'MYR'
      AND (CASE
        WHEN COALESCE(attempt.result_json->>'amountRm', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
        THEN round((attempt.result_json->>'amountRm')::NUMERIC, 2)
          = round(v_payment.amount_rm, 2)
        ELSE false
      END)
    ORDER BY COALESCE(attempt.received_at, attempt.updated_at) DESC, attempt.id DESC
    LIMIT 1;
  END IF;

  -- A worker/process crash can occur after the one-time callback claim stores
  -- exact success in attempt.result_json but before the payment row is updated.
  -- Never leave that evidence as a no-op SUCCESS_EVIDENCE outcome: preserve it
  -- on the original released order and require Finance/HQ resolution.
  IF v_success_evidence IS NOT NULL THEN
    v_review_state := 'LATE_SUCCESS_REVIEW';
    v_recovery_error := 'CASHIER_RELEASED_LATE_SUCCESS';
  END IF;

  v_event := jsonb_build_object(
    'eventType', CASE
      WHEN v_success_evidence IS NOT NULL THEN 'CASHIER_RELEASED_LATE_SUCCESS'
      ELSE 'CASHIER_RELEASED_CALLBACK_TIMEOUT'
    END,
    'cashierReleasedAt', v_payment.fiuu_vt_cashier_released_at,
    'cancelRequestedAt', v_payment.fiuu_vt_cancel_requested_at,
    'cancelAttemptId', v_payment.fiuu_vt_cancel_attempt_id,
    'providerCancellationConfirmed', false,
    'expiredAt', v_payment.expires_at,
    'graceDeadline', v_deadline,
    'quarantinedAt', v_now,
    'resolutionAuthority', 'FINANCE_HQ',
    'providerSuccessEvidence', v_success_evidence
  );

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      result_json = COALESCE(result_json, v_event),
      quarantined_at = COALESCE(quarantined_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED', 'EXPIRED');

  UPDATE public.pos_online_payments
  SET status = 'QUARANTINED',
      failed_at = NULL,
      provider_transaction_id = CASE
        WHEN v_success_evidence IS NOT NULL
        THEN COALESCE(provider_transaction_id, v_success_evidence->>'transactionId')
        ELSE provider_transaction_id
      END,
      provider_result = COALESCE(v_success_evidence, provider_result),
      provider_sale_reported_at = CASE
        WHEN v_success_evidence IS NOT NULL
        THEN COALESCE(provider_sale_reported_at, v_now)
        ELSE provider_sale_reported_at
      END,
      provider_status_checked_at = CASE
        WHEN v_success_evidence->>'opType' = 'STATUS'
        THEN COALESCE(provider_status_checked_at, v_now)
        ELSE provider_status_checked_at
      END,
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = v_review_state,
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        fiuu_vt_review_evidence,
        v_event
      ),
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = v_recovery_error,
      updated_at = v_now
  WHERE id = v_payment.id
    AND status = 'PENDING'
    AND updated_at = p_expected_updated_at
    AND fiuu_vt_cashier_released_at IS NOT NULL
    AND fiuu_vt_review_required = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'STATUS_CHANGED');
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_payment.organization_id,
    v_payment.created_by,
    CASE
      WHEN v_success_evidence IS NOT NULL
      THEN 'FIUU_VT_CASHIER_RELEASE_LATE_SUCCESS_QUARANTINED'
      ELSE 'FIUU_VT_CASHIER_RELEASE_TIMEOUT_QUARANTINED'
    END,
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object(
      'status', v_payment.status,
      'cashierReleasedAt', v_payment.fiuu_vt_cashier_released_at
    ),
    jsonb_build_object(
      'status', 'QUARANTINED',
      'reviewState', v_review_state,
      'providerSuccessEvidencePreserved', v_success_evidence IS NOT NULL,
      'providerCancellationConfirmed', false,
      'relatedActiveCheckoutChanged', false
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'QUARANTINED',
    'payment_status', 'QUARANTINED',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_pos_fiuu_vt_released_timeout(
  UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_pos_fiuu_vt_released_timeout(
  UUID, TIMESTAMPTZ
) TO service_role;
