-- Run on a disposable local DB with the migration installed, inside BEGIN /
-- ROLLBACK. All evidence below is synthetic: no provider call, charge or VOID.
DO $$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_shift UUID := gen_random_uuid();
  v_actor UUID := gen_random_uuid();
  v_finance UUID := gen_random_uuid();
  v_device public.pos_devices%ROWTYPE;
  v_product UUID := gen_random_uuid();
  v_location UUID;
  v_stock public.stock_items%ROWTYPE;
  v_stock_before NUMERIC;
  v_member UUID := gen_random_uuid();
  v_attempt_id UUID;
  v_void_attempt UUID := gen_random_uuid();
  v_payment_ids UUID[] := ARRAY[]::UUID[];
  v_active UUID := gen_random_uuid();
  v_cart UUID := gen_random_uuid();
  v_product_payload JSONB;
  v_closed JSONB;
  v_snapshot JSONB;
  v_sale JSONB;
  v_background JSONB;
  v_duplicate JSONB;
  v_total_before NUMERIC;
  v_new_shift UUID;
  v_tx UUID;
  v_closed_at TIMESTAMPTZ;
  v_ended_at TIMESTAMPTZ;
  v_blocked BOOLEAN;
BEGIN
  SELECT * INTO STRICT v_branch FROM public.branches WHERE branch_code = 'BR001';
  SELECT id INTO STRICT v_location FROM public.inventory_locations
  WHERE branch_id = v_branch.id AND location_type = 'BRANCH_KIOSK';
  SELECT * INTO v_stock FROM public.stock_items
  WHERE organization_id = v_branch.organization_id ORDER BY id LIMIT 1;

  INSERT INTO auth.users (id, email) VALUES
    (v_actor, v_actor::TEXT || '@example.invalid'),
    (v_finance, v_finance::TEXT || '@example.invalid');
  INSERT INTO public.profiles (id, organization_id, branch_id, full_name, role, status)
  VALUES (v_actor, v_branch.organization_id, v_branch.id, 'Synthetic shift closer', 'STAFF', 'ACTIVE'),
         (v_finance, v_branch.organization_id, NULL, 'Synthetic reviewer', 'FINANCE', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id,
    branch_id = EXCLUDED.branch_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status;
  PERFORM set_config('request.jwt.claim.sub', v_actor::TEXT, true);

  UPDATE public.pos_devices
  SET status = 'ACTIVE', enrolled_at = clock_timestamp(), enrolled_by = v_actor,
      serial_number = 'SYNTHETIC-SHIFT-CLOSE', imei = '990000000000031',
      asset_verified_at = clock_timestamp(), asset_verified_by = v_actor, enrollment_generation = 1,
      metadata = jsonb_build_object('official_hardware_profile', 'SAMSUNG_TAB_S10_LITE_5G_128')
  WHERE id = (SELECT id FROM public.pos_devices WHERE branch_id = v_branch.id ORDER BY id LIMIT 1)
  RETURNING * INTO STRICT v_device;

  INSERT INTO public.products (id, organization_id, sku, name, price)
  VALUES (v_product, v_branch.organization_id, v_product::TEXT, 'Synthetic QR item', 2.50);
  INSERT INTO public.product_bom (organization_id, product_id, stock_item_id, quantity, unit)
  VALUES (v_branch.organization_id, v_product, v_stock.id, 1, v_stock.base_unit);
  INSERT INTO public.inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
  VALUES (v_branch.organization_id, v_location, v_stock.id, 50, v_stock.base_unit)
  ON CONFLICT (location_id, stock_item_id) DO UPDATE SET quantity = 50
  RETURNING quantity INTO v_stock_before;
  INSERT INTO public.pos_shifts (
    id, organization_id, branch_id, shift_number, opened_by, opening_cash, total_cash, total_qr,
    total_sales, transaction_count, opened_at
  ) VALUES (
    v_shift, v_branch.organization_id, v_branch.id, v_shift::TEXT, v_actor, 100, 3.50, 18,
    21.50, 6, now() - interval '1 hour'
  );
  INSERT INTO public.pos_shift_staff_members (
    id, organization_id, branch_id, shift_id, profile_id, full_name, role_in_shift, status,
    started_at, started_by
  ) VALUES (
    v_member, v_branch.organization_id, v_branch.id, v_shift, v_actor, 'Synthetic shift closer',
    'JUALAN', 'ACTIVE', now() - interval '50 minutes', v_actor
  );
  INSERT INTO public.pos_shift_stock_check_logs (
    organization_id, branch_id, shift_id, check_type, production_date, completed_by
  ) VALUES (v_branch.organization_id, v_branch.id, v_shift, 'CLOSE_SHIFT', CURRENT_DATE, v_actor);

  v_product_payload := jsonb_build_object(
    'fiuu_branch_code', 'BR001', 'branchId', v_branch.id, 'shiftId', v_shift,
    'fiuu_device_id', v_device.id, 'fiuu_device_code', v_device.device_code,
    'fiuu_enrollment_generation', v_device.enrollment_generation,
    'payment_method', 'QR', 'cash_amount', 0, 'qr_amount', 2.50, 'discount', 0,
    'total', 2.50, 'subtotal', 2.50,
    'items', jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
    'pricing_snapshot', jsonb_build_array(jsonb_build_object(
      'product_id', v_product, 'quantity', 1, 'unit_price', 2.50, 'line_total', 2.50
    ))
  );

  FOR i IN 1..12 LOOP
    v_attempt_id := CASE WHEN i = 12 THEN v_active ELSE gen_random_uuid() END;
    INSERT INTO public.pos_online_payments (
      id, organization_id, branch_id, shift_id, amount_rm, status, provider,
      provider_order_id, sale_payload, created_by, expires_at, idempotency_key
    ) VALUES (
      v_attempt_id, v_branch.organization_id, v_branch.id, v_shift, 2.50, 'PENDING', 'fiuu_vt',
      'RKJ_' || upper(replace(v_attempt_id::TEXT, '-', '')),
      v_product_payload || jsonb_build_object('cart_session_id', CASE WHEN i <= 2 THEN v_cart ELSE gen_random_uuid() END),
      v_actor, CASE WHEN i = 11 THEN now() - interval '21 minutes' ELSE now() + interval '10 minutes' END,
      v_attempt_id::TEXT
    );
    IF i < 11 THEN
      v_payment_ids := array_append(v_payment_ids, v_attempt_id);
      UPDATE public.pos_online_payments
      SET status = 'QUARANTINED', fiuu_vt_review_required = true,
        fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW'
      WHERE id = v_attempt_id;
    ELSIF i = 11 THEN
      v_payment_ids := array_append(v_payment_ids, v_attempt_id);
      INSERT INTO public.pos_fiuu_vt_attempts (
        id, payment_id, provider_order_id, op_type, callback_host, state, expires_at, expired_at
      ) VALUES (
        v_void_attempt, v_attempt_id, 'RKJ_' || upper(replace(v_attempt_id::TEXT, '-', '')),
        'VOID', 'a-' || replace(v_void_attempt::TEXT, '-', '') || '.fiuu-vt.rkj.one',
        'EXPIRED', now() - interval '21 minutes', now() - interval '21 minutes'
      );
      UPDATE public.pos_online_payments
      SET fiuu_vt_cashier_released_at = now() - interval '25 minutes',
        fiuu_vt_cancel_requested_at = now() - interval '25 minutes',
        fiuu_vt_cancel_attempt_id = v_void_attempt
      WHERE id = v_attempt_id;
    END IF;
  END LOOP;

  -- Opt-in is absent; the new RPC cannot silently bypass the old guard.
  v_blocked := false;
  BEGIN
    PERFORM public.close_pos_shift_with_qr_review(v_shift, v_actor, v_device.id, 1, 103.50, clock_timestamp());
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Default close gate did not block'; END IF;

  INSERT INTO public.pos_fiuu_vt_shift_close_rollout (branch_id) VALUES (v_branch.id);
  IF has_function_privilege('authenticated',
    'public.close_pos_shift_with_qr_review(uuid,uuid,uuid,integer,numeric,timestamptz,text)', 'EXECUTE')
    OR has_table_privilege('authenticated', 'public.pos_fiuu_vt_shift_closures', 'UPDATE') THEN
    RAISE EXCEPTION 'A cashier can bypass registered-device authentication';
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.close_pos_shift_with_qr_review(v_shift, v_actor, v_device.id, 1, 103.50, clock_timestamp());
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked OR EXISTS (
    SELECT 1 FROM public.pos_shifts WHERE id = v_shift
      AND (status <> 'OPEN' OR actual_work_ended_at IS NOT NULL OR closing_cash IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.pos_shift_staff_members WHERE id = v_member AND status <> 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'A blocked close did not roll back cash/time/staff';
  END IF;

  -- Fixture only: a provider-terminal failure is not a payment awaiting review.
  UPDATE public.pos_online_payments SET status = 'FAILED' WHERE id = v_active;
  v_ended_at := clock_timestamp();
  v_closed := public.close_pos_shift_with_qr_review(v_shift, v_actor, v_device.id, 1, 103.50, v_ended_at);
  SELECT closed_at INTO v_closed_at FROM public.pos_shifts WHERE id = v_shift;
  SELECT close_snapshot INTO v_snapshot FROM public.pos_fiuu_vt_shift_closures WHERE shift_id = v_shift;
  IF (v_closed->>'qr_review_count')::INTEGER IS DISTINCT FROM 11
    OR (v_closed->>'confirmed_qr_rm')::NUMERIC IS DISTINCT FROM 18
    OR (v_closed->>'qr_review_attempt_total_rm')::NUMERIC IS DISTINCT FROM 27.50
    OR v_snapshot->'staff'->0->>'member_id' IS DISTINCT FROM v_member::TEXT
    OR (SELECT count(*) FROM public.pos_online_payments WHERE id = ANY(v_payment_ids)
        AND status IN ('QUARANTINED', 'PENDING') AND transaction_id IS NULL) <> 11 THEN
    RAISE EXCEPTION 'Close did not preserve original snapshot and unresolved QR';
  END IF;

  PERFORM public.open_pos_shift(p_branch_id => v_branch.id, p_opening_cash => 100);
  SELECT id, total_sales INTO STRICT v_new_shift, v_total_before
  FROM public.pos_shifts WHERE branch_id = v_branch.id AND status = 'OPEN';
  IF v_new_shift = v_shift THEN RAISE EXCEPTION 'Successor reused original shift'; END IF;

  -- The recovery worker can still move a detached PENDING attempt to the
  -- exception queue on the original closed shift; time out is not no-charge.
  v_background := public.quarantine_pos_fiuu_vt_released_timeout(
    v_payment_ids[11], (SELECT updated_at FROM public.pos_online_payments WHERE id = v_payment_ids[11])
  );
  IF v_background->>'outcome' IS DISTINCT FROM 'QUARANTINED'
  OR NOT EXISTS (
    SELECT 1 FROM public.pos_online_payments WHERE id = v_payment_ids[11]
    AND shift_id = v_shift AND status = 'QUARANTINED' AND fiuu_vt_review_required
    AND transaction_id IS NULL AND paid_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Background review stopped or invented a provider outcome after shift close: %', v_background;
  END IF;

  -- Simulate Finance confirming provider evidence after close. Change the
  -- catalog price to prove the original prices, not today's, are used.
  UPDATE public.products SET price = 3.50 WHERE id = v_product;
  v_sale := public.resolve_pos_fiuu_vt_review_for_shift(
    v_payment_ids[1], v_finance, 'CONFIRMED_CHARGED', 'FIXTURE-LATE-PROVIDER-001', 'Synthetic matched provider evidence'
  );
  v_tx := (v_sale->>'transaction_id')::UUID;
  v_duplicate := public.resolve_pos_fiuu_vt_review_for_shift(
    v_payment_ids[1], v_finance, 'CONFIRMED_CHARGED', 'FIXTURE-LATE-PROVIDER-001', 'Synthetic repeated provider evidence'
  );
  IF (v_duplicate->>'reused')::BOOLEAN IS DISTINCT FROM true
    OR v_duplicate->>'transaction_id' IS DISTINCT FROM v_tx::TEXT THEN
    RAISE EXCEPTION 'Exact replay created a different sale';
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.resolve_pos_fiuu_vt_review_for_shift(
      v_payment_ids[2], v_finance, 'CONFIRMED_CHARGED', 'FIXTURE-LATE-PROVIDER-002', 'Synthetic second charge for same cart'
    );
  EXCEPTION WHEN unique_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked OR (SELECT count(*) FROM public.pos_transactions WHERE shift_id = v_shift) <> 1
    OR (SELECT count(*) FROM public.pos_receipts WHERE transaction_id = v_tx) <> 1
    OR (SELECT count(*) FROM public.pos_stock_deductions WHERE transaction_id = v_tx) <> 1
    OR (SELECT quantity FROM public.inventory_balances WHERE location_id = v_location AND stock_item_id = v_stock.id)
      IS DISTINCT FROM v_stock_before - 1
    OR (SELECT total_sales FROM public.pos_shifts WHERE id = v_new_shift) IS DISTINCT FROM v_total_before
    OR NOT EXISTS (
      SELECT 1 FROM public.pos_shifts WHERE id = v_shift AND status = 'CLOSED'
      AND closed_at = v_closed_at AND actual_work_ended_at = v_ended_at
      AND closing_cash = 103.50 AND total_cash = 3.50 AND total_qr = 20.50 AND total_sales = 24
    ) OR (SELECT close_snapshot FROM public.pos_fiuu_vt_shift_closures WHERE shift_id = v_shift)
      IS DISTINCT FROM v_snapshot
    OR (public.latest_pos_fiuu_vt_shift_close(v_branch.id)->>'qr_review_remaining')::INTEGER IS DISTINCT FROM 10
    OR (public.latest_pos_fiuu_vt_shift_close(v_branch.id)->>'qr_confirmed_after_close_rm')::NUMERIC IS DISTINCT FROM 2.50
    OR (SELECT count(*) FROM public.audit_logs WHERE entity_id = v_payment_ids[1]
      AND action = 'FIUU_VT_LATE_QR_POSTED') <> 1 THEN
    RAISE EXCEPTION 'Late sale, stock, snapshot or idempotency result was unsafe';
  END IF;
  RAISE NOTICE 'Passed: default-off, active QR block with rollback, STAFF closure with 11 reviews, successor shift, background timeout, Finance late QR with original pricing, single receipt/stock/audit, duplicate-cart rollback';
END;
$$;
