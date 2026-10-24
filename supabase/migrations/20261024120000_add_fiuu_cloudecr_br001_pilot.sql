-- BR001-only Fiuu VT+ / cloudECR pilot.
-- This migration prepares database invariants only. Runtime activation still
-- requires the explicit BR001 environment allowlist and a completed UAT.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS provider_reconcile_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_reconcile_claimed_at TIMESTAMPTZ;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_reconcile_reference_id_format;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_reconcile_reference_id_format
  CHECK (
    provider_reconcile_reference_id IS NULL
    OR provider_reconcile_reference_id ~ '^[A-Za-z0-9_-]{4,20}$'
  );

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

-- cloudECR getLast is terminal-scoped. Never allow two unresolved SALEs to the
-- same POS/device/terminal tuple, even when they originate from different RKJ
-- tablets, cashiers or shifts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_one_active_cloudecr_terminal
  ON public.pos_online_payments(
    organization_id,
    (sale_payload->>'fiuu_cloudecr_pos_id'),
    (sale_payload->>'fiuu_cloudecr_device_id'),
    (sale_payload->>'fiuu_cloudecr_terminal_sn')
  )
  WHERE provider = 'fiuu_cloudecr'
    AND status IN ('PENDING', 'REPORTED')
    AND NULLIF(sale_payload->>'fiuu_cloudecr_pos_id', '') IS NOT NULL
    AND NULLIF(sale_payload->>'fiuu_cloudecr_device_id', '') IS NOT NULL
    AND NULLIF(sale_payload->>'fiuu_cloudecr_terminal_sn', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_cloudecr_reconciliation(
  p_payment_id UUID,
  p_query_reference_id TEXT,
  p_min_interval_seconds INTEGER DEFAULT 180
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed_id UUID;
BEGIN
  IF p_query_reference_id IS NULL
    OR p_query_reference_id !~ '^[A-Za-z0-9_-]{4,20}$'
    OR p_min_interval_seconds < 120
    OR p_min_interval_seconds > 300 THEN
    RAISE EXCEPTION 'Invalid Fiuu cloudECR reconciliation claim';
  END IF;

  UPDATE public.pos_online_payments
  SET provider_reconcile_reference_id = p_query_reference_id,
      provider_reconcile_claimed_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
    AND provider = 'fiuu_cloudecr'
    AND status = 'PENDING'
    AND sale_payload->>'fiuu_branch_code' = 'BR001'
    AND provider_order_id IS NOT NULL
    AND expires_at IS NOT NULL
    AND expires_at + INTERVAL '20 minutes' > now()
    AND (
      provider_reconcile_claimed_at IS NULL
      OR provider_reconcile_claimed_at <= now() - make_interval(secs => p_min_interval_seconds)
    )
  RETURNING id INTO v_claimed_id;

  RETURN v_claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_cloudecr_reconciliation(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_cloudecr_reconciliation(UUID, TEXT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.report_pos_fiuu_cloudecr_payment(
  p_payment_id UUID,
  p_provider_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_provider_transaction_id TEXT;
  v_trans_type TEXT;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;

  -- Follow the shift-first lock order used by shift closure and other Fiuu
  -- fulfillment functions so a successful payment cannot race closing.
  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
    AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS shift is not open';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_cloudecr' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;
  IF v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION 'Fiuu cloudECR pilot is restricted to BR001';
  END IF;

  v_provider_transaction_id := p_provider_result->'transData'->>'transId';
  IF v_payment.status IN ('REPORTED', 'PAID')
    AND v_payment.provider_transaction_id = v_provider_transaction_id THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'provider_transaction_id', v_payment.provider_transaction_id
    );
  END IF;

  IF v_payment.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment is not fulfillable';
  END IF;
  IF v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + INTERVAL '20 minutes' THEN
    RAISE EXCEPTION 'Fiuu cloudECR success arrived outside expiry grace';
  END IF;

  v_trans_type := p_provider_result->>'transType';
  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) <> 'object'
    OR jsonb_typeof(p_provider_result->'transData') <> 'object'
    OR v_trans_type NOT IN ('sale', 'getLast')
    OR p_provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR p_provider_result->>'responseCode' IS DISTINCT FROM '00'
    OR COALESCE(p_provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$'
    OR (
      v_trans_type = 'sale'
      AND p_provider_result->>'referenceId' IS DISTINCT FROM v_payment.provider_order_id
    )
    OR (
      v_trans_type = 'getLast'
      AND (
        v_payment.provider_reconcile_reference_id IS NULL
        OR p_provider_result->>'referenceId'
          IS DISTINCT FROM v_payment.provider_reconcile_reference_id
      )
    )
    OR p_provider_result->>'posId' IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_pos_id'
    OR p_provider_result->>'deviceId' IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_device_id'
    OR p_provider_result->>'terminalSn'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_terminal_sn'
    OR (
      v_trans_type = 'sale'
      AND NULLIF(p_provider_result->'transData'->>'metadata', '') IS NOT NULL
      AND p_provider_result->'transData'->>'metadata'
        IS DISTINCT FROM v_payment.provider_order_id
    )
    OR (
      v_trans_type = 'getLast'
      AND p_provider_result->'transData'->>'metadata'
        IS DISTINCT FROM v_payment.provider_order_id
    )
    OR COALESCE(v_provider_transaction_id, '') !~ '^[0-9]{1,10}$'
    OR p_provider_result->'transData'->>'paymentChannel' IS DISTINCT FROM 'duitNowQr'
    OR p_provider_result->'transData'->>'currency' IS DISTINCT FROM 'MYR'
    OR COALESCE(p_provider_result->'transData'->>'transAmt', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((p_provider_result->'transData'->>'transAmt')::NUMERIC, 2)
      <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Fiuu cloudECR response is not fulfillable';
  END IF;

  UPDATE public.pos_online_payments
  SET status = 'REPORTED',
      provider_transaction_id = v_provider_transaction_id,
      provider_result = p_provider_result,
      provider_sale_reported_at = now(),
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      provider_confirmed_by = v_payment.created_by,
      gateway_ref = v_provider_transaction_id,
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'REPORTED',
    'provider_transaction_id', v_provider_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_cloudecr_payment(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_cloudecr_payment(UUID, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.fulfill_pos_fiuu_cloudecr_payment(UUID, JSONB);
CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_cloudecr_payment(
  p_payment_id UUID
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
  v_pricing_item JSONB;
  v_snapshot_quantity INTEGER;
  v_snapshot_unit_price NUMERIC;
  v_snapshot_line_total NUMERIC;
  v_snapshot_subtotal NUMERIC := 0;
  v_snapshot_total NUMERIC;
  v_current_price NUMERIC;
  v_payload_subtotal NUMERIC;
  v_payload_total NUMERIC;
  v_payload_qr NUMERIC;
  v_payload_cash NUMERIC;
  v_payload_discount NUMERIC;
  v_locked_product_count INTEGER;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
    AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS shift is not open';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_cloudecr' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;
  IF v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION 'Fiuu cloudECR pilot is restricted to BR001';
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

  IF v_payment.status <> 'REPORTED'
    OR v_payment.provider_transaction_id IS NULL
    OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'responseCode' IS DISTINCT FROM '00'
    OR COALESCE(v_payment.provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment is not fulfillable';
  END IF;

  -- The customer has already approved the charged amount. Refuse to issue a
  -- different receipt if the catalogue changes before fulfilment. An affected
  -- payment remains REPORTED for Finance/manual resolution instead of silently
  -- changing its price or issuing duplicate stock movements.
  IF jsonb_typeof(v_payment.sale_payload->'pricing_snapshot') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_payment.sale_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is missing';
  END IF;
  IF jsonb_array_length(v_payment.sale_payload->'pricing_snapshot')
    <> jsonb_array_length(v_payment.sale_payload->'items') THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is incomplete';
  END IF;

  FOR v_pricing_item IN
    SELECT * FROM jsonb_array_elements(v_payment.sale_payload->'pricing_snapshot')
  LOOP
    BEGIN
      v_snapshot_quantity := (v_pricing_item->>'quantity')::INTEGER;
      v_snapshot_unit_price := (v_pricing_item->>'unit_price')::NUMERIC;
      v_snapshot_line_total := (v_pricing_item->>'line_total')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is invalid';
    END;

    IF COALESCE(v_pricing_item->>'product_id', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR v_snapshot_quantity IS NULL
      OR v_snapshot_unit_price IS NULL
      OR v_snapshot_line_total IS NULL
      OR v_snapshot_quantity <= 0
      OR v_snapshot_unit_price < 0
      OR round(v_snapshot_line_total, 2)
        <> round(v_snapshot_unit_price * v_snapshot_quantity, 2)
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_payment.sale_payload->'items') AS source_item
        WHERE source_item->>'product_id' = v_pricing_item->>'product_id'
          AND (source_item->>'quantity')::INTEGER = v_snapshot_quantity
      ) THEN
      RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is invalid';
    END IF;

    v_snapshot_subtotal := v_snapshot_subtotal
      + (v_snapshot_unit_price * v_snapshot_quantity);
  END LOOP;

  -- Hold every referenced catalogue row in deterministic order until
  -- process_pos_sale_internal has created the receipt. This prevents a price
  -- update between snapshot validation and the processor's own price reads.
  PERFORM product.id
  FROM public.products AS product
  JOIN (
    SELECT DISTINCT (snapshot_item->>'product_id')::UUID AS product_id
    FROM jsonb_array_elements(
      v_payment.sale_payload->'pricing_snapshot'
    ) AS snapshot_item
  ) AS snapshot ON snapshot.product_id = product.id
  WHERE product.organization_id = v_payment.organization_id
    AND product.status = 'ACTIVE'
  ORDER BY product.id
  FOR UPDATE OF product;
  GET DIAGNOSTICS v_locked_product_count = ROW_COUNT;

  IF v_locked_product_count
    <> jsonb_array_length(v_payment.sale_payload->'pricing_snapshot') THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale contains duplicate or unavailable products';
  END IF;

  FOR v_pricing_item IN
    SELECT * FROM jsonb_array_elements(v_payment.sale_payload->'pricing_snapshot')
  LOOP
    v_snapshot_unit_price := (v_pricing_item->>'unit_price')::NUMERIC;
    SELECT price INTO v_current_price
    FROM public.products
    WHERE id = (v_pricing_item->>'product_id')::UUID
      AND organization_id = v_payment.organization_id
      AND status = 'ACTIVE';
    IF NOT FOUND OR round(v_current_price, 2) <> round(v_snapshot_unit_price, 2) THEN
      RAISE EXCEPTION 'Fiuu cloudECR product price changed after payment started';
    END IF;
  END LOOP;

  BEGIN
    v_payload_subtotal := (v_payment.sale_payload->>'subtotal')::NUMERIC;
    v_payload_total := (v_payment.sale_payload->>'total')::NUMERIC;
    v_payload_qr := (v_payment.sale_payload->>'qr_amount')::NUMERIC;
    v_payload_cash := COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0);
    v_payload_discount := COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale totals snapshot is invalid';
  END;
  IF v_payload_subtotal IS NULL OR v_payload_total IS NULL OR v_payload_qr IS NULL THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale totals snapshot is missing';
  END IF;

  v_snapshot_total := v_snapshot_subtotal - v_payload_discount;
  IF round(v_snapshot_subtotal, 2) <> round(v_payload_subtotal, 2)
    OR round(v_snapshot_total, 2)
      <> round(v_payload_total, 2)
    OR round(v_payload_qr, 2) <> round(v_payment.amount_rm, 2)
    OR round(v_payload_cash + v_payload_qr, 2) <> round(v_snapshot_total, 2) THEN
    RAISE EXCEPTION 'Fiuu cloudECR charged amount does not match pricing snapshot';
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
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      provider_confirmed_by = v_payment.created_by,
      gateway_ref = v_payment.provider_transaction_id,
      transaction_id = (v_result->>'transaction_id')::UUID,
      paid_at = now(),
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_cloudecr_payment(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_cloudecr_payment(UUID)
  TO service_role;

-- Keep the shift open while a cloudECR response may still be reconciled.
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
          payment.status = 'PENDING'
          AND COALESCE(payment.expires_at, 'infinity'::timestamptz) > now()
        )
        OR (
          payment.provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
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

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;
