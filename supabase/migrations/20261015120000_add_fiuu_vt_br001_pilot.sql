-- Fiuu Virtual Terminal App-to-App pilot. The mobile callback is not signed,
-- therefore only a fresh STATUS=00 result on an official managed device may
-- reach this service-role-only, row-locked fulfillment boundary.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_result JSONB,
  ADD COLUMN IF NOT EXISTS provider_sale_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_status_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_confirmed_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_status_check;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_status_check
  CHECK (status IN ('PENDING', 'REPORTED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'));

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

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_sale_state;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_sale_state
  CHECK (
    provider_sale_reported_at IS NULL
    OR provider_transaction_id IS NOT NULL
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
  WHERE provider IN ('fiuu', 'fiuu_vt') AND status IN ('PENDING', 'REPORTED');

DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_device;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_device
  ON public.pos_online_payments(
    organization_id,
    branch_id,
    shift_id,
    (sale_payload->>'fiuu_device_code')
  )
  WHERE provider = 'fiuu_vt'
    AND status IN ('PENDING', 'REPORTED')
    AND NULLIF(sale_payload->>'fiuu_device_code', '') IS NOT NULL;

-- Mixed POS rows store cash tendered and change separately, while historical
-- shift aggregation treats cash_amount as drawer cash. Until that legacy
-- aggregation is migrated, reject mixed change atomically on every sale path
-- so expected cash can never be overstated.
CREATE OR REPLACE FUNCTION public.guard_pos_mixed_payment_exact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.payment_method::TEXT = 'MIXED'
    AND (
      round(NEW.cash_amount + NEW.qr_amount, 2) <> round(NEW.total, 2)
      OR round(NEW.change_amount, 2) <> 0
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Mixed POS payment requires an exact cash and QR split without change';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_mixed_payment_exact()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_mixed_payment_exact
  ON public.pos_transactions;
CREATE TRIGGER guard_pos_mixed_payment_exact
BEFORE INSERT ON public.pos_transactions
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_mixed_payment_exact();

-- Keep signed OPA fulfillment on the same shift-first lock order as shift
-- closure and VT fulfillment. This removes the payment -> shift half of the
-- historical deadlock cycle without weakening callback validation.
CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_payment(
  p_payment_id UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT
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
  v_expiry_grace CONSTANT INTERVAL := INTERVAL '20 minutes';
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu' OR v_payment.shift_id <> v_shift_id THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  IF NULLIF(trim(COALESCE(p_gateway_ref, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Fiuu transaction reference is required';
  END IF;
  IF trim(p_gateway_ref) IS DISTINCT FROM v_payment.gateway_ref THEN
    RAISE EXCEPTION 'Fiuu transaction reference mismatch';
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

  IF v_payment.status NOT IN ('PENDING', 'EXPIRED') THEN
    RAISE EXCEPTION 'Fiuu POS payment is not fulfillable';
  END IF;
  IF v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + v_expiry_grace THEN
    RAISE EXCEPTION 'Fiuu POS payment success arrived outside expiry grace';
  END IF;
  IF round(v_payment.amount_rm, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Fiuu POS payment amount mismatch';
  END IF;
  IF upper(COALESCE(p_currency, '')) <> 'MYR' THEN
    RAISE EXCEPTION 'Fiuu POS payment currency mismatch';
  END IF;
  IF p_channel_id <> '24' THEN
    RAISE EXCEPTION 'Fiuu POS payment channel mismatch';
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
      gateway_ref = trim(p_gateway_ref),
      transaction_id = (v_result->>'transaction_id')::UUID,
      paid_at = now(),
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

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

  -- Use the same lock order as shift closure: shift first, payment second.
  -- This prevents a successful payment confirmation from deadlocking against
  -- a cashier attempting to close the same shift.
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

  -- Re-read and validate the authoritative row while it is locked. This
  -- closes the race where a newer pending/failure STATUS arrives after the
  -- API read but before fulfillment begins.
  IF v_payment.provider_status_checked_at IS NULL
    OR v_payment.provider_status_checked_at < now() - INTERVAL '5 minutes'
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
    RAISE EXCEPTION 'Stored Fiuu VT STATUS is stale or not successful';
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
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

-- Lock the shift before calculating its final cash figures. Fiuu fulfillment
-- takes the same lock first, so closure cannot race with a successful sale or
-- persist totals read before that sale committed.
CREATE OR REPLACE FUNCTION public.close_pos_shift(
  p_shift_id UUID,
  p_closing_cash NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_actor public.profiles%ROWTYPE;
  v_shift public.pos_shifts%ROWTYPE;
  v_expected NUMERIC;
  v_variance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_closing_cash IS NULL
    OR p_closing_cash < 0
    OR p_closing_cash > 999999999.99
    OR p_closing_cash::TEXT = 'NaN' THEN
    RAISE EXCEPTION 'Closing cash amount is invalid';
  END IF;
  IF length(COALESCE(p_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'Shift closing notes are too long';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = v_user_id AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active profile not found';
  END IF;

  SELECT * INTO v_shift
  FROM public.pos_shifts
  WHERE id = p_shift_id AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open shift not found';
  END IF;
  IF NOT public.has_branch_access(v_shift.branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;
  IF v_actor.organization_id <> v_shift.organization_id THEN
    RAISE EXCEPTION 'Shift organization mismatch';
  END IF;
  IF v_actor.role::TEXT NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER')
    AND v_shift.opened_by <> v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.pos_shift_staff_members AS member
      WHERE member.shift_id = v_shift.id
        AND member.profile_id = v_user_id
        AND member.status IN ('ACTIVE', 'ENDED')
    ) THEN
    RAISE EXCEPTION 'Shift closer is not assigned to this shift';
  END IF;

  v_expected := v_shift.opening_cash + v_shift.total_cash;
  v_variance := p_closing_cash - v_expected;

  UPDATE public.pos_shifts
  SET status = 'CLOSED',
      closed_by = v_user_id,
      closing_cash = p_closing_cash,
      expected_cash = v_expected,
      cash_variance = v_variance,
      closed_at = now(),
      notes = p_notes,
      updated_at = now()
  WHERE id = p_shift_id;

  UPDATE public.pos_daily_summaries
  SET shift_count = shift_count + 1
  WHERE organization_id = v_shift.organization_id
    AND branch_id = v_shift.branch_id
    AND summary_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'expected_cash', v_expected,
    'closing_cash', p_closing_cash,
    'variance', v_variance,
    'total_sales', v_shift.total_sales,
    'transaction_count', v_shift.transaction_count
  );
END;
$$;

-- Serialize the first PENDING -> REPORTED transition against shift closure
-- and enforce the callback grace in the database, not only in application
-- time. A request that crosses the grace boundary can never strand a success
-- on a shift that has already closed.
CREATE OR REPLACE FUNCTION public.guard_fiuu_vt_reported_open_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.provider = 'fiuu_vt'
    AND NEW.status = 'REPORTED'
    AND OLD.status IS DISTINCT FROM 'REPORTED' THEN
    IF NEW.expires_at IS NULL
      OR now() > NEW.expires_at + INTERVAL '20 minutes' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT success arrived outside expiry grace';
    END IF;

    PERFORM shift.id
    FROM public.pos_shifts AS shift
    WHERE shift.id = NEW.shift_id
      AND shift.organization_id = NEW.organization_id
      AND shift.branch_id = NEW.branch_id
      AND shift.status = 'OPEN'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'A reported Fiuu VT payment requires a matching open shift';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_fiuu_vt_reported_open_shift()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_fiuu_vt_reported_open_shift
  ON public.pos_online_payments;
CREATE TRIGGER guard_fiuu_vt_reported_open_shift
BEFORE UPDATE OF status ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_fiuu_vt_reported_open_shift();

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
        payment.status = 'REPORTED'
        OR
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
    LIMIT 1;

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

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.close_pos_shift(UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_pos_shift(UUID, NUMERIC, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;
