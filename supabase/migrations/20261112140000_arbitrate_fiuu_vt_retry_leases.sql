-- Serialize provider launches behind a short retry lease. STATUS/VOID share a
-- single arbitration lane per payment, while a missing STATUS callback can be
-- relaunched with the same attempt ID and callback host after at most 25s.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_fiuu_vt_attempts
  ADD COLUMN IF NOT EXISTS launch_lease_token UUID,
  ADD COLUMN IF NOT EXISTS launch_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS launch_lease_generation INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_fiuu_vt_attempts.launch_lease_token IS
  'Server-only token proving which request owns the current provider-launch lease.';
COMMENT ON COLUMN public.pos_fiuu_vt_attempts.launch_lease_expires_at IS
  'Short lease deadline; STATUS/VOID may reuse the same callback identity after expiry.';
COMMENT ON COLUMN public.pos_fiuu_vt_attempts.launch_lease_generation IS
  'Monotonic launch generation for the same idempotent callback attempt.';

-- Older code could leave STATUS and VOID active together because uniqueness
-- was per operation. Preserve the strongest/newest operation deterministically
-- and expire (never delete) the others so their callback identities remain
-- available to the callback quarantine/reconciliation path.
WITH ranked_reconciliation AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY payment_id
      ORDER BY
        CASE state
          WHEN 'RECEIVED' THEN 0
          WHEN 'LAUNCHED' THEN 1
          ELSE 2
        END,
        CASE op_type WHEN 'VOID' THEN 0 ELSE 1 END,
        created_at DESC,
        id DESC
    ) AS operation_rank
  FROM public.pos_fiuu_vt_attempts
  WHERE op_type IN ('STATUS', 'VOID')
    AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
)
UPDATE public.pos_fiuu_vt_attempts attempt
SET state = 'EXPIRED',
    expired_at = COALESCE(attempt.expired_at, now()),
    updated_at = now()
FROM ranked_reconciliation ranked
WHERE attempt.id = ranked.id
  AND ranked.operation_rank > 1;

-- Give every pre-existing active operation one bounded lease on deployment.
-- This avoids an immediate duplicate launch while ensuring recovery remains
-- available within 25 seconds.
UPDATE public.pos_fiuu_vt_attempts
SET launch_lease_token = COALESCE(launch_lease_token, gen_random_uuid()),
    launch_lease_expires_at = COALESCE(
      launch_lease_expires_at,
      now() + interval '25 seconds'
    ),
    launch_lease_generation = GREATEST(launch_lease_generation, 1),
    updated_at = now()
WHERE state IN ('PREPARED', 'LAUNCHED', 'RECEIVED');

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_launch_lease_generation_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_launch_lease_generation_check CHECK (
    launch_lease_generation >= 0
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_launch_lease_generation_check;

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_active_launch_lease_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_active_launch_lease_check CHECK (
    state NOT IN ('PREPARED', 'LAUNCHED')
    OR (
      launch_lease_token IS NOT NULL
      AND launch_lease_expires_at IS NOT NULL
      AND launch_lease_generation >= 1
    )
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_active_launch_lease_check;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_launch_lease_token
  ON public.pos_fiuu_vt_attempts(launch_lease_token)
  WHERE launch_lease_token IS NOT NULL;

-- STATUS and VOID are one reconciliation lane. The existing per-operation
-- index remains in place for SALE and same-operation protection.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_one_active_reconciliation
  ON public.pos_fiuu_vt_attempts(payment_id)
  WHERE op_type IN ('STATUS', 'VOID')
    AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED');

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
  v_active public.pos_fiuu_vt_attempts%ROWTYPE;
  v_prior_sale public.pos_fiuu_vt_attempts%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_duration CONSTANT INTERVAL := interval '25 seconds';
  v_attempt_duration INTERVAL;
  v_retry_after_ms INTEGER := 0;
  v_attempt_json JSONB;
BEGIN
  IF p_op_type NOT IN ('SALE', 'STATUS', 'VOID') THEN
    RAISE EXCEPTION 'Invalid Fiuu VT operation';
  END IF;
  IF p_actor_id IS NULL OR p_attempt_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT launch identity is required';
  END IF;
  IF p_callback_host IS DISTINCT FROM (
    'a-' || replace(lower(p_attempt_id::TEXT), '-', '') || '.fiuu-vt.rkj.one'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback host';
  END IF;

  -- This row lock is the per-payment serialization point. It guarantees that
  -- focus events, manual checks and concurrent HTTP requests can award only
  -- one provider launch in each retry lease.
  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_vt' THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;
  IF v_payment.created_by IS DISTINCT FROM p_actor_id THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;
  IF v_payment.fiuu_vt_review_required THEN
    RETURN jsonb_build_object('outcome', 'REVIEW_REQUIRED');
  END IF;
  IF v_payment.status <> 'PENDING' THEN
    RETURN jsonb_build_object(
      'outcome', 'TERMINAL',
      'payment_status', v_payment.status
    );
  END IF;

  -- RECEIVED is never reclaimed: another callback request owns it. Only a
  -- launch that never produced a callback may age into EXPIRED.
  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'EXPIRED',
      expired_at = COALESCE(expired_at, v_now),
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED')
    AND expires_at <= v_now;

  IF p_op_type = 'SALE' THEN
    IF v_payment.provider_sale_reported_at IS NOT NULL
      OR v_payment.provider_transaction_id IS NOT NULL THEN
      RETURN jsonb_build_object('outcome', 'STATUS_REQUIRED');
    END IF;

    -- ABANDONED proves the provider app never opened and is the sole safe SALE
    -- retry. Every other prior SALE forces STATUS recovery instead.
    SELECT * INTO v_prior_sale
    FROM public.pos_fiuu_vt_attempts
    WHERE payment_id = v_payment.id
      AND op_type = 'SALE'
      AND state <> 'ABANDONED'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF v_prior_sale.state IN ('PREPARED', 'LAUNCHED', 'RECEIVED') THEN
        v_attempt_json := jsonb_build_object(
          'id', v_prior_sale.id,
          'callback_host', v_prior_sale.callback_host,
          'expires_at', v_prior_sale.expires_at,
          'op_type', v_prior_sale.op_type,
          'state', v_prior_sale.state,
          'lease_generation', v_prior_sale.launch_lease_generation,
          'lease_expires_at', v_prior_sale.launch_lease_expires_at
        );
        RETURN jsonb_build_object(
          'outcome', 'ACTIVE',
          'active_operation', v_attempt_json,
          'retry_after_ms', 0,
          'reason', 'SALE_ALREADY_ISSUED'
        );
      END IF;
      RETURN jsonb_build_object('outcome', 'STATUS_REQUIRED');
    END IF;
  ELSE
    -- STATUS and VOID are mutually exclusive. An opposite operation is
    -- reported deterministically and is never silently superseded.
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

      IF v_active.op_type <> p_op_type THEN
        RETURN jsonb_build_object(
          'outcome', 'ACTIVE',
          'active_operation', v_attempt_json,
          'retry_after_ms', 0,
          'reason', 'OPERATION_CONFLICT'
        );
      END IF;
      IF v_active.state = 'RECEIVED' THEN
        RETURN jsonb_build_object(
          'outcome', 'ACTIVE',
          'active_operation', v_attempt_json,
          'retry_after_ms', 0,
          'reason', 'CALLBACK_RECEIVED'
        );
      END IF;
      IF v_active.launch_lease_expires_at > v_now THEN
        v_retry_after_ms := GREATEST(
          0,
          LEAST(
            30000,
            ceil(extract(epoch FROM (v_active.launch_lease_expires_at - v_now)) * 1000)::INTEGER
          )
        );
        RETURN jsonb_build_object(
          'outcome', 'ACTIVE',
          'active_operation', v_attempt_json,
          'retry_after_ms', v_retry_after_ms,
          'reason', 'LAUNCH_LEASE_ACTIVE'
        );
      END IF;

      -- Missing callback: award exactly one new lease while preserving the
      -- same attempt ID and callback host. Late callbacks from either launch
      -- therefore remain authentic and processable.
      UPDATE public.pos_fiuu_vt_attempts
      SET launch_lease_token = p_lease_token,
          launch_lease_expires_at = v_now + v_lease_duration,
          launch_lease_generation = launch_lease_generation + 1,
          updated_at = v_now
      WHERE id = v_active.id
        AND state IN ('PREPARED', 'LAUNCHED')
      RETURNING * INTO v_active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiuu VT launch lease changed concurrently';
      END IF;
      RETURN jsonb_build_object(
        'outcome', 'LAUNCH',
        'attempt', jsonb_build_object(
          'id', v_active.id,
          'callback_host', v_active.callback_host,
          'expires_at', v_active.expires_at,
          'op_type', v_active.op_type,
          'state', v_active.state,
          'lease_generation', v_active.launch_lease_generation,
          'lease_expires_at', v_active.launch_lease_expires_at
        ),
        'reused', true,
        'reason', 'MISSING_CALLBACK_RETRY'
      );
    END IF;
  END IF;

  v_attempt_duration := CASE p_op_type
    WHEN 'SALE' THEN interval '15 minutes'
    ELSE interval '5 minutes'
  END;

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
    updated_at
  ) VALUES (
    p_attempt_id,
    v_payment.id,
    v_payment.provider_order_id,
    p_op_type,
    p_callback_host,
    'PREPARED',
    v_now + v_attempt_duration,
    p_lease_token,
    v_now + v_lease_duration,
    1,
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
    'reason', 'NEW_ATTEMPT'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(
  UUID, TEXT, UUID, TEXT, UUID, UUID
) TO service_role;
