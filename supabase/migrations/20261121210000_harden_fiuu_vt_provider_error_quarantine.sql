-- Safely release a cashier lane when Fiuu VT STATUS is repeatedly unavailable.
-- A provider transport error is never treated as proof of cancellation. The
-- payment moves to a dedicated QUARANTINED state, remains visible to Finance,
-- and is resolved only after an explicit provider/settlement check.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS fiuu_vt_review_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_vt_review_resolved_by UUID
    REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS fiuu_vt_review_resolution TEXT,
  ADD COLUMN IF NOT EXISTS fiuu_vt_review_resolution_note TEXT;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_status_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_status_check CHECK (
    status IN (
      'PENDING', 'REPORTED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED',
      'QUARANTINED'
    )
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_status_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_reconciliation_state_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_reconciliation_state_check CHECK (
    fiuu_vt_reconciliation_state IS NULL
    OR fiuu_vt_reconciliation_state IN (
      'LATE_SUCCESS_REVIEW',
      'REVERSAL_REVIEW',
      'FOREIGN_CALLBACK_REVIEW',
      'PROVIDER_ERROR_REVIEW',
      'PROVIDER_ERROR_RESOLVED_NOT_CHARGED',
      'PROVIDER_ERROR_RESOLVED_CHARGED'
    )
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_reconciliation_state_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_review_resolution_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_review_resolution_check CHECK (
    fiuu_vt_review_resolution IS NULL
    OR fiuu_vt_review_resolution IN (
      'CONFIRMED_NOT_CHARGED',
      'CONFIRMED_CHARGED'
    )
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_review_resolution_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_review_resolution_note_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_review_resolution_note_check CHECK (
    fiuu_vt_review_resolution_note IS NULL
    OR length(btrim(fiuu_vt_review_resolution_note)) BETWEEN 5 AND 1000
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_review_resolution_note_check;

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_fiuu_vt_unresolved_quarantine
  ON public.pos_online_payments(organization_id, branch_id, created_at)
  WHERE provider = 'fiuu_vt'
    AND status = 'QUARANTINED'
    AND fiuu_vt_review_required;

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_fiuu_vt_review_resolved_by
  ON public.pos_online_payments(fiuu_vt_review_resolved_by)
  WHERE fiuu_vt_review_resolved_by IS NOT NULL;

-- Review evidence is an append-only bounded event stream. Historical
-- single-object evidence is retained as the first event during conversion.
CREATE OR REPLACE FUNCTION public.append_pos_fiuu_vt_review_event(
  p_existing JSONB,
  p_event JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_events JSONB := '[]'::JSONB;
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
    RAISE EXCEPTION 'Fiuu VT review event must be an object';
  END IF;

  IF p_existing IS NOT NULL AND jsonb_typeof(p_existing) = 'object' THEN
    IF jsonb_typeof(p_existing->'events') = 'array' THEN
      v_events := p_existing->'events';
    ELSIF p_existing <> '{}'::JSONB THEN
      v_events := jsonb_build_array(p_existing);
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(event_value ORDER BY event_order), '[]'::JSONB)
  INTO v_events
  FROM (
    SELECT event_value, event_order
    FROM jsonb_array_elements(v_events || jsonb_build_array(p_event))
      WITH ORDINALITY AS event_row(event_value, event_order)
    ORDER BY event_order DESC
    LIMIT 50
  ) AS recent_events;

  RETURN jsonb_build_object('events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.append_pos_fiuu_vt_review_event(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_pos_fiuu_vt_review_event(JSONB, JSONB)
  TO service_role;

-- Exact replay of one callback must not refresh its timestamp or increase the
-- threshold. A quarantine can be offered only when no SALE/transaction
-- evidence exists.
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
  v_exact_replay BOOLEAN := false;
BEGIN
  IF COALESCE(p_error_code, '') !~ '^[A-Za-z0-9_-]{1,32}$' THEN
    RAISE EXCEPTION 'Invalid Fiuu VT provider error code';
  END IF;
  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) <> 'object'
    OR p_provider_result->>'kind' IS DISTINCT FROM 'ERROR'
    OR p_provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR p_provider_result->>'errorCode' IS DISTINCT FROM p_error_code
    OR length(COALESCE(p_provider_result->>'callbackAttemptId', '')) < 8 THEN
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

  v_expired_at := COALESCE(
    v_payment.expires_at,
    v_payment.created_at + INTERVAL '15 minutes'
  );
  v_exact_replay := v_payment.provider_result->>'callbackAttemptId'
      = p_provider_result->>'callbackAttemptId'
    AND v_payment.fiuu_vt_provider_error_code = p_error_code;

  IF v_exact_replay THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'error_code', p_error_code,
      'error_count', v_payment.fiuu_vt_provider_error_count,
      'park_available',
        v_payment.fiuu_vt_provider_error_count >= 3
        AND v_expired_at <= v_observed_at
        AND v_payment.provider_transaction_id IS NULL
        AND v_payment.provider_sale_reported_at IS NULL
        AND v_payment.transaction_id IS NULL
        AND v_payment.paid_at IS NULL,
      'expires_at', v_expired_at,
      'replayed', true
    );
  END IF;

  v_error_count := CASE
    WHEN v_payment.fiuu_vt_provider_error_code = p_error_code
      AND v_payment.fiuu_vt_provider_error_at >= v_observed_at - INTERVAL '15 minutes'
    THEN LEAST(v_payment.fiuu_vt_provider_error_count + 1, 100)
    ELSE 1
  END;

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
    'park_available',
      v_error_count >= 3
      AND v_expired_at <= v_observed_at
      AND v_payment.provider_transaction_id IS NULL
      AND v_payment.provider_sale_reported_at IS NULL
      AND v_payment.transaction_id IS NULL
      AND v_payment.paid_at IS NULL,
    'expires_at', v_expired_at,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_fiuu_vt_provider_error(
  UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pos_fiuu_vt_provider_error(
  UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ
) TO service_role;

-- Callback claims serialize on shift -> payment -> attempt, the same order as
-- quarantine and fulfilment. This makes an arriving callback and a cashier
-- quarantine mutually exclusive decisions.
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
    'attempt_state', v_attempt.state,
    'payment_status', v_payment.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, JSONB, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_callback_processing(
  UUID, UUID, TEXT, JSONB, UUID, BOOLEAN
) TO service_role;

-- Preserve every late/contradictory callback event instead of overwriting the
-- original quarantine decision and provider-error evidence.
CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review(
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
  v_related_count INTEGER := 0;
  v_paid_replacement_id UUID;
  v_device_code TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event JSONB;
BEGIN
  IF p_state NOT IN (
    'LATE_SUCCESS_REVIEW',
    'REVERSAL_REVIEW',
    'FOREIGN_CALLBACK_REVIEW',
    'PROVIDER_ERROR_REVIEW'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT review state';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'Fiuu VT review evidence must be an object';
  END IF;

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
    RAISE EXCEPTION 'Fiuu VT payment changed during review';
  END IF;

  v_event := p_evidence || jsonb_build_object(
    'eventType', p_state,
    'recordedAt', v_now
  );
  v_device_code := NULLIF(v_payment.sale_payload->>'fiuu_device_code', '');

  UPDATE public.pos_online_payments
  SET fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        fiuu_vt_review_evidence,
        v_event
      ),
      updated_at = v_now
  WHERE id = v_payment.id;

  UPDATE public.pos_online_payments AS candidate
  SET fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        candidate.fiuu_vt_review_evidence,
        jsonb_build_object(
          'eventType', 'RELATED_ACTIVE_PAYMENT_AT_REVIEW',
          'sourcePaymentId', v_payment.id,
          'observedAt', v_now,
          'sourceEvidence', p_evidence
        )
      ),
      updated_at = v_now
  WHERE candidate.id <> v_payment.id
    AND candidate.organization_id = v_payment.organization_id
    AND candidate.branch_id = v_payment.branch_id
    AND candidate.shift_id = v_payment.shift_id
    AND candidate.provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND candidate.status IN ('PENDING', 'REPORTED')
    AND (
      candidate.created_by IS NOT DISTINCT FROM v_payment.created_by
      OR (
        v_device_code IS NOT NULL
        AND NULLIF(candidate.sale_payload->>'fiuu_device_code', '') = v_device_code
      )
    );
  GET DIAGNOSTICS v_related_count = ROW_COUNT;

  SELECT candidate.id INTO v_paid_replacement_id
  FROM public.pos_online_payments AS candidate
  WHERE candidate.id <> v_payment.id
    AND candidate.organization_id = v_payment.organization_id
    AND candidate.branch_id = v_payment.branch_id
    AND candidate.shift_id = v_payment.shift_id
    AND candidate.provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND candidate.status = 'PAID'
    AND candidate.created_at > v_payment.created_at
    AND candidate.created_at <= COALESCE(
      v_payment.expires_at + INTERVAL '20 minutes',
      v_payment.created_at + INTERVAL '40 minutes'
    )
    AND round(candidate.amount_rm, 2) = round(v_payment.amount_rm, 2)
    AND candidate.sale_payload->'items'
      IS NOT DISTINCT FROM v_payment.sale_payload->'items'
    AND candidate.sale_payload->'pricing_snapshot'
      IS NOT DISTINCT FROM v_payment.sale_payload->'pricing_snapshot'
    AND candidate.sale_payload->'payment_method'
      IS NOT DISTINCT FROM v_payment.sale_payload->'payment_method'
    AND candidate.sale_payload->'cash_amount'
      IS NOT DISTINCT FROM v_payment.sale_payload->'cash_amount'
    AND candidate.sale_payload->'qr_amount'
      IS NOT DISTINCT FROM v_payment.sale_payload->'qr_amount'
    AND candidate.sale_payload->'discount'
      IS NOT DISTINCT FROM v_payment.sale_payload->'discount'
    AND (
      candidate.created_by IS NOT DISTINCT FROM v_payment.created_by
      OR (
        v_device_code IS NOT NULL
        AND NULLIF(candidate.sale_payload->>'fiuu_device_code', '') = v_device_code
      )
    )
  ORDER BY candidate.created_at ASC, candidate.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_paid_replacement_id IS NOT NULL THEN
    UPDATE public.pos_online_payments AS candidate
    SET fiuu_vt_review_required = true,
        fiuu_vt_reconciliation_state = p_state,
        fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
          candidate.fiuu_vt_review_evidence,
          jsonb_build_object(
            'eventType', 'RELATED_PAID_PAYMENT_AT_REVIEW',
            'sourcePaymentId', v_payment.id,
            'observedAt', v_now,
            'sourceEvidence', p_evidence
          )
        ),
        updated_at = v_now
    WHERE candidate.id = v_paid_replacement_id;

    v_related_count := v_related_count + 1;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'related_payments', v_related_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.park_pos_fiuu_vt_provider_error(UUID, UUID);

CREATE FUNCTION public.park_pos_fiuu_vt_provider_error(
  p_payment_id UUID,
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
  v_shift public.pos_shifts%ROWTYPE;
  v_payment public.pos_online_payments%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_device public.pos_devices%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_expired_at TIMESTAMPTZ;
  v_event JSONB;
BEGIN
  IF p_actor_id IS NULL OR p_device_id IS NULL OR p_enrollment_generation IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT quarantine identity is required';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  SELECT * INTO v_shift
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

  IF v_shift.status <> 'OPEN'
    OR v_shift.organization_id IS DISTINCT FROM v_payment.organization_id
    OR v_shift.branch_id IS DISTINCT FROM v_payment.branch_id THEN
    RAISE EXCEPTION 'Fiuu VT payment requires its matching open shift';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id
    AND organization_id = v_payment.organization_id
    AND status = 'ACTIVE'
  FOR SHARE;
  IF NOT FOUND OR v_payment.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Fiuu VT payment is not owned by this active cashier';
  END IF;

  IF v_actor.role::TEXT NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
    AND NOT EXISTS (
      SELECT 1
      FROM public.pos_shift_staff_members AS member
      WHERE member.shift_id = v_payment.shift_id
        AND member.branch_id = v_payment.branch_id
        AND member.profile_id = p_actor_id
        AND member.status = 'ACTIVE'
    ) THEN
    RAISE EXCEPTION 'Cashier is no longer active in this POS shift';
  END IF;

  SELECT device.* INTO v_device
  FROM public.pos_devices AS device
  JOIN public.branches AS branch
    ON branch.id = device.branch_id
   AND branch.organization_id = device.organization_id
  JOIN public.organizations AS tenant
    ON tenant.id = device.organization_id
  WHERE device.id = p_device_id
    AND device.organization_id = v_payment.organization_id
    AND device.branch_id = v_payment.branch_id
    AND device.device_code = v_payment.sale_payload->>'fiuu_device_code'
    AND device.enrollment_generation = p_enrollment_generation
    AND device.status = 'ACTIVE'
    AND device.asset_verified_at IS NOT NULL
    AND device.asset_verified_by IS NOT NULL
    AND length(btrim(COALESCE(device.serial_number, ''))) BETWEEN 5 AND 64
    AND COALESCE(device.imei, '') ~ '^[0-9]{15}$'
    AND device.metadata->>'official_hardware_profile' IN (
      'SAMSUNG_TAB_S10_LITE_5G_128',
      'HONOR_PAD_X8B_LTE_256'
    )
    AND branch.status::TEXT = 'ACTIVE'
    AND tenant.status::TEXT = 'ACTIVE'
  FOR SHARE OF device, branch, tenant;
  IF NOT FOUND
    OR v_payment.sale_payload->>'fiuu_device_id' IS DISTINCT FROM p_device_id::TEXT
    OR v_payment.sale_payload->>'fiuu_enrollment_generation'
      IS DISTINCT FROM p_enrollment_generation::TEXT THEN
    RAISE EXCEPTION 'Fiuu VT payment requires this branch current verified official tablet';
  END IF;

  IF v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW' THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'review_state', v_payment.fiuu_vt_reconciliation_state,
      'reused', true
    );
  END IF;

  v_expired_at := COALESCE(
    v_payment.expires_at,
    v_payment.created_at + INTERVAL '15 minutes'
  );
  IF v_payment.status <> 'PENDING'
    OR v_payment.fiuu_vt_review_required
    OR v_payment.transaction_id IS NOT NULL
    OR v_payment.paid_at IS NOT NULL
    OR v_payment.provider_transaction_id IS NOT NULL
    OR v_payment.provider_sale_reported_at IS NOT NULL
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
    RAISE EXCEPTION 'Fiuu VT payment is not eligible to be quarantined';
  END IF;

  -- Lock every existing callback row after the shift/payment locks. A callback
  -- claim uses the same order, so neither side can observe a half decision.
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
  ) THEN
    RAISE EXCEPTION 'A Fiuu VT callback is still being processed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.result_json IS NOT NULL
      AND jsonb_typeof(attempt.result_json) = 'object'
      AND attempt.result_json->>'kind' IS DISTINCT FROM 'ERROR'
      AND attempt.result_json->>'status' = '00'
      AND attempt.op_type IN ('SALE', 'STATUS')
  ) THEN
    RAISE EXCEPTION 'Fiuu VT success evidence exists and cannot be quarantined';
  END IF;

  v_event := jsonb_build_object(
    'eventType', 'PROVIDER_STATUS_ERROR_QUARANTINED',
    'actorId', p_actor_id,
    'deviceId', p_device_id,
    'enrollmentGeneration', p_enrollment_generation,
    'quarantinedAt', v_now,
    'expiredAt', v_expired_at,
    'errorCode', v_payment.fiuu_vt_provider_error_code,
    'errorCount', v_payment.fiuu_vt_provider_error_count,
    'lastErrorAt', v_payment.fiuu_vt_provider_error_at,
    'providerResult', v_payment.provider_result
  );

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      result_json = COALESCE(result_json, v_event),
      quarantined_at = COALESCE(quarantined_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED');

  UPDATE public.pos_online_payments
  SET status = 'QUARANTINED',
      failed_at = NULL,
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW',
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        fiuu_vt_review_evidence,
        v_event
      ),
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = v_now
  WHERE id = v_payment.id;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_payment.organization_id,
    p_actor_id,
    'FIUU_VT_PAYMENT_QUARANTINED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object(
      'status', 'QUARANTINED',
      'reviewState', 'PROVIDER_ERROR_REVIEW',
      'errorCode', v_payment.fiuu_vt_provider_error_code,
      'errorCount', v_payment.fiuu_vt_provider_error_count
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'QUARANTINED',
    'review_state', 'PROVIDER_ERROR_REVIEW',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_provider_error(
  UUID, UUID, UUID, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.park_pos_fiuu_vt_provider_error(
  UUID, UUID, UUID, INTEGER
) TO service_role;

-- Finance/HQ is the only authority that can turn an ambiguous quarantine into
-- either a cancelled intent or an exactly-once completed sale.
CREATE OR REPLACE FUNCTION public.resolve_pos_fiuu_vt_provider_error(
  p_payment_id UUID,
  p_actor_id UUID,
  p_outcome TEXT,
  p_provider_transaction_id TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift public.pos_shifts%ROWTYPE;
  v_payment public.pos_online_payments%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event JSONB;
  v_result JSONB;
  v_transaction_id UUID;
BEGIN
  IF p_outcome NOT IN ('CONFIRMED_NOT_CHARGED', 'CONFIRMED_CHARGED') THEN
    RAISE EXCEPTION 'Invalid Fiuu VT review outcome';
  END IF;
  IF length(btrim(COALESCE(p_notes, ''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Finance review note must contain 5 to 1000 characters';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  SELECT * INTO v_shift
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
    RAISE EXCEPTION 'Fiuu VT payment changed during Finance review';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id
    AND organization_id = v_payment.organization_id
    AND status = 'ACTIVE'
    AND role::TEXT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Finance or administrator profile is required';
  END IF;

  IF v_payment.status IN ('PAID', 'CANCELLED')
    AND NOT v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_review_resolution = p_outcome THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'resolution', v_payment.fiuu_vt_review_resolution,
      'transaction_id', v_payment.transaction_id,
      'reused', true
    );
  END IF;

  IF v_payment.status <> 'QUARANTINED'
    OR NOT v_payment.fiuu_vt_review_required
    OR v_payment.fiuu_vt_reconciliation_state NOT IN (
      'PROVIDER_ERROR_REVIEW',
      'LATE_SUCCESS_REVIEW'
    ) THEN
    RAISE EXCEPTION 'Fiuu VT payment is not awaiting provider-error review';
  END IF;
  IF v_payment.transaction_id IS NOT NULL OR v_payment.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Fiuu VT payment already has a completed sale';
  END IF;

  IF p_outcome = 'CONFIRMED_NOT_CHARGED' THEN
    IF v_payment.fiuu_vt_reconciliation_state = 'LATE_SUCCESS_REVIEW'
      OR v_payment.provider_transaction_id IS NOT NULL
      OR v_payment.provider_sale_reported_at IS NOT NULL THEN
      RAISE EXCEPTION 'Success or SALE evidence exists; Finance cannot mark this payment not charged';
    END IF;

    v_event := jsonb_build_object(
      'eventType', 'PROVIDER_ERROR_RESOLVED_NOT_CHARGED',
      'resolvedAt', v_now,
      'resolvedBy', p_actor_id,
      'notes', btrim(p_notes)
    );

    UPDATE public.pos_online_payments
    SET status = 'CANCELLED',
        failed_at = v_now,
        fiuu_vt_review_required = false,
        fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_RESOLVED_NOT_CHARGED',
        fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
          fiuu_vt_review_evidence,
          v_event
        ),
        fiuu_vt_review_resolved_at = v_now,
        fiuu_vt_review_resolved_by = p_actor_id,
        fiuu_vt_review_resolution = p_outcome,
        fiuu_vt_review_resolution_note = btrim(p_notes),
        updated_at = v_now
    WHERE id = v_payment.id;
  ELSE
    IF v_shift.status <> 'OPEN' THEN
      RAISE EXCEPTION 'The original POS shift must remain open to complete a confirmed charge';
    END IF;
    IF COALESCE(p_provider_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' THEN
      RAISE EXCEPTION 'A valid Fiuu transaction reference is required';
    END IF;
    IF v_payment.provider_transaction_id IS NOT NULL
      AND v_payment.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id THEN
      RAISE EXCEPTION 'Fiuu transaction reference does not match existing evidence';
    END IF;

    v_result := public.process_pos_sale_internal(
      v_payment.created_by,
      v_payment.shift_id,
      v_payment.branch_id,
      v_payment.sale_payload->'items',
      (v_payment.sale_payload->>'payment_method')::payment_method,
      COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0),
      COALESCE((v_payment.sale_payload->>'qr_amount')::NUMERIC, 0),
      COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0),
      NULLIF(v_payment.sale_payload->>'offline_id', ''),
      NULLIF(v_payment.sale_payload->>'receipt_email', ''),
      NULLIF(v_payment.sale_payload->>'receipt_phone', '')
    );
    v_transaction_id := (v_result->>'transaction_id')::UUID;

    v_event := jsonb_build_object(
      'eventType', 'PROVIDER_ERROR_RESOLVED_CHARGED',
      'resolvedAt', v_now,
      'resolvedBy', p_actor_id,
      'providerTransactionId', p_provider_transaction_id,
      'transactionId', v_transaction_id,
      'notes', btrim(p_notes)
    );

    UPDATE public.pos_online_payments
    SET status = 'PAID',
        provider_transaction_id = p_provider_transaction_id,
        provider_confirmed_at = v_now,
        provider_confirmed_by = p_actor_id,
        gateway_ref = p_provider_transaction_id,
        transaction_id = v_transaction_id,
        paid_at = v_now,
        failed_at = NULL,
        fiuu_vt_review_required = false,
        fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_RESOLVED_CHARGED',
        fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
          fiuu_vt_review_evidence,
          v_event
        ),
        fiuu_vt_review_resolved_at = v_now,
        fiuu_vt_review_resolved_by = p_actor_id,
        fiuu_vt_review_resolution = p_outcome,
        fiuu_vt_review_resolution_note = btrim(p_notes),
        fiuu_vt_recovery_next_at = NULL,
        fiuu_vt_recovery_last_error = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_payment.organization_id,
    p_actor_id,
    'FIUU_VT_PROVIDER_ERROR_RESOLVED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object(
      'status', v_payment.status,
      'reviewState', v_payment.fiuu_vt_reconciliation_state
    ),
    jsonb_build_object(
      'outcome', p_outcome,
      'providerTransactionId', p_provider_transaction_id,
      'transactionId', v_transaction_id,
      'notes', btrim(p_notes)
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', CASE
      WHEN p_outcome = 'CONFIRMED_CHARGED' THEN 'PAID'
      ELSE 'CANCELLED'
    END,
    'resolution', p_outcome,
    'transaction_id', v_transaction_id,
    'result', v_result,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_pos_fiuu_vt_provider_error(
  UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pos_fiuu_vt_provider_error(
  UUID, UUID, TEXT, TEXT, TEXT
) TO service_role;

-- Only active checkout states participate in per-cashier/per-device uniqueness.
-- A quarantined review is evidence, not a live checkout lane.
DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_actor_shift;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_actor_shift
  ON public.pos_online_payments(organization_id, branch_id, shift_id, created_by)
  WHERE provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
    AND status IN ('PENDING', 'REPORTED');

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
    AND NULLIF(sale_payload->>'fiuu_device_code', '') IS NOT NULL;

-- Preserve the official tablet identity while any quarantined payment is
-- unresolved, so Finance evidence cannot be detached from its physical lane.
CREATE OR REPLACE FUNCTION public.guard_pos_device_unresolved_fiuu_vt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_has_unresolved BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_online_payments AS payment
    WHERE payment.provider = 'fiuu_vt'
      AND (
        payment.status IN ('PENDING', 'REPORTED')
        OR (
          payment.status = 'QUARANTINED'
          AND payment.fiuu_vt_review_required
        )
      )
      AND payment.organization_id = OLD.organization_id
      AND payment.branch_id = OLD.branch_id
      AND (
        payment.sale_payload->>'fiuu_device_id' = OLD.id::TEXT
        OR (
          NULLIF(payment.sale_payload->>'fiuu_device_id', '') IS NULL
          AND payment.sale_payload->>'fiuu_device_code' = OLD.device_code
        )
      )
  ) INTO v_has_unresolved;

  IF NOT v_has_unresolved THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'A tablet with unresolved Fiuu VT payments cannot be deleted';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.device_code IS DISTINCT FROM OLD.device_code
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash
    OR NEW.enrollment_code_hash IS DISTINCT FROM OLD.enrollment_code_hash
    OR NEW.enrollment_generation IS DISTINCT FROM OLD.enrollment_generation
    OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
    OR NEW.imei IS DISTINCT FROM OLD.imei
    OR NEW.asset_verified_at IS DISTINCT FROM OLD.asset_verified_at
    OR NEW.asset_verified_by IS DISTINCT FROM OLD.asset_verified_by
    OR NEW.metadata->>'official_hardware_profile'
      IS DISTINCT FROM OLD.metadata->>'official_hardware_profile' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Tablet identity cannot change while a Fiuu VT payment is unresolved';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_device_unresolved_fiuu_vt()
  FROM PUBLIC, anon, authenticated;

-- Quarantined rows must be resolved before shift close. This ensures a
-- confirmed charge can still be fulfilled against its original shift exactly
-- once, without silently moving stock or revenue to a later day.
CREATE OR REPLACE FUNCTION public.guard_pos_shift_close_pending_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'OPEN' AND NEW.status = 'CLOSED' THEN
    PERFORM payment.id
    FROM public.pos_online_payments AS payment
    WHERE payment.organization_id = OLD.organization_id
      AND payment.branch_id = OLD.branch_id
      AND payment.shift_id = OLD.id
      AND (
        payment.status = 'REPORTED'
        OR (
          payment.provider = 'fiuu'
          AND (
            payment.status IN ('PENDING', 'REPORTED')
            OR (
              payment.status = 'EXPIRED'
              AND payment.expires_at IS NOT NULL
              AND payment.expires_at + INTERVAL '20 minutes' > now()
            )
          )
        )
        OR (
          payment.provider <> 'fiuu'
          AND payment.status = 'PENDING'
          AND COALESCE(payment.expires_at, 'infinity'::TIMESTAMPTZ) > now()
        )
        OR (
          payment.provider IN ('fiuu_vt', 'fiuu_cloudecr')
          AND payment.status IN ('PENDING', 'EXPIRED')
          AND payment.expires_at IS NOT NULL
          AND payment.expires_at + INTERVAL '20 minutes' > now()
        )
        OR (
          payment.provider = 'fiuu_vt'
          AND payment.status = 'QUARANTINED'
          AND payment.fiuu_vt_review_required
        )
      )
    ORDER BY payment.id
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'POS shift cannot close while a Fiuu payment remains unresolved';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;

-- Migrate any row created by the short-lived unsafe implementation into the
-- explicit quarantine state without erasing its existing evidence.
UPDATE public.pos_online_payments
SET status = 'QUARANTINED',
    failed_at = NULL,
    updated_at = clock_timestamp()
WHERE provider = 'fiuu_vt'
  AND status = 'CANCELLED'
  AND fiuu_vt_review_required
  AND fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW'
  AND transaction_id IS NULL
  AND paid_at IS NULL;

