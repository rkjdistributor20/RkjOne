-- Keep the Fiuu VT cashier flow recoverable across app-launch failures,
-- process death and late provider callbacks.  PREPARED means the server has
-- issued a one-time callback identity; LAUNCHED means Android confirmed that
-- the provider activity was opened; ABANDONED is reserved for a proven
-- pre-launch failure and is therefore safe to retry.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_fiuu_vt_attempts
  ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS launch_error_code TEXT;

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_state_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_state_check CHECK (
    state IN (
      'PREPARED',
      'LAUNCHED',
      'RECEIVED',
      'CONSUMED',
      'QUARANTINED',
      'EXPIRED',
      'ABANDONED'
    )
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_state_check;

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_state_timestamp_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_state_timestamp_check CHECK (
    (state <> 'LAUNCHED' OR launched_at IS NOT NULL)
    AND (state <> 'RECEIVED' OR received_at IS NOT NULL)
    AND (state <> 'CONSUMED' OR consumed_at IS NOT NULL)
    AND (state <> 'QUARANTINED' OR quarantined_at IS NOT NULL)
    AND (state <> 'EXPIRED' OR expired_at IS NOT NULL)
    AND (state <> 'ABANDONED' OR abandoned_at IS NOT NULL)
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_state_timestamp_check;

ALTER TABLE public.pos_fiuu_vt_attempts
  DROP CONSTRAINT IF EXISTS pos_fiuu_vt_attempts_launch_error_code_check;
ALTER TABLE public.pos_fiuu_vt_attempts
  ADD CONSTRAINT pos_fiuu_vt_attempts_launch_error_code_check CHECK (
    launch_error_code IS NULL
    OR launch_error_code ~ '^[A-Z0-9_]{3,64}$'
  ) NOT VALID;
ALTER TABLE public.pos_fiuu_vt_attempts
  VALIDATE CONSTRAINT pos_fiuu_vt_attempts_launch_error_code_check;

DROP INDEX IF EXISTS public.idx_pos_fiuu_vt_attempts_one_active_operation;
CREATE UNIQUE INDEX idx_pos_fiuu_vt_attempts_one_active_operation
  ON public.pos_fiuu_vt_attempts(payment_id, op_type)
  WHERE state IN ('PREPARED', 'LAUNCHED', 'RECEIVED');

DROP INDEX IF EXISTS public.idx_pos_fiuu_vt_attempts_expiry;
CREATE INDEX idx_pos_fiuu_vt_attempts_expiry
  ON public.pos_fiuu_vt_attempts(expires_at)
  WHERE state IN ('PREPARED', 'LAUNCHED', 'RECEIVED');

-- A review record is evidence, not an active checkout.  Keeping review rows in
-- the active-payment uniqueness predicates stranded the cashier forever and
-- could also make a late callback update fail with a unique violation.  Active
-- PENDING/REPORTED payments remain strictly one-per-cashier and one-per-device.
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

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_fiuu_vt_review_queue
  ON public.pos_online_payments(organization_id, branch_id, updated_at DESC)
  WHERE provider = 'fiuu_vt' AND fiuu_vt_review_required;

-- Quarantine evidence atomically.  If the same cashier/device has already
-- started a replacement checkout when a late success arrives, pause that
-- replacement as well so staff cannot accidentally collect two payments.
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
  v_payment public.pos_online_payments%ROWTYPE;
  v_related_count INTEGER := 0;
  v_device_code TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_state NOT IN (
    'LATE_SUCCESS_REVIEW',
    'REVERSAL_REVIEW',
    'FOREIGN_CALLBACK_REVIEW'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT review state';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'Fiuu VT review evidence must be an object';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  v_device_code := NULLIF(v_payment.sale_payload->>'fiuu_device_code', '');

  UPDATE public.pos_online_payments
  SET fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = p_evidence,
      updated_at = v_now
  WHERE id = v_payment.id;

  UPDATE public.pos_online_payments candidate
  SET fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = p_state,
      fiuu_vt_review_evidence = jsonb_build_object(
        'reason', 'RELATED_ACTIVE_PAYMENT_AT_REVIEW',
        'sourcePaymentId', v_payment.id,
        'observedAt', v_now,
        'sourceEvidence', p_evidence
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

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'related_active_payments', v_related_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)
  TO service_role;
