-- Harden Fiuu VT callback and recovery state. Callback attempts are service-only,
-- single-use records; provider evidence timestamps remain immutable when the
-- recovery worker merely defers a retry.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS fiuu_vt_review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fiuu_vt_review_evidence JSONB,
  ADD COLUMN IF NOT EXISTS fiuu_vt_reconciliation_state TEXT,
  ADD COLUMN IF NOT EXISTS fiuu_vt_recovery_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_vt_recovery_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiuu_vt_recovery_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiuu_vt_recovery_last_error TEXT;

-- Keep reruns safe if a partially applied development migration left nullable
-- values behind before the NOT NULL attributes were introduced.
UPDATE public.pos_online_payments
SET fiuu_vt_review_required = false
WHERE fiuu_vt_review_required IS NULL;

UPDATE public.pos_online_payments
SET fiuu_vt_recovery_attempts = 0
WHERE fiuu_vt_recovery_attempts IS NULL;

ALTER TABLE public.pos_online_payments
  ALTER COLUMN fiuu_vt_review_required SET DEFAULT false,
  ALTER COLUMN fiuu_vt_review_required SET NOT NULL,
  ALTER COLUMN fiuu_vt_recovery_attempts SET DEFAULT 0,
  ALTER COLUMN fiuu_vt_recovery_attempts SET NOT NULL;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_reconciliation_state_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_reconciliation_state_check CHECK (
    fiuu_vt_reconciliation_state IS NULL
    OR fiuu_vt_reconciliation_state IN (
      'LATE_SUCCESS_REVIEW',
      'REVERSAL_REVIEW',
      'FOREIGN_CALLBACK_REVIEW'
    )
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_reconciliation_state_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_review_evidence_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_review_evidence_check CHECK (
    fiuu_vt_review_evidence IS NULL
    OR jsonb_typeof(fiuu_vt_review_evidence) = 'object'
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_review_evidence_check;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_recovery_attempts_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_recovery_attempts_check CHECK (
    fiuu_vt_recovery_attempts >= 0
  ) NOT VALID;
ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_recovery_attempts_check;

CREATE TABLE IF NOT EXISTS public.pos_fiuu_vt_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL
    REFERENCES public.pos_online_payments(id) ON DELETE CASCADE,
  provider_order_id TEXT NOT NULL,
  op_type TEXT NOT NULL,
  callback_host TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PREPARED',
  result_fingerprint TEXT,
  result_json JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  quarantined_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pos_fiuu_vt_attempts_callback_host_key UNIQUE (callback_host),
  CONSTRAINT pos_fiuu_vt_attempts_order_format_check CHECK (
    provider_order_id ~ '^[A-Za-z0-9_-]{4,64}$'
  ),
  CONSTRAINT pos_fiuu_vt_attempts_op_type_check CHECK (
    op_type IN ('SALE', 'STATUS', 'VOID')
  ),
  CONSTRAINT pos_fiuu_vt_attempts_callback_host_check CHECK (
    callback_host = lower(callback_host)
    AND callback_host ~ '^a-[a-f0-9]{32}\.fiuu-vt\.rkj\.one$'
  ),
  CONSTRAINT pos_fiuu_vt_attempts_state_check CHECK (
    state IN ('PREPARED', 'RECEIVED', 'CONSUMED', 'QUARANTINED', 'EXPIRED')
  ),
  CONSTRAINT pos_fiuu_vt_attempts_result_fingerprint_check CHECK (
    result_fingerprint IS NULL OR result_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT pos_fiuu_vt_attempts_result_json_check CHECK (
    result_json IS NULL OR jsonb_typeof(result_json) = 'object'
  ),
  CONSTRAINT pos_fiuu_vt_attempts_state_timestamp_check CHECK (
    (state <> 'RECEIVED' OR received_at IS NOT NULL)
    AND (state <> 'CONSUMED' OR consumed_at IS NOT NULL)
    AND (state <> 'QUARANTINED' OR quarantined_at IS NOT NULL)
    AND (state <> 'EXPIRED' OR expired_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_one_active_operation
  ON public.pos_fiuu_vt_attempts(payment_id, op_type)
  WHERE state IN ('PREPARED', 'RECEIVED');

CREATE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_payment_created
  ON public.pos_fiuu_vt_attempts(payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_order_state
  ON public.pos_fiuu_vt_attempts(provider_order_id, op_type, state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_expiry
  ON public.pos_fiuu_vt_attempts(expires_at)
  WHERE state IN ('PREPARED', 'RECEIVED');

DROP TRIGGER IF EXISTS set_updated_at ON public.pos_fiuu_vt_attempts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.pos_fiuu_vt_attempts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.pos_fiuu_vt_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_fiuu_vt_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_fiuu_vt_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_fiuu_vt_attempts
  TO service_role;

-- A late success/reversal/foreign callback requires reconciliation before the
-- same cashier or device may create a replacement payment intent.
DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_actor_shift;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_actor_shift
  ON public.pos_online_payments(organization_id, branch_id, shift_id, created_by)
  WHERE provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
    AND (
      status IN ('PENDING', 'REPORTED')
      OR fiuu_vt_review_required
    );

DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_device;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_device
  ON public.pos_online_payments(
    organization_id,
    branch_id,
    shift_id,
    (sale_payload->>'fiuu_device_code')
  )
  WHERE provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND (
      status IN ('PENDING', 'REPORTED')
      OR fiuu_vt_review_required
    )
    AND NULLIF(sale_payload->>'fiuu_device_code', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_vt_payment(
  p_payment_id UUID,
  p_provider_order_id TEXT,
  p_provider_transaction_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel TEXT,
  p_provider_result JSONB,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_result JSONB;
  v_existing_receipt JSONB;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT POS payment not found';
  END IF;

  -- Keep the established lock order: shift first, payment second.
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
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_vt' THEN
    RAISE EXCEPTION 'Fiuu VT POS payment not found';
  END IF;

  IF v_payment.fiuu_vt_review_required THEN
    RAISE EXCEPTION 'Fiuu VT POS payment requires reconciliation review';
  END IF;

  IF COALESCE(p_provider_order_id, '') !~ '^[A-Za-z0-9_-]{4,64}$'
    OR p_provider_order_id IS DISTINCT FROM v_payment.provider_order_id THEN
    RAISE EXCEPTION 'Fiuu VT order reference mismatch';
  END IF;

  IF COALESCE(p_provider_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$' THEN
    RAISE EXCEPTION 'Fiuu VT transaction reference is invalid';
  END IF;

  IF v_payment.provider_transaction_id IS NOT NULL
    AND p_provider_transaction_id IS DISTINCT FROM v_payment.provider_transaction_id THEN
    RAISE EXCEPTION 'Fiuu VT transaction reference mismatch';
  END IF;

  IF v_payment.provider_sale_reported_at IS NULL
    OR v_payment.provider_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT SALE result is required before STATUS confirmation';
  END IF;

  IF p_confirmed_by IS NULL OR p_confirmed_by IS DISTINCT FROM v_payment.created_by THEN
    RAISE EXCEPTION 'Fiuu VT confirmer does not own the payment intent';
  END IF;

  IF round(v_payment.amount_rm, 2) <> round(p_amount, 2)
    OR upper(COALESCE(p_currency, '')) <> 'MYR'
    OR COALESCE(p_channel, '') <> 'RPP_DuitNowQR-Offline' THEN
    RAISE EXCEPTION 'Fiuu VT payment details mismatch';
  END IF;

  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) <> 'object'
    OR p_provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR p_provider_result->>'status' IS DISTINCT FROM '00'
    OR p_provider_result->>'orderId' IS DISTINCT FROM p_provider_order_id
    OR p_provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
    OR p_provider_result->>'currency' IS DISTINCT FROM 'MYR'
    OR p_provider_result->>'channel' IS DISTINCT FROM 'RPP_DuitNowQR-Offline'
    OR COALESCE(p_provider_result->>'amountRm', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((p_provider_result->>'amountRm')::NUMERIC, 2) <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Fiuu VT STATUS result is not fulfillable';
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    SELECT receipt_data INTO v_existing_receipt
    FROM public.pos_receipts
    WHERE transaction_id = v_payment.transaction_id;
    RETURN COALESCE(
      v_existing_receipt,
      jsonb_build_object('transaction_id', v_payment.transaction_id)
    );
  END IF;

  -- Revalidate the durable row while locked. Deliberately do not reject old
  -- REPORTED evidence solely by age: the immutable SALE/STATUS references,
  -- amount, owner and channel remain the authorization boundary for recovery.
  IF v_payment.provider_status_checked_at IS NULL
    OR v_payment.provider_result IS NULL
    OR jsonb_typeof(v_payment.provider_result) <> 'object'
    OR v_payment.provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR v_payment.provider_result->>'status' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'orderId' IS DISTINCT FROM p_provider_order_id
    OR v_payment.provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
    OR v_payment.provider_result->>'currency' IS DISTINCT FROM 'MYR'
    OR v_payment.provider_result->>'channel' IS DISTINCT FROM 'RPP_DuitNowQR-Offline'
    OR COALESCE(v_payment.provider_result->>'amountRm', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((v_payment.provider_result->>'amountRm')::NUMERIC, 2) <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Stored Fiuu VT STATUS is not successful';
  END IF;

  IF v_payment.status <> 'REPORTED' THEN
    RAISE EXCEPTION 'Fiuu VT POS payment is not fulfillable';
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

  UPDATE public.pos_online_payments
  SET status = 'PAID',
      provider_transaction_id = p_provider_transaction_id,
      provider_result = p_provider_result,
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      provider_confirmed_by = p_confirmed_by,
      gateway_ref = p_provider_transaction_id,
      transaction_id = (v_result->>'transaction_id')::UUID,
      paid_at = now(),
      failed_at = NULL,
      fiuu_vt_review_evidence = NULL,
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_vt_payment(
  UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_vt_payment(
  UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID
) TO service_role;
