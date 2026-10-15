-- Fiuu Virtual Terminal App-to-App pilot. The mobile callback is not signed,
-- therefore only a fresh STATUS=00 result on an official managed device may
-- reach this service-role-only, row-locked fulfillment boundary.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_result JSONB,
  ADD COLUMN IF NOT EXISTS provider_status_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_confirmed_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_provider_order_id_format;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_provider_order_id_format
  CHECK (
    provider_order_id IS NULL
    OR provider_order_id ~ '^[A-Za-z0-9_-]{4,64}$'
  );

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_provider_transaction_id_format;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_provider_transaction_id_format
  CHECK (
    provider_transaction_id IS NULL
    OR provider_transaction_id ~ '^[A-Za-z0-9_-]{1,80}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_provider_order_unique
  ON public.pos_online_payments(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_provider_transaction_unique
  ON public.pos_online_payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_provider_confirmed_by
  ON public.pos_online_payments(provider_confirmed_by)
  WHERE provider_confirmed_by IS NOT NULL;

DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_actor_shift;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_actor_shift
  ON public.pos_online_payments(organization_id, branch_id, shift_id, created_by)
  WHERE provider IN ('fiuu', 'fiuu_vt') AND status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_one_pending_fiuu_device
  ON public.pos_online_payments(
    organization_id,
    branch_id,
    (sale_payload->>'fiuu_device_code')
  )
  WHERE provider IN ('fiuu', 'fiuu_vt')
    AND status = 'PENDING'
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
  v_payment public.pos_online_payments%ROWTYPE;
  v_result JSONB;
  v_existing_receipt JSONB;
  v_expiry_grace CONSTANT INTERVAL := INTERVAL '20 minutes';
BEGIN
  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_vt' THEN
    RAISE EXCEPTION 'Fiuu VT POS payment not found';
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
    OR p_provider_result->>'opType' <> 'STATUS'
    OR p_provider_result->>'status' <> '00'
    OR p_provider_result->>'orderId' IS DISTINCT FROM p_provider_order_id
    OR p_provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
    OR p_provider_result->>'currency' <> 'MYR'
    OR p_provider_result->>'channel' <> 'RPP_DuitNowQR-Offline'
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

  -- Re-read and validate the authoritative row while it is locked. This
  -- closes the race where a newer pending/failure STATUS arrives after the
  -- API read but before fulfillment begins.
  IF v_payment.provider_status_checked_at IS NULL
    OR v_payment.provider_status_checked_at < now() - INTERVAL '5 minutes'
    OR v_payment.provider_result IS NULL
    OR jsonb_typeof(v_payment.provider_result) <> 'object'
    OR v_payment.provider_result->>'opType' <> 'STATUS'
    OR v_payment.provider_result->>'status' <> '00'
    OR v_payment.provider_result->>'orderId' IS DISTINCT FROM p_provider_order_id
    OR v_payment.provider_result->>'transactionId' IS DISTINCT FROM p_provider_transaction_id
    OR v_payment.provider_result->>'currency' <> 'MYR'
    OR v_payment.provider_result->>'channel' <> 'RPP_DuitNowQR-Offline'
    OR COALESCE(v_payment.provider_result->>'amountRm', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((v_payment.provider_result->>'amountRm')::NUMERIC, 2) <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Stored Fiuu VT STATUS is stale or not successful';
  END IF;

  IF v_payment.status NOT IN ('PENDING', 'EXPIRED') THEN
    RAISE EXCEPTION 'Fiuu VT POS payment is not fulfillable';
  END IF;

  IF v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + v_expiry_grace THEN
    RAISE EXCEPTION 'Fiuu VT success arrived outside expiry grace';
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
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

-- Keep the shift open while either Fiuu transport can still deliver a valid
-- late result inside the bounded reconciliation grace period.
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
        (
          payment.status = 'PENDING'
          AND COALESCE(payment.expires_at, 'infinity'::timestamptz) > now()
        )
        OR (
          payment.provider IN ('fiuu', 'fiuu_vt')
          AND payment.status IN ('PENDING', 'EXPIRED')
          AND payment.expires_at IS NOT NULL
          AND payment.expires_at + INTERVAL '20 minutes' > now()
        )
      )
    ORDER BY payment.id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'POS shift cannot close while a Fiuu payment remains within expiry grace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_vt_payment(
  UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_vt_payment(
  UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;
