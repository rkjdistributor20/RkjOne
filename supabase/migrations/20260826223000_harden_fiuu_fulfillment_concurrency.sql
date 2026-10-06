-- Keep POS document numbering collision-free across concurrent branch shifts,
-- and tighten the database boundary for delayed Fiuu payment notifications.

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_one_pending_fiuu_actor_shift
  ON public.pos_online_payments(organization_id, branch_id, shift_id, created_by)
  WHERE provider = 'fiuu' AND status = 'PENDING';

CREATE OR REPLACE FUNCTION public.generate_pos_number(
  p_prefix TEXT,
  p_org_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_date DATE;
  v_date TEXT;
  v_next_suffix BIGINT;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'POS number organization is required';
  END IF;

  v_business_date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
  v_date := to_char(v_business_date, 'YYYYMMDD');

  -- Every POS sale path calls this function before inserting its transaction.
  -- Hold one organization/business-day lock until transaction end so two
  -- branch shifts cannot observe the same highest assigned suffix.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'rkj-pos-number:' || p_org_id::TEXT || ':' || v_business_date::TEXT,
      0
    )
  );

  -- Counting rows can reuse an existing suffix after a gap or controlled
  -- deletion. Advance from the greatest TX suffix already assigned instead.
  SELECT COALESCE(
    MAX(
      substring(
        transaction_number
        FROM ('^TX-' || v_date || '-([0-9]+)$')
      )::BIGINT
    ),
    0
  ) + 1
  INTO v_next_suffix
  FROM public.pos_transactions
  WHERE organization_id = p_org_id
    AND transaction_number ~ ('^TX-' || v_date || '-[0-9]+$');

  RETURN p_prefix || '-' || v_date || '-' || lpad(v_next_suffix::TEXT, 5, '0');
END;
$$;

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
SET search_path = public
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

  IF NOT FOUND OR v_payment.provider <> 'fiuu' THEN
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

  -- The displayed QR is no longer reusable at expires_at, but a signed
  -- provider success already in flight may arrive shortly afterwards. Accept
  -- only one bounded delay window and otherwise leave its current state for
  -- explicit investigation; never create a sale from an arbitrarily late
  -- callback.
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

-- Status polling may project an elapsed attempt as EXPIRED without mutating
-- its database row. Keep the matching shift open through the same bounded
-- callback grace so an accepted provider payment can still be fulfilled.
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
          payment.provider = 'fiuu'
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
        MESSAGE = 'POS shift cannot close while a Fiuu callback remains within expiry grace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) TO service_role;
