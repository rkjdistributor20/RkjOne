-- Bound automatic Fiuu VT STATUS callback identities per payment. Legacy
-- clients can otherwise abandon a failed native launch and immediately claim
-- another identity forever. The existing rotating wrapper remains the sole
-- implementation that expires leases and creates attempts; this outer guard
-- only decides whether another STATUS launch may reach it.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $$
BEGIN
  IF to_regprocedure(
    'public.claim_pos_fiuu_vt_launch_lease_with_rotation(uuid,text,uuid,text,uuid,uuid)'
  ) IS NULL THEN
    ALTER FUNCTION public.claim_pos_fiuu_vt_launch_lease(
      UUID, TEXT, UUID, TEXT, UUID, UUID
    ) RENAME TO claim_pos_fiuu_vt_launch_lease_with_rotation;
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
  v_payment public.pos_online_payments%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_status_attempt_count INTEGER := 0;
  v_status_retry_budget CONSTANT INTEGER := 3;
BEGIN
  -- Delegate malformed, unauthorized and non-STATUS requests unchanged so the
  -- established rotating wrapper remains authoritative for validation and for
  -- SALE/VOID arbitration. The route supplies only server-generated identities.
  IF p_op_type = 'STATUS'
    AND p_actor_id IS NOT NULL
    AND p_attempt_id IS NOT NULL
    AND p_lease_token IS NOT NULL
    AND p_callback_host IS NOT DISTINCT FROM (
      'a-' || replace(lower(p_attempt_id::TEXT), '-', '') || '.fiuu-vt.rkj.one'
    ) THEN
    -- This is the same per-payment serialization point used by the rotating
    -- wrapper. Counting and deciding under this lock prevents concurrent
    -- requests from both consuming the final retry slot.
    SELECT * INTO v_payment
    FROM public.pos_online_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF FOUND
      AND v_payment.provider = 'fiuu_vt'
      AND v_payment.created_by IS NOT DISTINCT FROM p_actor_id
      AND v_payment.status = 'PENDING'
      AND NOT COALESCE(v_payment.fiuu_vt_review_required, false) THEN
      -- Every server-issued STATUS identity consumes the payment-scoped
      -- budget. There is deliberately no state predicate: ABANDONED and
      -- EXPIRED attempts count, while active/replayed requests cannot create a
      -- fourth identity. Existing rows remain immutable callback anchors.
      SELECT count(*)::INTEGER INTO v_status_attempt_count
      FROM public.pos_fiuu_vt_attempts
      WHERE payment_id = v_payment.id
        AND op_type = 'STATUS';

      IF v_payment.expires_at IS NOT NULL
        AND v_payment.expires_at <= v_now THEN
        RETURN jsonb_build_object(
          'outcome', 'RETRY_LIMIT',
          'reason', 'PAYMENT_EXPIRED',
          'retry_after_ms', 30000
        );
      END IF;

      IF v_status_attempt_count >= v_status_retry_budget THEN
        RETURN jsonb_build_object(
          'outcome', 'RETRY_LIMIT',
          'reason', 'STATUS_ATTEMPT_BUDGET_EXHAUSTED',
          'retry_after_ms', 30000
        );
      END IF;
    END IF;
  END IF;

  RETURN public.claim_pos_fiuu_vt_launch_lease_with_rotation(
    p_payment_id,
    p_op_type,
    p_attempt_id,
    p_callback_host,
    p_lease_token,
    p_actor_id
  );
END;
$$;

-- Only the payment-scoped entry point is callable by the application. The
-- rotation implementation remains owner-only and cannot bypass the breaker.
REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease_with_rotation(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) TO service_role;
