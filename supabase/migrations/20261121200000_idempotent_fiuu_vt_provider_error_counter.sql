-- Make the repeated-provider-error counter idempotent across an exact callback
-- replay. The route may resume a RECEIVED processing lease after a server
-- interruption; the same one-time callback must not increment the threshold.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

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
