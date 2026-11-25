SET lock_timeout = '5s';

-- VT retries of the same durable basket may have different provider orders.
-- One checkout can own only one completed sale, even across shift rollover.
-- A second actual charge is an exception for Finance, not a second sale.
CREATE UNIQUE INDEX idx_pos_fiuu_vt_fulfilled_cart_once
  ON public.pos_online_payments (organization_id, branch_id, (sale_payload->>'cart_session_id'))
  WHERE provider = 'fiuu_vt' AND transaction_id IS NOT NULL
    AND NULLIF(sale_payload->>'cart_session_id', '') IS NOT NULL;

-- Called only by the verified HQ resolution path. Do not reopen the shift or
-- call the ordinary open-shift sale RPC. Cash is never touched on this path.
CREATE OR REPLACE FUNCTION public.post_pos_fiuu_vt_closed_shift_review(
  p_payment_id UUID,
  p_reviewer_id UUID,
  p_provider_transaction_id TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET timezone = 'Asia/Kuala_Lumpur'
AS $$
DECLARE
  v_shift_id UUID;
  v_shift public.pos_shifts%ROWTYPE;
  v_payment public.pos_online_payments%ROWTYPE;
  v_location_id UUID;
  v_balance public.inventory_balances%ROWTYPE;
  v_rows JSONB;
  v_items JSONB := '[]'::JSONB;
  v_line RECORD;
  v_bom RECORD;
  v_subtotal NUMERIC;
  v_discount NUMERIC;
  v_total NUMERIC;
  v_transaction_id UUID;
  v_tx_number TEXT;
  v_receipt_number TEXT;
  v_tx_item_id UUID;
  v_movement_id UUID;
  v_deduction NUMERIC;
  v_receipt JSONB;
  v_event JSONB;
  v_recorded_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT shift_id INTO v_shift_id FROM public.pos_online_payments
  WHERE id = p_payment_id AND provider = 'fiuu_vt';
  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = v_shift_id FOR UPDATE;
  IF NOT FOUND OR v_shift.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'Closed original Fiuu VT shift not found';
  END IF;
  SELECT * INTO v_payment FROM public.pos_online_payments
  WHERE id = p_payment_id AND provider = 'fiuu_vt'
    AND shift_id = v_shift.id AND branch_id = v_shift.branch_id
    AND organization_id = v_shift.organization_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.pos_fiuu_vt_shift_closures
    WHERE shift_id = v_shift.id AND organization_id = v_shift.organization_id
      AND branch_id = v_shift.branch_id AND p_payment_id = ANY(review_payment_ids)
  ) THEN
    RAISE EXCEPTION 'Fiuu VT payment was not attached to this shift at closure';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_reviewer_id AND organization_id = v_payment.organization_id
      AND status = 'ACTIVE' AND role::TEXT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  ) THEN
    RAISE EXCEPTION 'Active Finance or administrator profile is required';
  END IF;
  IF length(btrim(COALESCE(p_notes, ''))) NOT BETWEEN 10 AND 1000
    OR COALESCE(p_provider_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
    OR (v_payment.provider_transaction_id IS NOT NULL
      AND v_payment.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id)
    OR COALESCE(v_payment.provider_order_id, '') !~ '^RKJ_[A-F0-9]{32}$' THEN
    RAISE EXCEPTION 'Provider evidence or transaction reference does not match';
  END IF;
  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL
    AND NOT v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_review_resolution = 'CONFIRMED_CHARGED' THEN
    RETURN jsonb_build_object('payment_id', v_payment.id, 'status', 'PAID',
      'transaction_id', v_payment.transaction_id, 'reused', true);
  END IF;
  IF v_payment.status <> 'QUARANTINED' OR NOT v_payment.fiuu_vt_review_required
    OR v_payment.fiuu_vt_reconciliation_state NOT IN ('PROVIDER_ERROR_REVIEW', 'LATE_SUCCESS_REVIEW')
    OR v_payment.transaction_id IS NOT NULL OR v_payment.paid_at IS NOT NULL
    OR v_payment.sale_payload->>'payment_method' IS DISTINCT FROM 'QR'
    OR COALESCE(v_payment.sale_payload->>'cash_amount', '') NOT IN ('0', '0.0', '0.00')
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_payment.created_by AND organization_id = v_payment.organization_id
    ) THEN
    RAISE EXCEPTION 'Payment is not an unresolved, wholly QR sale for the original shift';
  END IF;

  v_rows := v_payment.sale_payload->'pricing_snapshot';
  IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_payment.sale_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Original item pricing is unavailable';
  END IF;
  IF jsonb_array_length(v_rows) NOT BETWEEN 1 AND 100
    OR jsonb_array_length(v_rows) <> jsonb_array_length(v_payment.sale_payload->'items')
    OR (SELECT count(DISTINCT v->>'product_id') FROM jsonb_array_elements(v_rows) v)
      <> jsonb_array_length(v_rows) THEN
    RAISE EXCEPTION 'Original item pricing is invalid';
  END IF;
  -- Validate text before casting (separate statement, no planner reordering).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rows) v
    WHERE COALESCE(v->>'quantity', '') !~ '^[1-9][0-9]{0,3}$'
      OR COALESCE(v->>'unit_price', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
      OR COALESCE(v->>'line_total', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_payment.sale_payload->'items') item
        WHERE item->>'product_id' = v->>'product_id' AND item->>'quantity' = v->>'quantity'
      )
  ) OR COALESCE(v_payment.sale_payload->>'discount', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
    OR COALESCE(v_payment.sale_payload->>'total', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
    OR COALESCE(v_payment.sale_payload->>'subtotal', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
    OR COALESCE(v_payment.sale_payload->>'qr_amount', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Original item or amount evidence is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rows) v
    WHERE (v->>'quantity')::INTEGER > 1000
      OR (v->>'line_total')::NUMERIC <> (v->>'quantity')::INTEGER * (v->>'unit_price')::NUMERIC
      OR NOT EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id::TEXT = v->>'product_id' AND p.organization_id = v_payment.organization_id
      )
  ) THEN
    RAISE EXCEPTION 'Original items do not match recorded prices';
  END IF;
  SELECT sum((v->>'line_total')::NUMERIC) INTO v_subtotal FROM jsonb_array_elements(v_rows) v;
  v_discount := (v_payment.sale_payload->>'discount')::NUMERIC;
  v_total := v_subtotal - v_discount;
  IF v_total <= 0 OR v_total IS DISTINCT FROM v_payment.amount_rm
    OR v_total IS DISTINCT FROM (v_payment.sale_payload->>'total')::NUMERIC
    OR v_total IS DISTINCT FROM (v_payment.sale_payload->>'qr_amount')::NUMERIC
    OR v_subtotal IS DISTINCT FROM (v_payment.sale_payload->>'subtotal')::NUMERIC THEN
    RAISE EXCEPTION 'Original sale total does not match the provider payment';
  END IF;

  SELECT id INTO STRICT v_location_id FROM public.inventory_locations
  WHERE organization_id = v_payment.organization_id AND branch_id = v_payment.branch_id
    AND location_type = 'BRANCH_KIOSK';
  PERFORM public.validate_pos_sale_stock(v_location_id, v_payment.sale_payload->'items');
  -- A late posting can race with the successor shift's stock usage. Lock
  -- current balances in a stable order, and fail closed if a balance is missing.
  FOR v_bom IN
    SELECT bom.stock_item_id, bom.unit,
      sum(bom.quantity * (item->>'quantity')::INTEGER) AS needed
    FROM jsonb_array_elements(v_rows) item
    JOIN public.product_bom bom ON bom.product_id::TEXT = item->>'product_id'
    WHERE bom.auto_deduct
    GROUP BY bom.stock_item_id, bom.unit
    ORDER BY bom.stock_item_id, bom.unit
  LOOP
    SELECT * INTO v_balance FROM public.inventory_balances
    WHERE location_id = v_location_id AND stock_item_id = v_bom.stock_item_id
      AND organization_id = v_payment.organization_id
    FOR UPDATE;
    IF NOT FOUND OR v_balance.unit IS DISTINCT FROM v_bom.unit
      OR v_bom.needed <= 0 OR v_balance.quantity < v_bom.needed THEN
      RAISE EXCEPTION 'Stock requires reconciliation before late QR posting';
    END IF;
  END LOOP;
  v_tx_number := public.generate_pos_number('TX', v_payment.organization_id);
  v_receipt_number := public.generate_pos_number('RC', v_payment.organization_id);

  INSERT INTO public.pos_transactions (
    organization_id, branch_id, shift_id, transaction_number, status,
    subtotal, discount, total, payment_method, cash_amount, qr_amount, change_amount,
    offline_id, receipt_email, receipt_phone, created_by, created_at
  ) VALUES (
    v_payment.organization_id, v_payment.branch_id, v_shift.id, v_tx_number, 'COMPLETED',
    v_subtotal, v_discount, v_total, 'QR', 0, v_total, 0,
    NULLIF(v_payment.sale_payload->>'offline_id', ''),
    NULLIF(v_payment.sale_payload->>'receipt_email', ''),
    NULLIF(v_payment.sale_payload->>'receipt_phone', ''), v_payment.created_by, v_payment.created_at
  ) RETURNING id INTO v_transaction_id;

  FOR v_line IN
    SELECT p.id, p.name, p.sku, (v->>'quantity')::INTEGER AS quantity,
           (v->>'unit_price')::NUMERIC AS unit_price, (v->>'line_total')::NUMERIC AS line_total
    FROM jsonb_array_elements(v_rows) v
    JOIN public.products p ON p.id::TEXT = v->>'product_id'
      AND p.organization_id = v_payment.organization_id
    ORDER BY p.id
  LOOP
    INSERT INTO public.pos_transaction_items (
      transaction_id, product_id, product_name, sku, quantity, unit_price, line_total
    ) VALUES (
      v_transaction_id, v_line.id, v_line.name, v_line.sku, v_line.quantity, v_line.unit_price, v_line.line_total
    ) RETURNING id INTO v_tx_item_id;

    v_items := v_items || jsonb_build_object(
      'name', v_line.name, 'sku', v_line.sku, 'quantity', v_line.quantity,
      'unit_price', v_line.unit_price, 'line_total', v_line.line_total
    );
    FOR v_bom IN
      SELECT stock_item_id, quantity, unit FROM public.product_bom
      WHERE product_id = v_line.id AND auto_deduct = true
      ORDER BY stock_item_id
    LOOP
      v_deduction := v_bom.quantity * v_line.quantity;
      INSERT INTO public.stock_movements (
        organization_id, movement_type, location_id, stock_item_id, quantity, unit,
        reference_type, reference_id, created_by
      ) VALUES (
        v_payment.organization_id, 'SALE_DEDUCT', v_location_id, v_bom.stock_item_id,
        -v_deduction, v_bom.unit, 'pos_transaction', v_transaction_id, v_payment.created_by
      ) RETURNING id INTO v_movement_id;

      INSERT INTO public.pos_stock_deductions (
        transaction_id, transaction_item_id, stock_item_id, quantity, unit, location_id, movement_id
      ) VALUES (
        v_transaction_id, v_tx_item_id, v_bom.stock_item_id,
        v_deduction, v_bom.unit, v_location_id, v_movement_id
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.pos_payments (transaction_id, payment_method, amount)
  VALUES (v_transaction_id, 'QR', v_total);
  v_receipt := jsonb_build_object(
    'transaction_id', v_transaction_id, 'transaction_number', v_tx_number,
    'receipt_number', v_receipt_number, 'branch_id', v_payment.branch_id,
    'items', v_items, 'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total,
    'payment_method', 'QR', 'cash_amount', 0, 'qr_amount', v_total, 'change_amount', 0,
    'created_at', v_payment.created_at, 'recorded_at', v_recorded_at
  );
  INSERT INTO public.pos_receipts (transaction_id, receipt_number, receipt_data)
  VALUES (v_transaction_id, v_receipt_number, v_receipt);

  v_event := jsonb_build_object(
    'eventType', 'FIUU_VT_LATE_QR_POSTED', 'reviewerId', p_reviewer_id,
    'shiftId', v_shift.id, 'providerOrderId', v_payment.provider_order_id,
    'providerTransactionId', p_provider_transaction_id, 'transactionId', v_transaction_id,
    'amountRm', v_total, 'shiftClosedAt', v_shift.closed_at,
    'originalOrderAt', v_payment.created_at, 'postedAt', v_recorded_at, 'notes', btrim(p_notes)
  );
  UPDATE public.pos_online_payments
  SET status = 'PAID', provider_transaction_id = p_provider_transaction_id,
      gateway_ref = p_provider_transaction_id, transaction_id = v_transaction_id,
      paid_at = v_recorded_at, failed_at = NULL,
      provider_confirmed_at = v_recorded_at, provider_confirmed_by = p_reviewer_id,
      fiuu_vt_review_required = false, fiuu_vt_review_resolution = 'CONFIRMED_CHARGED',
      fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_RESOLVED_CHARGED',
      fiuu_vt_review_resolved_at = v_recorded_at, fiuu_vt_review_resolved_by = p_reviewer_id,
      fiuu_vt_review_resolution_note = btrim(p_notes), fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = NULL, updated_at = v_recorded_at,
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(fiuu_vt_review_evidence, v_event)
  WHERE id = v_payment.id;

  UPDATE public.pos_shifts
  SET total_qr = total_qr + v_total, total_sales = total_sales + v_total,
      transaction_count = transaction_count + 1, updated_at = v_recorded_at
  WHERE id = v_shift.id;
  PERFORM public.refresh_pos_daily_summary(
    v_payment.organization_id, v_payment.branch_id, v_payment.created_at::DATE
  );
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_payment.organization_id, p_reviewer_id, 'FIUU_VT_LATE_QR_POSTED',
    'pos_online_payments', v_payment.id, jsonb_build_object('status', v_payment.status), v_event);

  RETURN jsonb_build_object('payment_id', v_payment.id, 'status', 'PAID',
    'resolution', 'CONFIRMED_CHARGED', 'transaction_id', v_transaction_id,
    'result', v_receipt, 'reused', false);
END;
$$;
REVOKE ALL ON FUNCTION public.post_pos_fiuu_vt_closed_shift_review(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_pos_fiuu_vt_review_for_shift(
  p_payment_id UUID, p_actor_id UUID, p_outcome TEXT,
  p_provider_transaction_id TEXT, p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_shift_id UUID;
  v_status public.pos_shift_status;
BEGIN
  SELECT shift_id INTO v_shift_id FROM public.pos_online_payments WHERE id = p_payment_id AND provider = 'fiuu_vt';
  SELECT status INTO v_status FROM public.pos_shifts WHERE id = v_shift_id FOR UPDATE;
  -- Durable callback intake serializes on the same shift lock. Do not allow
  -- a "not charged" override while an exact success is waiting for the worker.
  IF p_outcome = 'CONFIRMED_NOT_CHARGED' AND EXISTS (
    SELECT 1 FROM public.pos_fiuu_vt_attempts attempt
    JOIN public.pos_online_payments payment ON payment.id = attempt.payment_id
    WHERE payment.id = p_payment_id AND attempt.state = 'RECEIVED'
      AND attempt.op_type IN ('SALE', 'STATUS')
      AND attempt.provider_order_id = payment.provider_order_id
      AND attempt.result_json->>'orderId' = payment.provider_order_id
      AND attempt.result_json->>'status' = '00'
  ) THEN
    RAISE EXCEPTION 'A received provider success must be reconciled before confirming no charge';
  END IF;
  IF p_outcome = 'CONFIRMED_CHARGED' AND v_status = 'CLOSED' THEN
    RETURN public.post_pos_fiuu_vt_closed_shift_review(
      p_payment_id, p_actor_id, p_provider_transaction_id, p_notes
    );
  END IF;
  RETURN public.resolve_pos_fiuu_vt_provider_error(
    p_payment_id, p_actor_id, p_outcome, p_provider_transaction_id, p_notes
  );
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_pos_fiuu_vt_review_for_shift(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pos_fiuu_vt_review_for_shift(UUID, UUID, TEXT, TEXT, TEXT)
  TO service_role;

-- The daily summary displays the last recorded closure separately from its
-- date filter (including a shift which originally started on another day).
-- Return aggregates only; never expose payment IDs or payroll details.
CREATE OR REPLACE FUNCTION public.latest_pos_fiuu_vt_shift_close(p_branch_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'shift_number', shift.shift_number,
    'closed_at', closure.close_snapshot->'closed_at',
    'actual_work_ended_at', closure.close_snapshot->'actual_work_ended_at',
    'closing_cash', closure.close_snapshot->'closing_cash',
    'confirmed_qr_at_close_rm', closure.close_snapshot->'confirmed_qr_rm',
    'qr_confirmed_after_close_rm', COALESCE(totals.confirmed, 0),
    'qr_review_remaining', COALESCE(totals.review_count, 0),
    'qr_review_remaining_attempt_rm', COALESCE(totals.review_amount, 0)
  )
  FROM public.pos_fiuu_vt_shift_closures closure
  JOIN public.pos_shifts shift ON shift.id = closure.shift_id
    AND shift.organization_id = closure.organization_id AND shift.branch_id = closure.branch_id
  JOIN public.profiles actor ON actor.id = auth.uid()
    AND actor.organization_id = closure.organization_id AND actor.status = 'ACTIVE'
  CROSS JOIN LATERAL (
    SELECT sum(amount_rm) FILTER (WHERE status = 'PAID' AND transaction_id IS NOT NULL) AS confirmed,
           count(*) FILTER (WHERE status IN ('PENDING', 'REPORTED', 'QUARANTINED')) AS review_count,
           sum(amount_rm) FILTER (WHERE status IN ('PENDING', 'REPORTED', 'QUARANTINED')) AS review_amount
    FROM public.pos_online_payments
    WHERE id = ANY(closure.review_payment_ids)
      AND organization_id = closure.organization_id AND branch_id = closure.branch_id
      AND shift_id = closure.shift_id
  ) totals
  WHERE closure.branch_id = p_branch_id AND shift.status = 'CLOSED'
    AND public.has_branch_access(p_branch_id)
  ORDER BY shift.closed_at DESC, closure.shift_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.latest_pos_fiuu_vt_shift_close(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.latest_pos_fiuu_vt_shift_close(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_pos_fiuu_vt_closed_review(p_payment_id UUID, p_actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_online_payments payment
    JOIN public.pos_fiuu_vt_shift_closures closure
      ON closure.shift_id = payment.shift_id AND closure.organization_id = payment.organization_id
      AND closure.branch_id = payment.branch_id AND payment.id = ANY(closure.review_payment_ids)
    JOIN public.pos_shifts shift ON shift.id = closure.shift_id AND shift.status = 'CLOSED'
    WHERE payment.id = p_payment_id AND payment.provider = 'fiuu_vt'
      AND payment.created_by = p_actor_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_pos_fiuu_vt_closed_review(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pos_fiuu_vt_closed_review(UUID, UUID)
  TO service_role;
