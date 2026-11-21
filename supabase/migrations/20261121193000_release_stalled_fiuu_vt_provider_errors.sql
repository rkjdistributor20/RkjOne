-- Release a cashier from a Fiuu VT transaction only after the QR has expired
-- and the provider has returned the same STATUS error repeatedly.  This is a
-- local cashier-lane release, not a claim that Fiuu cancelled the payment.
-- The closed payment stays in the HQ review queue so a late success can be
-- reconciled without duplicating a receipt, sale or stock movement.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS fiuu_vt_provider_error_code TEXT,
  ADD COLUMN IF NOT EXISTS fiuu_vt_provider_error_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiuu_vt_provider_error_at TIMESTAMPTZ;

UPDATE public.pos_online_payments
SET fiuu_vt_provider_error_count = 0
WHERE fiuu_vt_provider_error_count IS NULL;

ALTER TABLE public.pos_online_payments
  ALTER COLUMN fiuu_vt_provider_error_count SET DEFAULT 0,
  ALTER COLUMN fiuu_vt_provider_error_count SET NOT NULL;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_provider_error_count_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_provider_error_count_check CHECK (
    fiuu_vt_provider_error_count >= 0
    AND fiuu_vt_provider_error_count <= 100
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_provider_error_count_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_provider_error_code_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_provider_error_code_check CHECK (
    fiuu_vt_provider_error_code IS NULL
    OR fiuu_vt_provider_error_code ~ '^[A-Za-z0-9_-]{1,32}$'
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_provider_error_code_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_reconciliation_state_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_reconciliation_state_check CHECK (
    fiuu_vt_reconciliation_state IS NULL
    OR fiuu_vt_reconciliation_state IN (
      'LATE_SUCCESS_REVIEW',
      'REVERSAL_REVIEW',
      'FOREIGN_CALLBACK_REVIEW',
      'PROVIDER_ERROR_REVIEW'
    )
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_reconciliation_state_check;

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_fiuu_vt_provider_error_review
  ON public.pos_online_payments(organization_id, branch_id, updated_at DESC)
  WHERE provider = 'fiuu_vt'
    AND fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW';

CREATE OR REPLACE FUNCTION public.record_pos_fiuu_vt_provider_error(
  p_payment_id UUID,
  p_error_code TEXT,
  p_error_message TEXT,
  p_provider_result JSONB,
  p_observed_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.pos_online_payments%ROWTYPE;
  v_observed_at TIMESTAMPTZ := COALESCE(p_observed_at, clock_timestamp());
  v_error_count INTEGER;
  v_expired_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(p_error_code, '') !~ '^[A-Za-z0-9_-]{1,32}$' THEN
    RAISE EXCEPTION 'Invalid Fiuu VT provider error code';
  END IF;
  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) <> 'object'
    OR p_provider_result->>'kind' IS DISTINCT FROM 'ERROR'
    OR p_provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR p_provider_result->>'errorCode' IS DISTINCT FROM p_error_code THEN
    RAISE EXCEPTION 'Invalid Fiuu VT STATUS error evidence';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;
  IF v_payment.status <> 'PENDING' OR v_payment.fiuu_vt_review_required THEN
    RAISE EXCEPTION 'Fiuu VT payment is not eligible for provider error recovery';
  END IF;

  v_error_count := CASE
    -- A server crash after storing evidence but before consuming the callback
    -- may replay the exact same one-time attempt. Keep that replay idempotent
    -- so a transport retry can never manufacture the three-error threshold.
    WHEN v_payment.provider_result->>'callbackAttemptId'
        = p_provider_result->>'callbackAttemptId'
      AND v_payment.fiuu_vt_provider_error_code = p_error_code
    THEN v_payment.fiuu_vt_provider_error_count
    WHEN v_payment.fiuu_vt_provider_error_code = p_error_code
      AND v_payment.fiuu_vt_provider_error_at >= v_observed_at - INTERVAL '15 minutes'
    THEN LEAST(v_payment.fiuu_vt_provider_error_count + 1, 100)
    ELSE 1
  END;
  v_expired_at := COALESCE(v_payment.expires_at, v_payment.created_at + INTERVAL '15 minutes');

  UPDATE public.pos_online_payments
  SET provider_result = p_provider_result,
      provider_status_checked_at = v_observed_at,
      fiuu_vt_provider_error_code = p_error_code,
      fiuu_vt_provider_error_count = v_error_count,
      fiuu_vt_provider_error_at = v_observed_at,
      updated_at = v_observed_at
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'error_code', p_error_code,
    'error_count', v_error_count,
    'park_available', v_error_count >= 3 AND v_expired_at <= v_observed_at,
    'expires_at', v_expired_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_fiuu_vt_provider_error(
  UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pos_fiuu_vt_provider_error(
  UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ
) TO service_role;

CREATE OR REPLACE FUNCTION public.park_pos_fiuu_vt_provider_error(
  p_payment_id UUID,
  p_actor_id UUID
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
  v_expired_at TIMESTAMPTZ;
  v_evidence JSONB;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT park actor is required';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  -- Match the lock order used by fulfilment and late-callback review.
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
    RAISE EXCEPTION 'Fiuu VT payment changed during provider error recovery';
  END IF;

  IF v_payment.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Fiuu VT payment is not owned by this cashier';
  END IF;

  IF v_payment.status = 'CANCELLED'
    AND v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW' THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'review_state', v_payment.fiuu_vt_reconciliation_state,
      'reused', true
    );
  END IF;

  v_expired_at := COALESCE(v_payment.expires_at, v_payment.created_at + INTERVAL '15 minutes');
  IF v_payment.status <> 'PENDING'
    OR v_payment.fiuu_vt_review_required
    OR v_payment.transaction_id IS NOT NULL
    OR v_payment.paid_at IS NOT NULL
    OR v_payment.fiuu_vt_provider_error_count < 3
    OR v_payment.fiuu_vt_provider_error_code IS NULL
    OR v_payment.fiuu_vt_provider_error_at IS NULL
    OR v_payment.fiuu_vt_provider_error_at < v_now - INTERVAL '15 minutes'
    OR v_expired_at > v_now
    OR v_payment.provider_result IS NULL
    OR jsonb_typeof(v_payment.provider_result) <> 'object'
    OR v_payment.provider_result->>'kind' IS DISTINCT FROM 'ERROR'
    OR v_payment.provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR v_payment.provider_result->>'errorCode'
      IS DISTINCT FROM v_payment.fiuu_vt_provider_error_code THEN
    RAISE EXCEPTION 'Fiuu VT payment is not eligible to be parked';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.op_type = 'STATUS'
      AND attempt.result_json->>'kind' IS DISTINCT FROM 'ERROR'
      AND attempt.result_json->>'status' = '00'
  ) THEN
    RAISE EXCEPTION 'Fiuu VT success evidence exists and cannot be parked';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.state = 'RECEIVED'
  ) THEN
    RAISE EXCEPTION 'A Fiuu VT callback is still being processed';
  END IF;

  v_evidence := jsonb_build_object(
    'reason', 'PROVIDER_STATUS_ERROR_PARKED',
    'actorId', p_actor_id,
    'parkedAt', v_now,
    'expiredAt', v_expired_at,
    'errorCode', v_payment.fiuu_vt_provider_error_code,
    'errorCount', v_payment.fiuu_vt_provider_error_count,
    'lastErrorAt', v_payment.fiuu_vt_provider_error_at,
    'providerResult', v_payment.provider_result
  );

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      result_json = COALESCE(result_json, v_evidence),
      quarantined_at = v_now,
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED');

  UPDATE public.pos_online_payments
  SET status = 'CANCELLED',
      failed_at = v_now,
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW',
      fiuu_vt_review_evidence = v_evidence,
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = v_now
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'CANCELLED',
    'review_state', 'PROVIDER_ERROR_REVIEW',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_provider_error(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.park_pos_fiuu_vt_provider_error(UUID, UUID)
  TO service_role;
