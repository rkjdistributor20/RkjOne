-- Make Fiuu VT callback ownership recoverable. A callback request first claims
-- a short processing lease atomically; an identical replay may resume after
-- that lease expires, while a different fingerprint remains a hard conflict.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_fiuu_vt_attempts
  ADD COLUMN IF NOT EXISTS processing_lease_token UUID,
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_lease_generation INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_fiuu_vt_attempts.processing_lease_token IS
  'Server-only token proving which callback request owns result processing.';
COMMENT ON COLUMN public.pos_fiuu_vt_attempts.processing_lease_expires_at IS
  'Short deadline after which an identical callback fingerprint may resume processing.';
COMMENT ON COLUMN public.pos_fiuu_vt_attempts.processing_lease_generation IS
  'Monotonic generation for resumable callback processing of one attempt.';

-- Existing RECEIVED rows were created before processing leases existed. Give
-- a possibly in-flight old request one bounded window, then permit an exact
-- replay to recover the row instead of leaving it stranded forever.
UPDATE public.pos_fiuu_vt_attempts
SET processing_lease_token = COALESCE(processing_lease_token, gen_random_uuid()),
    processing_lease_expires_at = COALESCE(
      processing_lease_expires_at,
      clock_timestamp() + interval '30 seconds'
    ),
    processing_lease_generation = GREATEST(processing_lease_generation, 1),
    updated_at = clock_timestamp()
WHERE state = 'RECEIVED';

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_processing_lease_generation_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_processing_lease_generation_check CHECK (
    processing_lease_generation >= 0
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_processing_lease_generation_check;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_processing_lease_token
  ON public.pos_fiuu_vt_attempts(processing_lease_token)
  WHERE processing_lease_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_processing_lease_expiry
  ON public.pos_fiuu_vt_attempts(processing_lease_expires_at)
  WHERE state = 'RECEIVED';

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
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_duration CONSTANT INTERVAL := interval '30 seconds';
  v_retry_after_ms INTEGER := 0;
BEGIN
  IF p_payment_id IS NULL
    OR p_attempt_id IS NULL
    OR p_processing_token IS NULL
    OR COALESCE(p_result_fingerprint, '') !~ '^[a-f0-9]{64}$'
    OR p_result_json IS NULL
    OR jsonb_typeof(p_result_json) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback processing claim';
  END IF;

  -- The attempt row is the serialization point for callbacks carrying this
  -- one-time identity. Fingerprint comparison and lease award are one atomic
  -- transaction, so concurrent exact replays cannot both own processing.
  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  IF v_attempt.state = 'CONSUMED' THEN
    IF v_attempt.result_fingerprint IS NOT DISTINCT FROM p_result_fingerprint THEN
      RETURN jsonb_build_object('outcome', 'CONSUMED');
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'CONFLICT',
      'existing_result', v_attempt.result_json
    );
  END IF;

  IF v_attempt.state = 'RECEIVED' THEN
    IF v_attempt.result_fingerprint IS DISTINCT FROM p_result_fingerprint THEN
      RETURN jsonb_build_object(
        'outcome', 'CONFLICT',
        'existing_result', v_attempt.result_json
      );
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
      );
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
    );
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
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'INELIGIBLE',
    'attempt_state', v_attempt.state
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_pos_fiuu_vt_callback_processing(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_result_fingerprint TEXT,
  p_processing_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_payment_id IS NULL
    OR p_attempt_id IS NULL
    OR p_processing_token IS NULL
    OR COALESCE(p_result_fingerprint, '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback processing completion';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  IF v_attempt.state = 'CONSUMED'
    AND v_attempt.result_fingerprint IS NOT DISTINCT FROM p_result_fingerprint THEN
    RETURN jsonb_build_object('outcome', 'COMPLETED', 'already_completed', true);
  END IF;

  IF v_attempt.state <> 'RECEIVED'
    OR v_attempt.result_fingerprint IS DISTINCT FROM p_result_fingerprint
    OR v_attempt.processing_lease_token IS DISTINCT FROM p_processing_token THEN
    RETURN jsonb_build_object(
      'outcome', 'LOST_LEASE',
      'attempt_state', v_attempt.state
    );
  END IF;

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'CONSUMED',
      consumed_at = COALESCE(consumed_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE id = v_attempt.id
    AND state = 'RECEIVED'
    AND result_fingerprint = p_result_fingerprint
    AND processing_lease_token = p_processing_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'LOST_LEASE');
  END IF;

  RETURN jsonb_build_object('outcome', 'COMPLETED', 'already_completed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, JSONB, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, JSONB, UUID, BOOLEAN
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, UUID
) TO service_role;
