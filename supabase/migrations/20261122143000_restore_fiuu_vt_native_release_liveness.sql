-- Restore Fiuu VT native-release liveness without weakening payment safety.
-- A quarantined order may perform STATUS only; this migration replaces the
-- permanent three-attempt lifetime cap with a rolling, rate-limited window.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_review_status_lease(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_callback_host TEXT,
  p_lease_token UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.pos_online_payments%ROWTYPE;
  v_active public.pos_fiuu_vt_attempts%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_duration CONSTANT INTERVAL := interval '25 seconds';
  v_retry_after_ms INTEGER := 0;
  v_release_attempts INTEGER := 0;
  v_oldest_release_attempt_at TIMESTAMPTZ;
  v_attempt_json JSONB;
BEGIN
  IF p_actor_id IS NULL OR p_attempt_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT review STATUS identity is required';
  END IF;
  IF p_callback_host IS DISTINCT FROM (
    'a-' || replace(lower(p_attempt_id::TEXT), '-', '') || '.fiuu-vt.rkj.one'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback host';
  END IF;

  -- The payment row serializes repeated taps, focus events and callback races.
  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_vt' THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;
  -- Actor turnover is permitted only through the service-role route, which
  -- proves current branch access, an active branch shift, and the exact
  -- original official tablet/enrolment before invoking this RPC.
  IF v_payment.status <> 'QUARANTINED'
     OR NOT v_payment.fiuu_vt_review_required THEN
    RETURN jsonb_build_object('outcome', 'REVIEW_REQUIRED');
  END IF;

  -- Rotate a missing callback only after its bounded launch lease expires.
  -- RECEIVED is callback-owned and must never be reclaimed.
  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'EXPIRED',
      expired_at = COALESCE(expired_at, v_now),
      expires_at = LEAST(expires_at, v_now),
      launch_lease_expires_at = LEAST(
        COALESCE(launch_lease_expires_at, v_now),
        v_now
      ),
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND op_type IN ('STATUS', 'VOID')
    AND state IN ('PREPARED', 'LAUNCHED')
    AND launch_lease_expires_at <= v_now;

  SELECT * INTO v_active
  FROM public.pos_fiuu_vt_attempts
  WHERE payment_id = v_payment.id
    AND op_type IN ('STATUS', 'VOID')
    AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
  ORDER BY
    CASE state
      WHEN 'RECEIVED' THEN 0
      WHEN 'LAUNCHED' THEN 1
      ELSE 2
    END,
    CASE op_type WHEN 'VOID' THEN 0 ELSE 1 END,
    created_at DESC,
    id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_attempt_json := jsonb_build_object(
      'id', v_active.id,
      'callback_host', v_active.callback_host,
      'expires_at', v_active.expires_at,
      'op_type', v_active.op_type,
      'state', v_active.state,
      'lease_generation', v_active.launch_lease_generation,
      'lease_expires_at', v_active.launch_lease_expires_at
    );
    IF v_active.state = 'RECEIVED' THEN
      v_retry_after_ms := GREATEST(
        1000,
        LEAST(
          30000,
          COALESCE(
            ceil(extract(epoch FROM (v_active.processing_lease_expires_at - v_now)) * 1000)::INTEGER,
            1000
          )
        )
      );
    ELSIF v_active.launch_lease_expires_at > v_now THEN
      v_retry_after_ms := GREATEST(
        0,
        LEAST(
          30000,
          ceil(extract(epoch FROM (v_active.launch_lease_expires_at - v_now)) * 1000)::INTEGER
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'ACTIVE',
      'active_operation', v_attempt_json,
      'retry_after_ms', v_retry_after_ms,
      'reason', CASE
        WHEN v_active.op_type <> 'STATUS' THEN 'OPERATION_CONFLICT'
        WHEN v_active.state = 'RECEIVED' THEN 'CALLBACK_RECEIVED'
        ELSE 'LAUNCH_LEASE_ACTIVE'
      END
    );
  END IF;

  -- Bound only a short rolling window. The previous lifetime counter made a
  -- tablet permanently unrecoverable after three historical STATUS checks,
  -- even hours or days later. STATUS is read-only at Fiuu; SALE and VOID stay
  -- blocked while this narrow native-release lane is active.
  SELECT count(*)::INTEGER, min(created_at)
  INTO v_release_attempts, v_oldest_release_attempt_at
  FROM public.pos_fiuu_vt_attempts
  WHERE payment_id = v_payment.id
    AND reconciliation_purpose = 'NATIVE_RELEASE'
    AND state <> 'ABANDONED'
    AND created_at > v_now - interval '60 seconds';

  IF v_release_attempts >= 3 THEN
    v_retry_after_ms := GREATEST(
      1000,
      LEAST(
        30000,
        ceil(extract(epoch FROM (
          v_oldest_release_attempt_at + interval '60 seconds' - v_now
        )) * 1000)::INTEGER
      )
    );
    RETURN jsonb_build_object(
      'outcome', 'RETRY_LIMIT',
      'reason', 'NATIVE_RELEASE_RATE_LIMIT',
      'retry_after_ms', v_retry_after_ms
    );
  END IF;

  INSERT INTO public.pos_fiuu_vt_attempts (
    id,
    payment_id,
    provider_order_id,
    op_type,
    callback_host,
    state,
    expires_at,
    launch_lease_token,
    launch_lease_expires_at,
    launch_lease_generation,
    reconciliation_purpose,
    updated_at
  ) VALUES (
    p_attempt_id,
    v_payment.id,
    v_payment.provider_order_id,
    'STATUS',
    p_callback_host,
    'PREPARED',
    v_now + interval '5 minutes',
    p_lease_token,
    v_now + v_lease_duration,
    1,
    'NATIVE_RELEASE',
    v_now
  )
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'outcome', 'LAUNCH',
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'callback_host', v_attempt.callback_host,
      'expires_at', v_attempt.expires_at,
      'op_type', v_attempt.op_type,
      'state', v_attempt.state,
      'lease_generation', v_attempt.launch_lease_generation,
      'lease_expires_at', v_attempt.launch_lease_expires_at
    ),
    'reused', false,
    'reason', 'QUARANTINED_STATUS_RECONCILIATION'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_review_status_lease(
  UUID, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_review_status_lease(
  UUID, UUID, TEXT, UUID, UUID
) TO service_role;

