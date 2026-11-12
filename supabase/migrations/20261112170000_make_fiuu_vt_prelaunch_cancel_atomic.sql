-- Make the cashier release operation self-contained.  A lost PATCH response
-- must not leave a proven pre-launch failure stuck in PREPARED forever: the
-- same locked transaction now records ABANDONED and cancels the payment.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.cancel_pos_fiuu_vt_prelaunch(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_error_code TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_result JSONB;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT pre-launch actor is required';
  END IF;

  IF COALESCE(p_error_code, '') NOT IN (
    'INVALID_FIUU_REQUEST',
    'FIUU_ACTIVE_ATTEMPT_EXISTS',
    'FIUU_VT_BRIDGE_UNAVAILABLE',
    'FIUU_VT_BRIDGE_OUTDATED',
    'FIUU_VT_NOT_INSTALLED',
    'FIUU_VT_UNTRUSTED_INSTALL',
    'FIUU_VT_LAUNCH_IN_PROGRESS',
    'FIUU_VT_LAUNCH_FAILED',
    'FIUU_ATTEMPT_MISMATCH',
    'FIUU_RESULT_PENDING',
    'FIUU_VOID_IN_PROGRESS'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT pre-launch error code';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  IF v_payment.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Fiuu VT payment is not owned by this cashier';
  END IF;

  IF v_payment.status = 'CANCELLED'
    AND v_payment.provider_result->>'resolution' = 'PRELAUNCH_CANCELLED'
    AND v_payment.provider_result->>'attemptId' = p_attempt_id::TEXT
    AND v_payment.provider_result->>'errorCode' = p_error_code THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'reused', true
    );
  END IF;

  IF v_payment.status <> 'PENDING'
    OR v_payment.fiuu_vt_review_required
    OR v_payment.provider_transaction_id IS NOT NULL
    OR v_payment.provider_sale_reported_at IS NOT NULL
    OR v_payment.provider_status_checked_at IS NOT NULL
    OR v_payment.paid_at IS NOT NULL
    OR v_payment.transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Fiuu VT payment has provider evidence and cannot be released locally';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = v_payment.id
    AND op_type = 'SALE'
  FOR UPDATE;

  IF NOT FOUND
    OR v_attempt.state NOT IN ('PREPARED', 'ABANDONED')
    OR (v_attempt.launch_error_code IS NOT NULL
        AND v_attempt.launch_error_code IS DISTINCT FROM p_error_code)
    OR v_attempt.launched_at IS NOT NULL
    OR v_attempt.received_at IS NOT NULL
    OR v_attempt.result_fingerprint IS NOT NULL
    OR v_attempt.result_json IS NOT NULL THEN
    RAISE EXCEPTION 'Fiuu VT SALE was not proven to have failed before launch';
  END IF;

  IF v_attempt.state = 'PREPARED' THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'ABANDONED',
        abandoned_at = v_now,
        launch_error_code = p_error_code,
        updated_at = v_now
    WHERE id = v_attempt.id;
  END IF;

  -- This check runs after the transition but in the same transaction.  Any
  -- competing operation aborts the whole transaction, including ABANDONED.
  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts other_attempt
    WHERE other_attempt.payment_id = v_payment.id
      AND other_attempt.id <> v_attempt.id
      AND other_attempt.state <> 'ABANDONED'
  ) THEN
    RAISE EXCEPTION 'Fiuu VT payment has another operation requiring reconciliation';
  END IF;

  v_result := jsonb_build_object(
    'resolution', 'PRELAUNCH_CANCELLED',
    'attemptId', p_attempt_id,
    'errorCode', p_error_code,
    'actorId', p_actor_id,
    'cancelledAt', v_now
  );

  UPDATE public.pos_online_payments
  SET status = 'CANCELLED',
      failed_at = v_now,
      provider_result = v_result,
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = v_now
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'CANCELLED',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pos_fiuu_vt_prelaunch(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pos_fiuu_vt_prelaunch(UUID, UUID, TEXT, UUID)
  TO service_role;
