-- Persist a verified Fiuu OPA success before attempting receipt and stock
-- fulfilment. Each RPC call is a separate PostgREST transaction, so a later
-- fulfilment rollback cannot erase the signed provider evidence.

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
  v_expiry_grace CONSTANT INTERVAL := INTERVAL '20 minutes';
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu POS payment reference is required';
  END IF;

  -- Follow close_pos_shift's lock order: discover the parent without locking
  -- the payment, lock the shift, then lock and re-read the payment. A close
  -- operation can therefore never hold shift -> payment while this function
  -- holds payment -> shift.
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
    OR v_gateway_ref ~ '[[:cntrl:]]'
    OR v_gateway_ref IS DISTINCT FROM v_payment.gateway_ref THEN
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

  -- Only the validated, non-secret callback fields and its provider signature
  -- may enter the audit record. In particular, no merchant secret is accepted.
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

  -- A displayed QR expires immediately for customers, but a signed success
  -- already in flight can be recorded during the existing bounded grace.
  IF v_payment.expires_at IS NOT NULL
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
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_shift_status TEXT;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_result JSONB;
  v_existing_receipt JSONB;
  v_gateway_ref TEXT := btrim(COALESCE(p_gateway_ref, ''));
  v_provider_amount_text TEXT;
  v_provider_amount NUMERIC;
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
  -- Keep the established shift-first order used by close_pos_shift. The first
  -- payment read is intentionally unlocked; identity is re-validated after
  -- both the shift and payment rows are locked.
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
    OR v_gateway_ref IS DISTINCT FROM v_payment.gateway_ref
    OR p_amount IS NULL
    OR p_amount <> v_payment.amount_rm
    OR p_currency IS DISTINCT FROM 'MYR'
    OR p_channel_id IS DISTINCT FROM '24' THEN
    RAISE EXCEPTION 'Fiuu POS payment details mismatch';
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

  -- A PAID replay remains readable after shift closure, but no new receipt or
  -- stock mutation may start unless the matching shift is still open.
  IF v_shift_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Fiuu POS shift is not open';
  END IF;

  IF v_payment.status IS DISTINCT FROM 'REPORTED'
    OR v_payment.provider_transaction_id IS DISTINCT FROM v_gateway_ref
    OR v_payment.provider_sale_reported_at IS NULL
    OR jsonb_typeof(v_payment.provider_result) IS DISTINCT FROM 'object'
    OR lower(COALESCE(v_payment.provider_result->>'referenceId', ''))
      IS DISTINCT FROM v_payment.id::TEXT
    OR v_payment.provider_result->>'molTransactionId' IS DISTINCT FROM v_gateway_ref
    OR v_payment.provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
    OR v_payment.provider_result->>'channelId' IS DISTINCT FROM '24'
    OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR COALESCE(v_payment.provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable signed success report';
  END IF;

  v_provider_amount_text := COALESCE(v_payment.provider_result->>'amount', '');
  IF v_provider_amount_text !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$' THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable signed success report';
  END IF;
  v_provider_amount := v_provider_amount_text::NUMERIC;
  IF v_provider_amount IS DISTINCT FROM v_payment.amount_rm THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable signed success report';
  END IF;

  -- The customer has already paid the stored amount. Lock and compare every
  -- catalogue row against the server-side snapshot before issuing a receipt;
  -- a later price change leaves the payment REPORTED for Finance resolution.
  IF jsonb_typeof(v_payment.sale_payload->'pricing_snapshot') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_payment.sale_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is missing';
  END IF;
  IF jsonb_array_length(v_payment.sale_payload->'pricing_snapshot')
    <> jsonb_array_length(v_payment.sale_payload->'items') THEN
    RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is incomplete';
  END IF;

  FOR v_pricing_item IN
    SELECT * FROM jsonb_array_elements(v_payment.sale_payload->'pricing_snapshot')
  LOOP
    BEGIN
      v_snapshot_quantity := (v_pricing_item->>'quantity')::INTEGER;
      v_snapshot_unit_price := (v_pricing_item->>'unit_price')::NUMERIC;
      v_snapshot_line_total := (v_pricing_item->>'line_total')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is invalid';
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
      RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is invalid';
    END IF;

    v_snapshot_subtotal := v_snapshot_subtotal
      + (v_snapshot_unit_price * v_snapshot_quantity);
  END LOOP;

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
    RAISE EXCEPTION 'Fiuu OPA sale contains duplicate or unavailable products';
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
      RAISE EXCEPTION 'Fiuu OPA product price changed after payment started';
    END IF;
  END LOOP;

  BEGIN
    v_payload_subtotal := (v_payment.sale_payload->>'subtotal')::NUMERIC;
    v_payload_total := (v_payment.sale_payload->>'total')::NUMERIC;
    v_payload_qr := (v_payment.sale_payload->>'qr_amount')::NUMERIC;
    v_payload_cash := COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0);
    v_payload_discount := COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Fiuu OPA sale totals snapshot is invalid';
  END;
  IF v_payload_subtotal IS NULL OR v_payload_total IS NULL OR v_payload_qr IS NULL THEN
    RAISE EXCEPTION 'Fiuu OPA sale totals snapshot is missing';
  END IF;

  v_snapshot_total := v_snapshot_subtotal - v_payload_discount;
  IF round(v_snapshot_subtotal, 2) <> round(v_payload_subtotal, 2)
    OR round(v_snapshot_total, 2) <> round(v_payload_total, 2)
    OR v_payload_qr <> v_payment.amount_rm
    OR round(v_payload_cash + v_payload_qr, 2) <> round(v_snapshot_total, 2) THEN
    RAISE EXCEPTION 'Fiuu OPA charged amount does not match pricing snapshot';
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
      transaction_id = (v_result->>'transaction_id')::UUID,
      provider_status_checked_at = now(),
      provider_confirmed_at = COALESCE(provider_confirmed_at, now()),
      paid_at = now(),
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id
    AND status = 'REPORTED';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) TO service_role;
