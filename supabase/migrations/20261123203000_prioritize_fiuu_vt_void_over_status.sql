-- Let an explicit cashier cancellation supersede an in-flight STATUS launch.
-- STATUS is observational, while VOID is the operator's requested state
-- transition. Keeping a STATUS lease ahead of VOID made the cashier wait for
-- the lease and could cause the client to report "cancel requested" before a
-- VOID attempt existed. The superseded STATUS row is retained as an immutable
-- callback identity so a delayed success still reconciles to its original
-- payment exactly once.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- A superseded STATUS may still receive a legitimate delayed callback while
-- the replacement VOID is PREPARED/LAUNCHED. Mark that exact row explicitly;
-- ordinary attempts retain both original uniqueness guarantees.
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS supersession_reason TEXT;

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_supersession_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_supersession_check CHECK (
    (
      superseded_at IS NULL
      AND superseded_by_attempt_id IS NULL
      AND supersession_reason IS NULL
    ) OR (
      superseded_at IS NOT NULL
      AND superseded_by_attempt_id IS NOT NULL
      AND superseded_by_attempt_id <> id
      AND supersession_reason = 'VOID_REQUESTED'
      AND op_type = 'STATUS'
      AND state IN ('EXPIRED', 'RECEIVED', 'CONSUMED', 'QUARANTINED')
    )
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_supersession_check;

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_superseded_by_attempt_fkey;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_superseded_by_attempt_fkey
  FOREIGN KEY (superseded_by_attempt_id)
  REFERENCES public.pos_fiuu_vt_attempts(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_superseded_by_attempt_fkey;

-- The partial indexes below deliberately exclude a superseded STATUS. Keep
-- that exemption trustworthy even for privileged writes: the replacement
-- must be a distinct VOID identity for the same payment. This is deferred so
-- the wrapper can expire the STATUS before the delegated claim inserts the
-- replacement VOID, while the whole operation remains atomic at commit.
CREATE OR REPLACE FUNCTION public.enforce_pos_fiuu_vt_attempt_supersession()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_payment_id UUID;
  v_target_op_type TEXT;
  v_invalid_source_id UUID;
BEGIN
  IF NEW.superseded_by_attempt_id IS NOT NULL THEN
    SELECT payment_id, op_type
    INTO v_target_payment_id, v_target_op_type
    FROM public.pos_fiuu_vt_attempts
    WHERE id = NEW.superseded_by_attempt_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Superseding Fiuu VT attempt does not exist',
        CONSTRAINT = 'pos_fiuu_vt_attempts_superseded_by_attempt_fkey';
    END IF;

    IF v_target_payment_id IS DISTINCT FROM NEW.payment_id
      OR v_target_op_type IS DISTINCT FROM 'VOID' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Superseding Fiuu VT attempt must be a VOID for the same payment',
        CONSTRAINT = 'pos_fiuu_vt_attempts_supersession_target_check';
    END IF;
  END IF;

  -- Also validate the reverse edge when a referenced target is inserted or
  -- its identity fields are changed after the source row was written.
  SELECT source.id
  INTO v_invalid_source_id
  FROM public.pos_fiuu_vt_attempts AS source
  WHERE source.superseded_by_attempt_id = NEW.id
    AND (
      NEW.op_type IS DISTINCT FROM 'VOID'
      OR NEW.payment_id IS DISTINCT FROM source.payment_id
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Referenced Fiuu VT supersession target is not a VOID for the same payment',
      DETAIL = 'Invalid superseded STATUS attempt: ' || v_invalid_source_id::TEXT,
      CONSTRAINT = 'pos_fiuu_vt_attempts_supersession_target_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pos_fiuu_vt_attempt_supersession
  ON public.pos_fiuu_vt_attempts;
CREATE CONSTRAINT TRIGGER enforce_pos_fiuu_vt_attempt_supersession
AFTER INSERT OR UPDATE OF id, payment_id, op_type, superseded_by_attempt_id
ON public.pos_fiuu_vt_attempts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pos_fiuu_vt_attempt_supersession();

REVOKE ALL ON FUNCTION public.enforce_pos_fiuu_vt_attempt_supersession()
  FROM PUBLIC, anon, authenticated, service_role;

DROP INDEX IF EXISTS public.idx_pos_fiuu_vt_attempts_one_active_operation;
CREATE UNIQUE INDEX idx_pos_fiuu_vt_attempts_one_active_operation
  ON public.pos_fiuu_vt_attempts(payment_id, op_type)
  WHERE state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
    AND superseded_at IS NULL;

DROP INDEX IF EXISTS public.idx_pos_fiuu_vt_attempts_one_active_reconciliation;
CREATE UNIQUE INDEX idx_pos_fiuu_vt_attempts_one_active_reconciliation
  ON public.pos_fiuu_vt_attempts(payment_id)
  WHERE op_type IN ('STATUS', 'VOID')
    AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
    AND superseded_at IS NULL;

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
  v_blocking_status public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_status_attempt_count INTEGER := 0;
  v_status_retry_budget CONSTANT INTEGER := 3;
  v_superseded_status_count INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Validate the server-issued callback identity before taking the payment
  -- lock or changing an attempt. Malformed and unauthorized requests remain
  -- the responsibility of the established rotation implementation.
  IF p_op_type IN ('STATUS', 'VOID')
    AND p_actor_id IS NOT NULL
    AND p_attempt_id IS NOT NULL
    AND p_lease_token IS NOT NULL
    AND p_callback_host IS NOT DISTINCT FROM (
      'a-' || replace(lower(p_attempt_id::TEXT), '-', '') || '.fiuu-vt.rkj.one'
    ) THEN
    -- This is the same per-payment serialization point used by the rotation
    -- implementation. Callback claims use shift -> payment -> attempt, so this
    -- path must never acquire a shift lock after obtaining the payment lock. A
    -- callback that already reached RECEIVED wins; only evidence-free
    -- PREPARED/LAUNCHED STATUS attempts can be superseded.
    SELECT * INTO v_payment
    FROM public.pos_online_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF FOUND
      AND v_payment.provider = 'fiuu_vt'
      AND v_payment.created_by IS NOT DISTINCT FROM p_actor_id
      AND v_payment.status = 'PENDING'
      AND NOT COALESCE(v_payment.fiuu_vt_review_required, false)
      AND v_payment.fiuu_vt_cashier_released_at IS NULL THEN
      IF p_op_type = 'STATUS' THEN
        -- Preserve the payment-scoped circuit breaker introduced by
        -- 20261123170000. Every server-issued STATUS identity consumes budget,
        -- including ABANDONED and EXPIRED attempts.
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
      ELSE
        UPDATE public.pos_fiuu_vt_attempts
        SET state = 'EXPIRED',
            expired_at = COALESCE(expired_at, v_now),
            expires_at = LEAST(COALESCE(expires_at, v_now), v_now),
            launch_lease_expires_at = LEAST(
              COALESCE(launch_lease_expires_at, v_now),
              v_now
            ),
            superseded_at = v_now,
            superseded_by_attempt_id = p_attempt_id,
            supersession_reason = 'VOID_REQUESTED',
            updated_at = v_now
        WHERE payment_id = v_payment.id
          AND provider_order_id = v_payment.provider_order_id
          AND op_type = 'STATUS'
          AND state IN ('PREPARED', 'LAUNCHED')
          AND received_at IS NULL
          AND result_fingerprint IS NULL
          AND result_json IS NULL
          AND processing_lease_token IS NULL
          AND processing_lease_expires_at IS NULL
          AND superseded_at IS NULL;
        GET DIAGNOSTICS v_superseded_status_count = ROW_COUNT;

        -- Do not let the legacy rotation wrapper age out an inconsistent or
        -- callback-owned STATUS that this guarded supersession deliberately
        -- refused to touch. Surface it as ACTIVE and leave every field intact.
        IF v_superseded_status_count = 0 THEN
          SELECT * INTO v_blocking_status
          FROM public.pos_fiuu_vt_attempts
          WHERE payment_id = v_payment.id
            AND op_type = 'STATUS'
            AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
          ORDER BY
            CASE state
              WHEN 'RECEIVED' THEN 0
              WHEN 'LAUNCHED' THEN 1
              ELSE 2
            END,
            created_at DESC,
            id DESC
          LIMIT 1
          FOR UPDATE;

          IF FOUND THEN
            RETURN jsonb_build_object(
              'outcome', 'ACTIVE',
              'active_operation', jsonb_build_object(
                'id', v_blocking_status.id,
                'callback_host', v_blocking_status.callback_host,
                'expires_at', v_blocking_status.expires_at,
                'op_type', v_blocking_status.op_type,
                'state', v_blocking_status.state,
                'lease_generation', v_blocking_status.launch_lease_generation,
                'lease_expires_at', v_blocking_status.launch_lease_expires_at
              ),
              'retry_after_ms', 0,
              'reason', 'STATUS_CALLBACK_EVIDENCE_ACTIVE'
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  v_result := public.claim_pos_fiuu_vt_launch_lease_with_rotation(
    p_payment_id,
    p_op_type,
    p_attempt_id,
    p_callback_host,
    p_lease_token,
    p_actor_id
  );

  IF v_superseded_status_count > 0 THEN
    IF v_result->>'outcome' IS DISTINCT FROM 'LAUNCH'
      OR v_result->'attempt'->>'id' IS DISTINCT FROM lower(p_attempt_id::TEXT)
      OR v_result->'attempt'->>'op_type' IS DISTINCT FROM 'VOID' THEN
      RAISE EXCEPTION 'Fiuu VT VOID supersession did not create the exact replacement attempt';
    END IF;
    RETURN v_result || jsonb_build_object(
      'reused', false,
      'reason', 'STATUS_SUPERSEDED_BY_VOID',
      'superseded_status_count', v_superseded_status_count
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease_with_rotation(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) TO service_role;
