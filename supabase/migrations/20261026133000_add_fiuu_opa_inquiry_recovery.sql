-- BR001-only Fiuu OPA inquiry recovery.
--
-- This migration does not enable OPA, change any environment variable, or
-- activate another branch. It gives the server an idempotent, leased inquiry
-- workflow for a missing callback. Automatic reversal remains deliberately
-- disabled until Fiuu confirms paymentReferenceId and retry semantics.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS fiuu_opa_reconcile_state TEXT,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reconcile_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reconcile_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reconcile_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reconcile_claim_token UUID,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reconcile_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reversal_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS fiuu_opa_reversed_at TIMESTAMPTZ;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_opa_reconcile_state_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_opa_reconcile_state_check CHECK (
    fiuu_opa_reconcile_state IS NULL
    OR fiuu_opa_reconcile_state IN (
      'WAITING',
      'INQUIRING',
      'WAITING_FOR_EXPIRY',
      'AWAITING_REVERSAL',
      'MANUAL_REVIEW',
      'REVERSED',
      'SUCCEEDED',
      'FAILED'
    )
  );

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_opa_attempt_count_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_opa_attempt_count_check CHECK (
    fiuu_opa_reconcile_attempt_count BETWEEN 0 AND 6
  );

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_opa_reversal_reference_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_opa_reversal_reference_check CHECK (
    fiuu_opa_reversal_reference_id IS NULL
    OR fiuu_opa_reversal_reference_id ~ '^[A-Za-z0-9_-]{4,40}$'
  );

-- The application-level guard is helpful, but a database backstop prevents two
-- concurrent requests from opening a second unresolved OPA intent on the same
-- physical BR001 terminal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_fiuu_opa_active_terminal
  ON public.pos_online_payments (
    organization_id,
    (sale_payload->>'fiuu_store_id'),
    (sale_payload->>'fiuu_terminal_id')
  )
  WHERE provider = 'fiuu'
    AND status IN ('PENDING', 'REPORTED')
    AND NULLIF(sale_payload->>'fiuu_store_id', '') IS NOT NULL
    AND NULLIF(sale_payload->>'fiuu_terminal_id', '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pos_fiuu_opa_reconciliation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL
    REFERENCES public.pos_online_payments(id) ON DELETE CASCADE,
  claim_token UUID NOT NULL UNIQUE,
  operation TEXT NOT NULL DEFAULT 'INQUIRY'
    CHECK (operation IN ('INQUIRY', 'REVERSAL')),
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 6),
  request_reference_id TEXT NOT NULL
    CHECK (request_reference_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  payment_reference_id TEXT,
  state TEXT NOT NULL DEFAULT 'CLAIMED'
    CHECK (state IN (
      'CLAIMED',
      'PENDING',
      'SUCCEEDED',
      'FAILED',
      'UNKNOWN',
      'INVALID',
      'SUPERSEDED',
      'REVERSED'
    )),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  provider_status_code TEXT,
  provider_transaction_id TEXT,
  provider_result JSONB,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, operation, attempt_no),
  CHECK (
    payment_reference_id IS NULL
    OR payment_reference_id ~ '^[A-Za-z0-9_-]{1,40}$'
  ),
  CHECK (
    provider_status_code IS NULL
    OR provider_status_code ~ '^[0-9]{2}$'
  ),
  CHECK (
    provider_transaction_id IS NULL
    OR (
      length(provider_transaction_id) BETWEEN 1 AND 40
      AND provider_transaction_id !~ '[[:cntrl:]]'
    )
  ),
  CHECK (
    failure_code IS NULL
    OR failure_code ~ '^[A-Z0-9_]{1,64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_pos_fiuu_opa_reconciliation_payment
  ON public.pos_fiuu_opa_reconciliation_attempts(payment_id, attempt_no DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_fiuu_opa_live_claim
  ON public.pos_fiuu_opa_reconciliation_attempts(payment_id)
  WHERE state = 'CLAIMED';

ALTER TABLE public.pos_fiuu_opa_reconciliation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_fiuu_opa_reconciliation_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_fiuu_opa_reconciliation_attempts
  TO service_role;

-- Preserve the exact signed response lexical form used by the application HMAC
-- verifier. This table is service-role-only because provider responses may
-- contain fields that should not be exposed through ordinary payment reads.
CREATE TABLE IF NOT EXISTS public.pos_fiuu_opa_signed_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL
    REFERENCES public.pos_online_payments(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('CALLBACK', 'INQUIRY')),
  claim_token UUID,
  provider_transaction_id TEXT NOT NULL
    CHECK (
      length(provider_transaction_id) BETWEEN 1 AND 40
      AND provider_transaction_id !~ '[[:cntrl:]]'
    ),
  status_code TEXT NOT NULL CHECK (status_code ~ '^[0-9]{2}$'),
  signed_response_raw TEXT NOT NULL
    CHECK (octet_length(signed_response_raw) BETWEEN 2 AND 65536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, source, provider_transaction_id, status_code)
);

ALTER TABLE public.pos_fiuu_opa_signed_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_fiuu_opa_signed_evidence
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_fiuu_opa_signed_evidence
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_opa_inquiry(
  p_payment_id UUID,
  p_claim_token UUID,
  p_lease_seconds INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_status TEXT;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt_no INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_payment_id IS NULL
    OR p_claim_token IS NULL
    OR p_lease_seconds < 20
    OR p_lease_seconds > 60 THEN
    RAISE EXCEPTION 'Invalid Fiuu OPA inquiry claim';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT shift.status::TEXT, upper(btrim(branch.branch_code))
  INTO v_shift_status, v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;
  IF NOT FOUND THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'MANUAL_REVIEW',
        fiuu_opa_reconcile_next_at = NULL,
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = p_payment_id
      AND provider = 'fiuu'
      AND sale_payload->>'fiuu_branch_code' = 'BR001';
    RETURN NULL;
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RETURN NULL;
  END IF;

  IF v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_branch_code IS DISTINCT FROM 'BR001'
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT
    OR NULLIF(v_payment.sale_payload->>'fiuu_device_code', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_application_code', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_store_id', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_terminal_id', '') IS NULL
    OR v_shift_status IS DISTINCT FROM 'OPEN'
    OR v_payment.expires_at IS NULL THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'MANUAL_REVIEW',
        fiuu_opa_reconcile_next_at = NULL,
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
    RETURN NULL;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'PENDING' THEN
    RETURN NULL;
  END IF;

  IF v_payment.fiuu_opa_reconcile_state IN (
    'AWAITING_REVERSAL', 'MANUAL_REVIEW', 'SUCCEEDED', 'FAILED', 'REVERSED'
  ) THEN
    RETURN NULL;
  END IF;
  IF v_payment.fiuu_opa_reconcile_lease_expires_at IS NOT NULL
    AND v_payment.fiuu_opa_reconcile_lease_expires_at > v_now THEN
    RETURN NULL;
  END IF;
  IF v_payment.fiuu_opa_reconcile_next_at IS NOT NULL
    AND v_payment.fiuu_opa_reconcile_next_at > v_now THEN
    RETURN NULL;
  END IF;

  -- Close a crashed/expired lease before checking the six-attempt cap. This
  -- prevents a stale sixth CLAIMED row from blocking later Finance handling.
  UPDATE public.pos_fiuu_opa_reconciliation_attempts
  SET state = 'UNKNOWN',
      failure_code = COALESCE(failure_code, 'LEASE_EXPIRED'),
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state = 'CLAIMED'
    AND lease_expires_at <= v_now;

  -- A normal callback is allowed to arrive while the QR is valid. Inquiry
  -- begins only after display expiry, then runs at most six times ten seconds
  -- apart. Reversal is never issued by this function.
  IF v_payment.fiuu_opa_reconcile_attempt_count = 0
    AND v_payment.expires_at > v_now THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'WAITING_FOR_EXPIRY',
        fiuu_opa_reconcile_next_at = v_payment.expires_at + INTERVAL '10 seconds',
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
    RETURN NULL;
  END IF;
  IF v_payment.fiuu_opa_reconcile_attempt_count >= 6 THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'AWAITING_REVERSAL',
        fiuu_opa_reconcile_next_at = NULL,
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
    RETURN NULL;
  END IF;

  v_attempt_no := v_payment.fiuu_opa_reconcile_attempt_count + 1;

  INSERT INTO public.pos_fiuu_opa_reconciliation_attempts (
    payment_id,
    claim_token,
    operation,
    attempt_no,
    request_reference_id,
    state,
    claimed_at,
    lease_expires_at
  ) VALUES (
    v_payment.id,
    p_claim_token,
    'INQUIRY',
    v_attempt_no,
    v_payment.id::TEXT,
    'CLAIMED',
    v_now,
    v_now + make_interval(secs => p_lease_seconds)
  );

  UPDATE public.pos_online_payments
  SET fiuu_opa_reconcile_state = 'INQUIRING',
      fiuu_opa_reconcile_started_at = COALESCE(fiuu_opa_reconcile_started_at, v_now),
      fiuu_opa_reconcile_next_at = NULL,
      fiuu_opa_reconcile_attempt_count = v_attempt_no,
      fiuu_opa_reconcile_claim_token = p_claim_token,
      fiuu_opa_reconcile_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      provider_status_checked_at = v_now,
      updated_at = v_now
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'claim_token', p_claim_token,
    'attempt_no', v_attempt_no,
    'branch_code', 'BR001',
    'device_code', v_payment.sale_payload->>'fiuu_device_code',
    'application_code', v_payment.sale_payload->>'fiuu_application_code',
    'gateway_ref', NULLIF(v_payment.gateway_ref, ''),
    'amount_rm', v_payment.amount_rm,
    'expires_at', v_payment.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_opa_inquiry(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_opa_inquiry(UUID, UUID, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pos_fiuu_opa_inquiry(
  p_payment_id UUID,
  p_claim_token UUID,
  p_outcome TEXT,
  p_status_code TEXT DEFAULT NULL,
  p_provider_result JSONB DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_opa_reconciliation_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_next_state TEXT;
  v_next_at TIMESTAMPTZ;
  v_attempt_state TEXT;
  v_amount_text TEXT;
BEGIN
  IF p_payment_id IS NULL
    OR p_claim_token IS NULL
    OR p_outcome NOT IN ('PENDING', 'FAILED', 'UNKNOWN', 'INVALID', 'SUCCEEDED')
    OR (p_failure_code IS NOT NULL AND p_failure_code !~ '^[A-Z0-9_]{1,64}$') THEN
    RAISE EXCEPTION 'Invalid Fiuu OPA inquiry completion';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA payment not found';
  END IF;

  SELECT upper(btrim(branch.branch_code)) INTO v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_branch_code IS DISTINCT FROM 'BR001'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION 'Fiuu OPA payment not eligible for inquiry completion';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_opa_reconciliation_attempts
  WHERE payment_id = p_payment_id
    AND claim_token = p_claim_token
    AND operation = 'INQUIRY'
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.state IS DISTINCT FROM 'CLAIMED' THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;
  IF v_payment.fiuu_opa_reconcile_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;

  IF v_payment.status IN ('REPORTED', 'PAID') AND p_outcome <> 'SUCCEEDED' THEN
    v_attempt_state := 'SUPERSEDED';
    v_next_state := 'SUCCEEDED';
    v_next_at := NULL;
  ELSIF p_outcome = 'SUCCEEDED' THEN
    IF v_payment.status NOT IN ('REPORTED', 'PAID') THEN
      RAISE EXCEPTION 'Fiuu OPA success report has not been committed';
    END IF;
    v_attempt_state := 'SUCCEEDED';
    v_next_state := 'SUCCEEDED';
    v_next_at := NULL;
  ELSIF p_outcome IN ('PENDING', 'FAILED') THEN
    IF p_provider_result IS NULL
      OR jsonb_typeof(p_provider_result) IS DISTINCT FROM 'object'
      OR p_provider_result - ARRAY[
        'applicationCode',
        'referenceId',
        'molTransactionId',
        'amount',
        'currencyCode',
        'channelId',
        'statusCode',
        'signature',
        'signedResponseRaw'
      ] <> '{}'::JSONB
      OR p_provider_result->>'applicationCode'
        IS DISTINCT FROM v_payment.sale_payload->>'fiuu_application_code'
      OR lower(COALESCE(p_provider_result->>'referenceId', ''))
        IS DISTINCT FROM v_payment.id::TEXT
      OR NULLIF(p_provider_result->>'molTransactionId', '') IS NULL
      OR (
        NULLIF(v_payment.gateway_ref, '') IS NOT NULL
        AND p_provider_result->>'molTransactionId' IS DISTINCT FROM v_payment.gateway_ref
      )
      OR p_provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
      OR p_provider_result->>'channelId' IS DISTINCT FROM '24'
      OR p_provider_result->>'statusCode' IS DISTINCT FROM p_status_code
      OR COALESCE(p_provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$'
      OR jsonb_typeof(p_provider_result->'signedResponseRaw') IS DISTINCT FROM 'string'
      OR length(p_provider_result->>'signedResponseRaw') NOT BETWEEN 2 AND 65536 THEN
      RAISE EXCEPTION 'Fiuu OPA signed inquiry evidence is invalid';
    END IF;
    v_amount_text := COALESCE(p_provider_result->>'amount', '');
    IF v_amount_text !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
      OR v_amount_text::NUMERIC IS DISTINCT FROM v_payment.amount_rm THEN
      RAISE EXCEPTION 'Fiuu OPA signed inquiry evidence is invalid';
    END IF;
    IF p_outcome = 'PENDING' AND p_status_code NOT IN ('01', '11') THEN
      RAISE EXCEPTION 'Fiuu OPA pending inquiry status is invalid';
    END IF;
    IF p_outcome = 'FAILED' AND p_status_code IS DISTINCT FROM '99' THEN
      RAISE EXCEPTION 'Fiuu OPA failed inquiry status is invalid';
    END IF;
    IF NULLIF(v_payment.gateway_ref, '') IS NULL THEN
      UPDATE public.pos_online_payments
      SET gateway_ref = p_provider_result->>'molTransactionId',
          updated_at = v_now
      WHERE id = v_payment.id
        AND NULLIF(gateway_ref, '') IS NULL;
      v_payment.gateway_ref := p_provider_result->>'molTransactionId';
    END IF;
  END IF;

  IF v_attempt_state IS NULL THEN
    v_attempt_state := p_outcome;
    IF p_outcome = 'FAILED' THEN
      v_next_state := 'FAILED';
      v_next_at := NULL;
      UPDATE public.pos_online_payments
      SET status = 'FAILED',
          provider_result = p_provider_result,
          failed_at = v_now,
          provider_status_checked_at = v_now,
          updated_at = v_now
      WHERE id = v_payment.id
        AND status = 'PENDING';
    ELSIF p_outcome = 'INVALID' THEN
      v_next_state := 'MANUAL_REVIEW';
      v_next_at := NULL;
    ELSIF v_attempt.attempt_no >= 6 THEN
      v_next_state := 'AWAITING_REVERSAL';
      v_next_at := NULL;
    ELSE
      v_next_state := 'WAITING';
      v_next_at := v_now + INTERVAL '10 seconds';
    END IF;
  END IF;

  UPDATE public.pos_fiuu_opa_reconciliation_attempts
  SET state = v_attempt_state,
      completed_at = v_now,
      provider_status_code = p_status_code,
      provider_transaction_id = CASE
        WHEN p_provider_result IS NULL THEN NULL
        ELSE NULLIF(p_provider_result->>'molTransactionId', '')
      END,
      provider_result = p_provider_result,
      failure_code = p_failure_code,
      updated_at = v_now
  WHERE id = v_attempt.id;

  UPDATE public.pos_online_payments
  SET fiuu_opa_reconcile_state = v_next_state,
      fiuu_opa_reconcile_next_at = v_next_at,
      fiuu_opa_reconcile_claim_token = NULL,
      fiuu_opa_reconcile_lease_expires_at = NULL,
      provider_status_checked_at = v_now,
      updated_at = v_now
  WHERE id = v_payment.id
    AND fiuu_opa_reconcile_claim_token = p_claim_token;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'attempt_no', v_attempt.attempt_no,
    'attempt_state', v_attempt_state,
    'reconcile_state', v_next_state,
    'next_at', v_next_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pos_fiuu_opa_inquiry(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_fiuu_opa_inquiry(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT
) TO service_role;

-- Fiuu permits inquiry for up to 60 minutes. Keep a bounded five-minute
-- processing margin while the database uniqueness and shift-close guards
-- continue preventing a second payable OPA intent.
CREATE OR REPLACE FUNCTION public.report_pos_fiuu_payment(
  p_payment_id UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT,
  p_status_code TEXT,
  p_provider_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_shift_status TEXT;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_gateway_ref TEXT := btrim(COALESCE(p_gateway_ref, ''));
  v_provider_amount_text TEXT;
  v_provider_amount NUMERIC;
  v_expiry_grace CONSTANT INTERVAL := INTERVAL '65 minutes';
  v_legacy_expired_grace CONSTANT INTERVAL := INTERVAL '20 minutes';
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu POS payment reference is required';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  SELECT shift.organization_id, shift.branch_id, shift.status::TEXT,
         upper(btrim(branch.branch_code))
  INTO v_shift_organization_id, v_shift_branch_id, v_shift_status,
       v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.organization_id IS DISTINCT FROM v_shift_organization_id
    OR v_payment.branch_id IS DISTINCT FROM v_shift_branch_id
    OR v_branch_code IS DISTINCT FROM 'BR001'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001'
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  IF v_gateway_ref = ''
    OR length(v_gateway_ref) > 40
    OR v_gateway_ref ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Fiuu transaction reference mismatch';
  END IF;
  IF NULLIF(v_payment.gateway_ref, '') IS NULL
    AND v_payment.status IN ('PENDING', 'EXPIRED') THEN
    UPDATE public.pos_online_payments
    SET gateway_ref = v_gateway_ref,
        updated_at = now()
    WHERE id = v_payment.id
      AND NULLIF(gateway_ref, '') IS NULL;
    v_payment.gateway_ref := v_gateway_ref;
  ELSIF v_gateway_ref IS DISTINCT FROM v_payment.gateway_ref THEN
    RAISE EXCEPTION 'Fiuu transaction reference mismatch';
  END IF;
  IF p_amount IS NULL
    OR p_amount <= 0
    OR p_amount <> v_payment.amount_rm THEN
    RAISE EXCEPTION 'Fiuu POS payment amount mismatch';
  END IF;
  IF p_currency IS DISTINCT FROM 'MYR' THEN
    RAISE EXCEPTION 'Fiuu POS payment currency mismatch';
  END IF;
  IF p_channel_id IS DISTINCT FROM '24' THEN
    RAISE EXCEPTION 'Fiuu POS payment channel mismatch';
  END IF;
  IF p_status_code IS DISTINCT FROM '00' THEN
    RAISE EXCEPTION 'Fiuu POS payment status mismatch';
  END IF;

  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) IS DISTINCT FROM 'object'
    OR p_provider_result - ARRAY[
      'applicationCode',
      'referenceId',
      'molTransactionId',
      'amount',
      'currencyCode',
      'channelId',
      'statusCode',
      'signature'
    ] <> '{}'::JSONB
    OR NULLIF(btrim(COALESCE(p_provider_result->>'applicationCode', '')), '') IS NULL
    OR length(p_provider_result->>'applicationCode') > 32
    OR p_provider_result->>'applicationCode' ~ '[[:cntrl:]]'
    OR lower(COALESCE(p_provider_result->>'referenceId', ''))
      IS DISTINCT FROM p_payment_id::TEXT
    OR p_provider_result->>'molTransactionId' IS DISTINCT FROM v_gateway_ref
    OR p_provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
    OR p_provider_result->>'channelId' IS DISTINCT FROM '24'
    OR p_provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR COALESCE(p_provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu signed payment evidence is invalid';
  END IF;

  v_provider_amount_text := COALESCE(p_provider_result->>'amount', '');
  IF v_provider_amount_text !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$' THEN
    RAISE EXCEPTION 'Fiuu signed payment evidence is invalid';
  END IF;
  v_provider_amount := v_provider_amount_text::NUMERIC;
  IF v_provider_amount IS DISTINCT FROM v_payment.amount_rm THEN
    RAISE EXCEPTION 'Fiuu signed payment evidence is invalid';
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', 'PAID',
      'transaction_id', v_payment.transaction_id,
      'idempotent_replay', true
    );
  END IF;
  IF v_payment.status NOT IN ('PENDING', 'EXPIRED', 'REPORTED') THEN
    RAISE EXCEPTION 'Fiuu POS payment cannot accept a success report';
  END IF;

  IF v_payment.status = 'REPORTED' THEN
    IF v_payment.provider_transaction_id IS DISTINCT FROM v_gateway_ref
      OR v_payment.provider_sale_reported_at IS NULL
      OR jsonb_typeof(v_payment.provider_result) IS DISTINCT FROM 'object'
      OR lower(COALESCE(v_payment.provider_result->>'referenceId', ''))
        IS DISTINCT FROM p_payment_id::TEXT
      OR v_payment.provider_result->>'molTransactionId' IS DISTINCT FROM v_gateway_ref
      OR v_payment.provider_result->>'amount' IS DISTINCT FROM p_provider_result->>'amount'
      OR v_payment.provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
      OR v_payment.provider_result->>'channelId' IS DISTINCT FROM '24'
      OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00' THEN
      RAISE EXCEPTION 'Fiuu reported payment evidence mismatch';
    END IF;

    UPDATE public.pos_online_payments
    SET provider_status_checked_at = now(),
        updated_at = now()
    WHERE id = v_payment.id
      AND status = 'REPORTED';

    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', 'REPORTED',
      'provider_transaction_id', v_payment.provider_transaction_id,
      'idempotent_replay', true
    );
  END IF;

  IF v_shift_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Fiuu POS payment requires a matching open shift';
  END IF;
  IF v_payment.status = 'EXPIRED'
    AND v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + v_legacy_expired_grace THEN
    RAISE EXCEPTION 'Fiuu POS payment success arrived outside expiry grace';
  END IF;
  IF v_payment.status <> 'EXPIRED'
    AND v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + v_expiry_grace THEN
    RAISE EXCEPTION 'Fiuu POS payment success arrived outside expiry grace';
  END IF;

  UPDATE public.pos_online_payments
  SET status = 'REPORTED',
      provider_transaction_id = v_gateway_ref,
      provider_result = p_provider_result,
      provider_sale_reported_at = now(),
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      gateway_ref = v_gateway_ref,
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id
    AND status IN ('PENDING', 'EXPIRED');

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'REPORTED',
    'provider_transaction_id', v_gateway_ref,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.report_pos_fiuu_payment_with_evidence(
  p_payment_id UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT,
  p_status_code TEXT,
  p_provider_result JSONB,
  p_signed_response_raw TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_signed_response_raw IS NULL
    OR octet_length(p_signed_response_raw) NOT BETWEEN 2 AND 65536 THEN
    RAISE EXCEPTION 'Fiuu signed callback evidence is invalid';
  END IF;

  v_result := public.report_pos_fiuu_payment(
    p_payment_id,
    p_gateway_ref,
    p_amount,
    p_currency,
    p_channel_id,
    p_status_code,
    p_provider_result
  );

  INSERT INTO public.pos_fiuu_opa_signed_evidence (
    payment_id,
    source,
    provider_transaction_id,
    status_code,
    signed_response_raw
  ) VALUES (
    p_payment_id,
    'CALLBACK',
    p_gateway_ref,
    p_status_code,
    p_signed_response_raw
  )
  ON CONFLICT (payment_id, source, provider_transaction_id, status_code)
  DO UPDATE SET last_seen_at = now();

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_payment_with_evidence(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_payment_with_evidence(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.report_pos_fiuu_opa_inquiry_success(
  p_payment_id UUID,
  p_claim_token UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT,
  p_status_code TEXT,
  p_provider_result JSONB,
  p_audit_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_opa_reconciliation_attempts%ROWTYPE;
  v_result JSONB;
  v_raw TEXT;
BEGIN
  IF p_payment_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is required';
  END IF;
  IF p_audit_result IS NULL
    OR jsonb_typeof(p_audit_result) IS DISTINCT FROM 'object'
    OR p_audit_result - 'signedResponseRaw' IS DISTINCT FROM p_provider_result THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry audit evidence is invalid';
  END IF;
  v_raw := p_audit_result->>'signedResponseRaw';
  IF v_raw IS NULL OR octet_length(v_raw) NOT BETWEEN 2 AND 65536 THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry audit evidence is invalid';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA payment not found';
  END IF;

  PERFORM shift.id
  FROM public.pos_shifts AS shift
  WHERE shift.id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;
  SELECT * INTO v_attempt
  FROM public.pos_fiuu_opa_reconciliation_attempts
  WHERE payment_id = p_payment_id
    AND claim_token = p_claim_token
    AND operation = 'INQUIRY'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;
  IF v_attempt.state = 'SUCCEEDED' THEN
    IF v_payment.status NOT IN ('REPORTED', 'PAID')
      OR v_payment.gateway_ref IS DISTINCT FROM p_gateway_ref
      OR v_payment.provider_transaction_id IS DISTINCT FROM p_gateway_ref THEN
      RAISE EXCEPTION 'Fiuu OPA inquiry replay mismatch';
    END IF;
    RETURN public.report_pos_fiuu_payment(
      p_payment_id,
      p_gateway_ref,
      p_amount,
      p_currency,
      p_channel_id,
      p_status_code,
      p_provider_result
    );
  END IF;
  IF v_attempt.state IS DISTINCT FROM 'CLAIMED'
    OR v_payment.fiuu_opa_reconcile_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;
  IF NULLIF(v_payment.gateway_ref, '') IS NULL THEN
    UPDATE public.pos_online_payments
    SET gateway_ref = p_gateway_ref,
        updated_at = now()
    WHERE id = p_payment_id
      AND NULLIF(gateway_ref, '') IS NULL;
  ELSIF v_payment.gateway_ref IS DISTINCT FROM p_gateway_ref THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry transaction reference mismatch';
  END IF;

  v_result := public.report_pos_fiuu_payment(
    p_payment_id,
    p_gateway_ref,
    p_amount,
    p_currency,
    p_channel_id,
    p_status_code,
    p_provider_result
  );

  INSERT INTO public.pos_fiuu_opa_signed_evidence (
    payment_id,
    source,
    claim_token,
    provider_transaction_id,
    status_code,
    signed_response_raw
  ) VALUES (
    p_payment_id,
    'INQUIRY',
    p_claim_token,
    p_gateway_ref,
    p_status_code,
    v_raw
  )
  ON CONFLICT (payment_id, source, provider_transaction_id, status_code)
  DO UPDATE SET last_seen_at = now();

  PERFORM public.complete_pos_fiuu_opa_inquiry(
    p_payment_id,
    p_claim_token,
    'SUCCEEDED',
    p_status_code,
    p_audit_result,
    NULL
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_opa_inquiry_success(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_opa_inquiry_success(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, JSONB
) TO service_role;

-- An OPA payment with unknown outcome must not be released merely because the
-- display QR expired. Keep the shift open until a signed success/failure or a
-- Finance resolution changes the payment status. VT/cloudECR retain their
-- established bounded grace behavior.
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
          AND payment.status = 'PENDING'
        )
        OR (
          payment.provider <> 'fiuu'
          AND payment.status = 'PENDING'
          AND COALESCE(payment.expires_at, 'infinity'::timestamptz) > now()
        )
        OR (
          payment.provider IN ('fiuu_vt', 'fiuu_cloudecr')
          AND payment.status IN ('PENDING', 'EXPIRED')
          AND payment.expires_at IS NOT NULL
          AND payment.expires_at + INTERVAL '20 minutes' > now()
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
