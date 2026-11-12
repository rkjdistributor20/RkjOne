-- Rotate the one-time callback identity whenever a reconciliation launch lease
-- expires. Reusing one host lets a late provider callback from the earlier
-- launch consume the retry callback on Android, which can hide STATUS=00 and
-- leave the cashier blocked.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $$
BEGIN
  IF to_regprocedure(
    'public.claim_pos_fiuu_vt_launch_lease_reused_identity(uuid,text,uuid,text,uuid,uuid)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_pos_fiuu_vt_launch_lease(
      UUID, TEXT, UUID, TEXT, UUID, UUID
    ) RENAME TO claim_pos_fiuu_vt_launch_lease_reused_identity;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  p_payment_id UUID,
  p_op_type TEXT,
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
  v_now TIMESTAMPTZ := clock_timestamp();
  v_rotated_count INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Use the payment row as the same per-payment serialization point as the
  -- original lease function. This makes expiry and replacement insertion one
  -- atomic transaction even when focus/manual checks race each other.
  PERFORM 1
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF FOUND AND p_op_type IN ('STATUS', 'VOID') THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'EXPIRED',
        expired_at = COALESCE(expired_at, v_now),
        -- The callback acceptance route uses expires_at as the start of its
        -- late-success grace window.  Once the short launch lease has elapsed,
        -- expire both clocks together so a legitimate delayed STATUS=00 is
        -- recovered instead of being quarantined until the original five
        -- minute callback TTL also elapses.
        expires_at = LEAST(expires_at, v_now),
        launch_lease_expires_at = LEAST(
          COALESCE(launch_lease_expires_at, v_now),
          v_now
        ),
        updated_at = v_now
    WHERE payment_id = p_payment_id
      AND op_type IN ('STATUS', 'VOID')
      AND state IN ('PREPARED', 'LAUNCHED')
      AND launch_lease_expires_at <= v_now;
    GET DIAGNOSTICS v_rotated_count = ROW_COUNT;
  END IF;

  v_result := public.claim_pos_fiuu_vt_launch_lease_reused_identity(
    p_payment_id,
    p_op_type,
    p_attempt_id,
    p_callback_host,
    p_lease_token,
    p_actor_id
  );

  IF v_rotated_count > 0 AND v_result->>'outcome' = 'LAUNCH' THEN
    RETURN v_result || jsonb_build_object(
      'reused', false,
      'reason', 'MISSING_CALLBACK_ROTATED'
    );
  END IF;

  RETURN v_result;
END;
$$;

-- The legacy implementation is callable only by the owner through the
-- security-definer wrapper. All application callers must use the rotating
-- identity entry point above.
REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease_reused_identity(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) TO service_role;
