-- Transactional integration coverage for
-- The STATUS retry quarantine and its elapsed-callback-window forward fix.
-- Run after the migration in a disposable/local database and roll the outer
-- transaction back. No provider call or real payment is created.

CREATE TEMP TABLE _fiuu_vt_retry_test_context (
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  branch_code TEXT NOT NULL,
  actor_id UUID NOT NULL,
  device_id UUID NOT NULL,
  shift_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO _fiuu_vt_retry_test_context (
  organization_id,
  branch_id,
  branch_code,
  actor_id,
  device_id,
  shift_id
)
SELECT
  branch.organization_id,
  branch.id,
  branch.branch_code,
  '91000000-0000-4000-8000-000000000001'::UUID,
  (
    SELECT device.id
    FROM public.pos_devices AS device
    WHERE device.branch_id = branch.id
    ORDER BY device.created_at
    LIMIT 1
  ),
  '91000000-0000-4000-8000-000000000003'::UUID
FROM public.branches AS branch
WHERE branch.branch_code = 'BR001'
LIMIT 1;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fiuu_vt_retry_test_context) <> 1 THEN
    RAISE EXCEPTION 'Local integration fixture requires exactly one BR001 branch';
  END IF;
END;
$$;

SET LOCAL session_replication_role = replica;

INSERT INTO public.profiles (
  id,
  organization_id,
  full_name,
  email,
  role,
  status,
  must_change_password
)
SELECT
  actor_id,
  organization_id,
  'Fiuu VT retry test actor',
  'fiuu-vt-retry-test@example.invalid',
  'SUPER_ADMIN',
  'ACTIVE',
  false
FROM _fiuu_vt_retry_test_context;

UPDATE public.pos_devices AS device
SET device_code = 'POS-BR001-RETRY-TEST',
    device_name = 'BR001 retry integration tablet',
    status = 'ACTIVE',
    enrolled_at = clock_timestamp(),
    enrolled_by = context.actor_id,
    metadata = jsonb_build_object(
    'official_hardware_profile',
    'SAMSUNG_TAB_S10_LITE_5G_128'
    ),
    created_by = context.actor_id,
    serial_number = 'RKJ-RETRY-TEST-001',
    imei = '990000000000001',
    asset_verified_at = clock_timestamp(),
    asset_verified_by = context.actor_id,
    enrollment_generation = 7
FROM _fiuu_vt_retry_test_context AS context
WHERE device.id = context.device_id;

INSERT INTO public.pos_shifts (
  id,
  organization_id,
  branch_id,
  shift_number,
  opened_by,
  status,
  opening_cash
)
SELECT
  shift_id,
  organization_id,
  branch_id,
  'FIUU-VT-RETRY-TEST',
  actor_id,
  'OPEN',
  0
FROM _fiuu_vt_retry_test_context;

DO $$
DECLARE
  v_ctx _fiuu_vt_retry_test_context%ROWTYPE;
  v_payment_id UUID;
  v_result JSONB;
  v_attempt_index INTEGER;
  v_callback_host TEXT;
  v_new_checkout UUID := '92000000-0000-4000-8000-000000000099'::UUID;
BEGIN
  SELECT * INTO STRICT v_ctx FROM _fiuu_vt_retry_test_context;

  -- Case 1: a recently expired payment below the STATUS budget stays blocked.
  v_payment_id := '92000000-0000-4000-8000-000000000001'::UUID;
  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    2.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-RETRY-TEST',
      'fiuu_enrollment_generation', 7
    ),
    v_ctx.actor_id, clock_timestamp() - interval '1 minute', 'RETRYTEST001'
  );
  FOR v_attempt_index IN 1..2 LOOP
    v_callback_host := 'a-' || lpad(to_hex(100 + v_attempt_index), 32, '0')
      || '.fiuu-vt.rkj.one';
    INSERT INTO public.pos_fiuu_vt_attempts (
      payment_id, provider_order_id, op_type, callback_host, state,
      expires_at, expired_at
    ) VALUES (
      v_payment_id, 'RETRYTEST001', 'STATUS', v_callback_host, 'EXPIRED',
      clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 minute'
    );
  END LOOP;
  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF v_result->>'outcome' <> 'NOT_ELIGIBLE'
    OR v_result->>'reason' <> 'STATUS_RETRY_BUDGET_NOT_EXHAUSTED'
    OR (SELECT status FROM public.pos_online_payments WHERE id = v_payment_id)
      <> 'PENDING' THEN
    RAISE EXCEPTION 'Below-budget quarantine guard failed: %', v_result;
  END IF;
  UPDATE public.pos_online_payments SET status = 'EXPIRED' WHERE id = v_payment_id;

  -- Case 2: an unexpired native launch lease prevents quarantine.
  v_payment_id := '92000000-0000-4000-8000-000000000002'::UUID;
  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    3.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-RETRY-TEST',
      'fiuu_enrollment_generation', 7
    ),
    v_ctx.actor_id, clock_timestamp() - interval '21 minutes', 'RETRYTEST002'
  );
  FOR v_attempt_index IN 1..1 LOOP
    v_callback_host := 'a-' || lpad(to_hex(200 + v_attempt_index), 32, '0')
      || '.fiuu-vt.rkj.one';
    INSERT INTO public.pos_fiuu_vt_attempts (
      payment_id, provider_order_id, op_type, callback_host, state,
      expires_at, expired_at
    ) VALUES (
      v_payment_id, 'RETRYTEST002', 'STATUS', v_callback_host, 'EXPIRED',
      clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 minute'
    );
  END LOOP;
  INSERT INTO public.pos_fiuu_vt_attempts (
    payment_id, provider_order_id, op_type, callback_host, state,
    expires_at, launch_lease_token, launch_lease_expires_at,
    launch_lease_generation
  ) VALUES (
    v_payment_id, 'RETRYTEST002', 'STATUS',
    'a-00000000000000000000000000000203.fiuu-vt.rkj.one',
    'PREPARED', clock_timestamp() + interval '1 minute', gen_random_uuid(),
    clock_timestamp() + interval '1 minute', 1
  );
  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF v_result->>'outcome' <> 'CALLBACK_ACTIVE'
    OR (SELECT status FROM public.pos_online_payments WHERE id = v_payment_id)
      <> 'PENDING' THEN
    RAISE EXCEPTION 'Active-launch quarantine guard failed: %', v_result;
  END IF;
  UPDATE public.pos_online_payments SET status = 'EXPIRED' WHERE id = v_payment_id;

  -- Case 3: provider success evidence on any attempt fails closed.
  v_payment_id := '92000000-0000-4000-8000-000000000003'::UUID;
  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    7.00, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-RETRY-TEST',
      'fiuu_enrollment_generation', 7
    ),
    v_ctx.actor_id, clock_timestamp() - interval '21 minutes', 'RETRYTEST003'
  );
  FOR v_attempt_index IN 1..2 LOOP
    v_callback_host := 'a-' || lpad(to_hex(300 + v_attempt_index), 32, '0')
      || '.fiuu-vt.rkj.one';
    INSERT INTO public.pos_fiuu_vt_attempts (
      payment_id, provider_order_id, op_type, callback_host, state,
      expires_at, consumed_at, result_json
    ) VALUES (
      v_payment_id, 'RETRYTEST003', 'STATUS', v_callback_host, 'CONSUMED',
      clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 minute',
      CASE WHEN v_attempt_index = 2
        THEN jsonb_build_object('status', '00', 'transactionId', 'LATE-TEST-003')
        ELSE jsonb_build_object('status', '5000')
      END
    );
  END LOOP;
  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF v_result->>'outcome' <> 'NOT_ELIGIBLE'
    OR v_result->>'reason' <> 'ATTEMPT_PROVIDER_SUCCESS_EVIDENCE'
    OR (SELECT status FROM public.pos_online_payments WHERE id = v_payment_id)
      <> 'PENDING' THEN
    RAISE EXCEPTION 'Provider-success quarantine guard failed: %', v_result;
  END IF;
  UPDATE public.pos_online_payments SET status = 'EXPIRED' WHERE id = v_payment_id;

  -- BR001 regression: original SALE launched, no callback, zero STATUS attempts.
  -- Hold the lock while the grace is open; once elapsed keep attribution, do
  -- not mark the provider cancelled, paid, or failed, and release for HQ review.
  v_payment_id := '92000000-0000-4000-8000-000000000005'::UUID;
  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    3.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-RETRY-TEST',
      'fiuu_enrollment_generation', 7
    ),
    v_ctx.actor_id, clock_timestamp() - interval '21 minutes', 'RETRYTEST005'
  );
  v_callback_host := 'a-00000000000000000000000000000501.fiuu-vt.rkj.one';
  INSERT INTO public.pos_fiuu_vt_attempts (
    payment_id, provider_order_id, op_type, callback_host, state, expires_at, launched_at,
    launch_lease_token, launch_lease_expires_at, launch_lease_generation
  ) VALUES (
    v_payment_id, 'RETRYTEST005', 'SALE', v_callback_host, 'LAUNCHED',
    clock_timestamp() - interval '21 minutes', clock_timestamp() - interval '36 minutes',
    gen_random_uuid(), clock_timestamp() - interval '21 minutes', 1
  );
  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF v_result->>'outcome' IS DISTINCT FROM 'QUARANTINED'
    OR NOT EXISTS (
      SELECT 1 FROM public.pos_online_payments
      WHERE id = v_payment_id AND status = 'QUARANTINED'
        AND fiuu_vt_review_required AND failed_at IS NULL AND paid_at IS NULL
        AND provider_result IS NULL AND provider_transaction_id IS NULL AND transaction_id IS NULL
        AND fiuu_vt_recovery_last_error = 'STATUS_WINDOW_ELAPSED_WITHOUT_RESULT'
        AND fiuu_vt_review_evidence->'events'->0->>'releasePath' = 'CALLBACK_WINDOW_ELAPSED'
        AND fiuu_vt_review_evidence->'events'->0->>'providerCancellationConfirmed' = 'false'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.pos_fiuu_vt_attempts WHERE payment_id = v_payment_id
        AND op_type = 'SALE' AND callback_host = v_callback_host
        AND result_json IS NULL AND state = 'QUARANTINED'
    ) THEN
    RAISE EXCEPTION 'Elapsed callback window with no STATUS did not enter safe HQ review: %', v_result;
  END IF;
  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF (v_result->>'reused')::BOOLEAN IS DISTINCT FROM true
    OR (SELECT count(*) FROM public.audit_logs WHERE entity_id = v_payment_id
        AND action = 'FIUU_VT_STATUS_RETRY_LIMIT_QUARANTINED') <> 1 THEN
    RAISE EXCEPTION 'Elapsed callback window did not replay idempotently: %', v_result;
  END IF;

  -- Case 4: an eligible payment is quarantined exactly once and a late
  -- callback review cannot mutate the following checkout.
  v_payment_id := '92000000-0000-4000-8000-000000000004'::UUID;
  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    10.00, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-RETRY-TEST',
      'fiuu_enrollment_generation', 7
    ),
    v_ctx.actor_id, clock_timestamp() - interval '1 minute', 'RETRYTEST004'
  );
  FOR v_attempt_index IN 1..3 LOOP
    v_callback_host := 'a-' || lpad(to_hex(400 + v_attempt_index), 32, '0')
      || '.fiuu-vt.rkj.one';
    INSERT INTO public.pos_fiuu_vt_attempts (
      payment_id, provider_order_id, op_type, callback_host, state,
      expires_at, expired_at
    ) VALUES (
      v_payment_id, 'RETRYTEST004', 'STATUS', v_callback_host, 'EXPIRED',
      clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 minute'
    );
  END LOOP;
  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, gen_random_uuid(), v_ctx.device_id, 7
  );
  IF v_result->>'outcome' <> 'FORBIDDEN' THEN
    RAISE EXCEPTION 'Cashier ownership guard failed: %', v_result;
  END IF;

  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF v_result->>'outcome' <> 'QUARANTINED'
    OR v_result->>'payment_status' <> 'QUARANTINED'
    OR v_result->>'review_state' <> 'PROVIDER_ERROR_REVIEW'
    OR (v_result->>'reused')::BOOLEAN
    OR (SELECT status FROM public.pos_online_payments WHERE id = v_payment_id)
      <> 'QUARANTINED'
    OR (SELECT fiuu_vt_review_required FROM public.pos_online_payments WHERE id = v_payment_id)
      IS DISTINCT FROM true
    OR (SELECT count(*) FROM public.pos_fiuu_vt_attempts
        WHERE payment_id = v_payment_id AND state = 'QUARANTINED') <> 3
    OR (SELECT count(*) FROM public.audit_logs
        WHERE entity_id = v_payment_id
          AND action = 'FIUU_VT_STATUS_RETRY_LIMIT_QUARANTINED') <> 1 THEN
    RAISE EXCEPTION 'Eligible quarantine transition failed: %', v_result;
  END IF;

  v_result := public.park_pos_fiuu_vt_status_retry_limit(
    v_payment_id, v_ctx.actor_id, v_ctx.device_id, 7
  );
  IF v_result->>'outcome' <> 'QUARANTINED'
    OR (v_result->>'reused')::BOOLEAN IS DISTINCT FROM true
    OR (SELECT count(*) FROM public.audit_logs
        WHERE entity_id = v_payment_id
          AND action = 'FIUU_VT_STATUS_RETRY_LIMIT_QUARANTINED') <> 1 THEN
    RAISE EXCEPTION 'Idempotent quarantine replay failed: %', v_result;
  END IF;

  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_new_checkout, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    3.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-RETRY-TEST',
      'fiuu_enrollment_generation', 7
    ),
    v_ctx.actor_id, clock_timestamp() + interval '15 minutes', 'RETRYTEST099'
  );
  v_result := public.mark_pos_fiuu_vt_review_status_aware(
    v_payment_id,
    'LATE_SUCCESS_REVIEW',
    jsonb_build_object(
      'providerOrderId', 'RETRYTEST004',
      'transactionId', 'LATE-TEST-004'
    )
  );
  IF (v_result->>'related_payments')::INTEGER <> 0
    OR (SELECT status FROM public.pos_online_payments WHERE id = v_payment_id)
      <> 'QUARANTINED'
    OR (SELECT fiuu_vt_reconciliation_state FROM public.pos_online_payments
        WHERE id = v_payment_id) <> 'LATE_SUCCESS_REVIEW'
    OR (SELECT status FROM public.pos_online_payments WHERE id = v_new_checkout)
      <> 'PENDING'
    OR (SELECT transaction_id FROM public.pos_online_payments
        WHERE id = v_new_checkout) IS NOT NULL THEN
    RAISE EXCEPTION 'Late-callback checkout isolation failed: %', v_result;
  END IF;
END;
$$;

SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_ctx _fiuu_vt_retry_test_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_ctx FROM _fiuu_vt_retry_test_context;

  BEGIN
    INSERT INTO public.pos_transactions (
      organization_id, branch_id, shift_id, transaction_number,
      subtotal, total, payment_method, cash_amount, qr_amount,
      offline_id, synced_at, created_by
    ) VALUES (
      v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
      'OFFLINE-GUARD-QR-TEST', 10, 10, 'QR', 0, 10,
      'offline-guard-qr-test', clock_timestamp(), v_ctx.actor_id
    );
    RAISE EXCEPTION 'Offline QR insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Offline QR insert unexpectedly succeeded'
      OR SQLERRM NOT LIKE 'Offline POS only accepts cash payments%' THEN
      RAISE;
    END IF;
  END;

  INSERT INTO public.pos_transactions (
    organization_id, branch_id, shift_id, transaction_number,
    subtotal, total, payment_method, cash_amount, qr_amount,
    offline_id, synced_at, created_by
  ) VALUES (
    v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    'OFFLINE-GUARD-CASH-TEST', 10, 10, 'CASH', 10, 0,
    'offline-guard-cash-test', clock_timestamp(), v_ctx.actor_id
  );

  IF (SELECT count(*) FROM public.pos_transactions
      WHERE offline_id = 'offline-guard-cash-test') <> 1 THEN
    RAISE EXCEPTION 'Offline cash guard fixture was not recorded exactly once';
  END IF;
END;
$$;

SELECT 'fiuu_vt_status_retry_quarantine_integration_ok' AS result;
