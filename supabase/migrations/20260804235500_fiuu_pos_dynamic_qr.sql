-- Fiuu DuitNow QR: only finalize a POS sale after a verified provider callback.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_provider_gateway_unique
  ON public.pos_online_payments(provider, gateway_ref)
  WHERE gateway_ref IS NOT NULL AND provider <> 'manual_qr';

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_pending_expiry
  ON public.pos_online_payments(expires_at)
  WHERE status = 'PENDING';

CREATE OR REPLACE FUNCTION public.process_pos_sale_internal(
  p_actor_id UUID,
  p_shift_id UUID,
  p_branch_id UUID,
  p_items JSONB,
  p_payment_method payment_method,
  p_cash_amount NUMERIC,
  p_qr_amount NUMERIC,
  p_discount NUMERIC DEFAULT 0,
  p_offline_id TEXT DEFAULT NULL,
  p_receipt_email TEXT DEFAULT NULL,
  p_receipt_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_org_id UUID;
  v_org_id UUID;
  v_shift RECORD;
  v_item JSONB;
  v_product RECORD;
  v_tx_id UUID;
  v_tx_number TEXT;
  v_receipt_number TEXT;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
  v_change NUMERIC := 0;
  v_tx_item_id UUID;
  v_location_id UUID;
  v_bom RECORD;
  v_movement_id UUID;
  v_deduct_qty NUMERIC;
  v_receipt_items JSONB := '[]'::jsonb;
  v_paid NUMERIC;
  v_quantity INTEGER;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Sale actor is required';
  END IF;

  SELECT organization_id INTO v_actor_org_id
  FROM public.profiles
  WHERE id = p_actor_id AND status = 'ACTIVE';

  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION 'Active sale actor not found';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one sale item is required';
  END IF;

  SELECT * INTO v_shift
  FROM public.pos_shifts
  WHERE id = p_shift_id AND branch_id = p_branch_id AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open shift found';
  END IF;

  v_org_id := v_shift.organization_id;
  IF v_actor_org_id <> v_org_id THEN
    RAISE EXCEPTION 'Sale actor organization mismatch';
  END IF;

  SELECT id INTO v_location_id
  FROM public.inventory_locations
  WHERE branch_id = p_branch_id
    AND organization_id = v_org_id
    AND location_type = 'BRANCH_KIOSK'
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Stok kiosk belum disediakan untuk cawangan ini. Hubungi HQ/operasi.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR NOT (v_item ? 'product_id')
      OR NOT (v_item ? 'quantity') THEN
      RAISE EXCEPTION 'Invalid sale item';
    END IF;

    BEGIN
      v_quantity := (v_item->>'quantity')::INTEGER;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid sale quantity';
    END;

    IF v_quantity <= 0 OR v_quantity > 1000 THEN
      RAISE EXCEPTION 'Sale quantity must be between 1 and 1000';
    END IF;
  END LOOP;

  PERFORM public.validate_pos_sale_stock(v_location_id, p_items);

  v_tx_number := public.generate_pos_number('TX', v_org_id);
  v_receipt_number := public.generate_pos_number('RC', v_org_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id
      AND status = 'ACTIVE';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_item->>'product_id';
    END IF;

    v_quantity := (v_item->>'quantity')::INTEGER;
    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  END LOOP;

  IF COALESCE(p_discount, 0) < 0 OR COALESCE(p_discount, 0) > v_subtotal THEN
    RAISE EXCEPTION 'Invalid discount amount';
  END IF;

  v_total := v_subtotal - COALESCE(p_discount, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Sale total must be positive';
  END IF;

  IF COALESCE(p_cash_amount, 0) < 0 OR COALESCE(p_qr_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Payment amounts cannot be negative';
  END IF;

  IF p_payment_method = 'CASH' AND COALESCE(p_qr_amount, 0) <> 0 THEN
    RAISE EXCEPTION 'Cash sale cannot include QR amount';
  ELSIF p_payment_method = 'QR' AND COALESCE(p_cash_amount, 0) <> 0 THEN
    RAISE EXCEPTION 'QR sale cannot include cash amount';
  ELSIF p_payment_method = 'MIXED'
    AND (COALESCE(p_cash_amount, 0) <= 0 OR COALESCE(p_qr_amount, 0) <= 0) THEN
    RAISE EXCEPTION 'Mixed payment requires cash and QR amounts';
  END IF;

  v_paid := COALESCE(p_cash_amount, 0) + COALESCE(p_qr_amount, 0);
  IF v_paid < v_total THEN
    RAISE EXCEPTION 'Insufficient payment amount';
  END IF;

  IF COALESCE(p_qr_amount, 0) > v_total THEN
    RAISE EXCEPTION 'QR amount cannot exceed sale total';
  END IF;

  IF p_payment_method = 'CASH' THEN
    v_change := COALESCE(p_cash_amount, 0) - v_total;
  ELSIF p_payment_method = 'MIXED' THEN
    v_change := GREATEST(COALESCE(p_cash_amount, 0) - (v_total - COALESCE(p_qr_amount, 0)), 0);
  END IF;

  INSERT INTO public.pos_transactions (
    organization_id, branch_id, shift_id, transaction_number,
    status, subtotal, discount, total, payment_method,
    cash_amount, qr_amount, change_amount,
    offline_id, synced_at, receipt_email, receipt_phone, created_by
  ) VALUES (
    v_org_id, p_branch_id, p_shift_id, v_tx_number,
    'COMPLETED', v_subtotal, COALESCE(p_discount, 0), v_total, p_payment_method,
    COALESCE(p_cash_amount, 0), COALESCE(p_qr_amount, 0), v_change,
    p_offline_id, CASE WHEN p_offline_id IS NOT NULL THEN now() ELSE NULL END,
    p_receipt_email, p_receipt_phone, p_actor_id
  ) RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id
      AND status = 'ACTIVE';

    v_quantity := (v_item->>'quantity')::INTEGER;
    INSERT INTO public.pos_transaction_items (
      transaction_id, product_id, product_name, sku, quantity, unit_price, line_total
    ) VALUES (
      v_tx_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.price, v_product.price * v_quantity
    ) RETURNING id INTO v_tx_item_id;

    v_receipt_items := v_receipt_items || jsonb_build_object(
      'name', v_product.name,
      'sku', v_product.sku,
      'quantity', v_quantity,
      'unit_price', v_product.price,
      'line_total', v_product.price * v_quantity
    );

    FOR v_bom IN
      SELECT pb.*, si.name AS item_name
      FROM public.product_bom pb
      JOIN public.stock_items si ON si.id = pb.stock_item_id
      WHERE pb.product_id = v_product.id AND pb.auto_deduct = true
    LOOP
      v_deduct_qty := v_bom.quantity * v_quantity;

      INSERT INTO public.stock_movements (
        organization_id, movement_type, location_id, stock_item_id,
        quantity, unit, reference_type, reference_id, created_by
      ) VALUES (
        v_org_id, 'SALE_DEDUCT', v_location_id, v_bom.stock_item_id,
        -v_deduct_qty, v_bom.unit, 'pos_transaction', v_tx_id, p_actor_id
      ) RETURNING id INTO v_movement_id;

      INSERT INTO public.pos_stock_deductions (
        transaction_id, transaction_item_id, stock_item_id,
        quantity, unit, location_id, movement_id
      ) VALUES (
        v_tx_id, v_tx_item_id, v_bom.stock_item_id,
        v_deduct_qty, v_bom.unit, v_location_id, v_movement_id
      );
    END LOOP;
  END LOOP;

  IF p_payment_method IN ('CASH', 'MIXED') AND COALESCE(p_cash_amount, 0) > 0 THEN
    INSERT INTO public.pos_payments (transaction_id, payment_method, amount)
    VALUES (v_tx_id, 'CASH', COALESCE(p_cash_amount, 0));
  END IF;

  IF p_payment_method IN ('QR', 'MIXED') AND COALESCE(p_qr_amount, 0) > 0 THEN
    INSERT INTO public.pos_payments (transaction_id, payment_method, amount)
    VALUES (v_tx_id, 'QR', COALESCE(p_qr_amount, 0));
  END IF;

  INSERT INTO public.pos_receipts (transaction_id, receipt_number, receipt_data)
  VALUES (
    v_tx_id,
    v_receipt_number,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'transaction_number', v_tx_number,
      'branch_id', p_branch_id,
      'items', v_receipt_items,
      'subtotal', v_subtotal,
      'discount', COALESCE(p_discount, 0),
      'total', v_total,
      'payment_method', p_payment_method,
      'cash_amount', COALESCE(p_cash_amount, 0),
      'qr_amount', COALESCE(p_qr_amount, 0),
      'change_amount', v_change,
      'created_at', now()
    )
  );

  UPDATE public.pos_shifts SET
    total_sales = total_sales + v_total,
    total_cash = total_cash + CASE
      WHEN p_payment_method IN ('CASH', 'MIXED')
      THEN LEAST(COALESCE(p_cash_amount, 0), v_total)
      ELSE 0
    END,
    total_qr = total_qr + CASE
      WHEN p_payment_method IN ('QR', 'MIXED') THEN COALESCE(p_qr_amount, 0)
      ELSE 0
    END,
    transaction_count = transaction_count + 1,
    updated_at = now()
  WHERE id = p_shift_id;

  PERFORM public.refresh_pos_daily_summary(
    v_org_id,
    p_branch_id,
    (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE
  );

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'transaction_number', v_tx_number,
    'receipt_number', v_receipt_number,
    'subtotal', v_subtotal,
    'discount', COALESCE(p_discount, 0),
    'total', v_total,
    'change_amount', v_change,
    'items', v_receipt_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_shift_id UUID,
  p_branch_id UUID,
  p_items JSONB,
  p_payment_method payment_method,
  p_cash_amount NUMERIC,
  p_qr_amount NUMERIC,
  p_discount NUMERIC DEFAULT 0,
  p_offline_id TEXT DEFAULT NULL,
  p_receipt_email TEXT DEFAULT NULL,
  p_receipt_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  RETURN public.process_pos_sale_internal(
    v_user_id,
    p_shift_id,
    p_branch_id,
    p_items,
    p_payment_method,
    p_cash_amount,
    p_qr_amount,
    p_discount,
    p_offline_id,
    p_receipt_email,
    p_receipt_phone
  );
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
BEGIN
  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu' THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    SELECT receipt_data INTO v_existing_receipt
    FROM public.pos_receipts
    WHERE transaction_id = v_payment.transaction_id;
    RETURN COALESCE(v_existing_receipt, jsonb_build_object('transaction_id', v_payment.transaction_id));
  END IF;

  IF v_payment.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Fiuu POS payment is not pending';
  END IF;

  IF v_payment.expires_at IS NOT NULL AND v_payment.expires_at < now() THEN
    UPDATE public.pos_online_payments
    SET status = 'EXPIRED', failed_at = now(), updated_at = now()
    WHERE id = v_payment.id;
    RAISE EXCEPTION 'Fiuu POS payment has expired';
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

  IF NULLIF(trim(COALESCE(p_gateway_ref, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Fiuu transaction reference is required';
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
      gateway_ref = p_gateway_ref,
      transaction_id = (v_result->>'transaction_id')::UUID,
      paid_at = now(),
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.process_pos_sale_internal(
  UUID, UUID, UUID, JSONB, payment_method, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_sale_internal(
  UUID, UUID, UUID, JSONB, payment_method, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.process_pos_sale(
  UUID, UUID, JSONB, payment_method, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(
  UUID, UUID, JSONB, payment_method, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment(UUID, TEXT, NUMERIC, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_payment(UUID, TEXT, NUMERIC, TEXT, TEXT)
  TO service_role;
