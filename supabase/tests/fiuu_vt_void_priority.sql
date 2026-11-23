-- Transactional integration coverage for
-- 20261123203000_prioritize_fiuu_vt_void_over_status.sql.
-- This fixture performs no provider call and rolls back every database change.

BEGIN;

CREATE TEMP TABLE _fiuu_vt_void_priority_context (
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  branch_code TEXT NOT NULL,
  actor_id UUID NOT NULL,
  device_id UUID NOT NULL,
  shift_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO _fiuu_vt_void_priority_context (
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
  '93000000-0000-4000-8000-000000000001'::UUID,
  (
    SELECT device.id
    FROM public.pos_devices AS device
    WHERE device.branch_id = branch.id
    ORDER BY device.created_at
    LIMIT 1
  ),
  COALESCE(
    (
      SELECT shift.id
      FROM public.pos_shifts AS shift
      WHERE shift.branch_id = branch.id
        AND shift.status = 'OPEN'
      ORDER BY shift.opened_at DESC
      LIMIT 1
    ),
    '93000000-0000-4000-8000-000000000003'::UUID
  )
FROM public.branches AS branch
WHERE branch.branch_code = 'BR001'
LIMIT 1;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fiuu_vt_void_priority_context) <> 1
    OR (SELECT device_id FROM _fiuu_vt_void_priority_context) IS NULL THEN
    RAISE EXCEPTION 'Integration fixture requires BR001 and one enrolled device';
  END IF;
END;
$$;

SET LOCAL session_replication_role = replica;

INSERT INTO public.profiles (
  id, organization_id, full_name, email, role, status, must_change_password
)
SELECT
  actor_id,
  organization_id,
  'Fiuu VT VOID priority test actor',
  'fiuu-vt-void-priority@example.invalid',
  'SUPER_ADMIN',
  'ACTIVE',
  false
FROM _fiuu_vt_void_priority_context;

INSERT INTO public.profiles (
  id, organization_id, full_name, email, role, status, must_change_password
)
SELECT
  actor.id,
  context.organization_id,
  actor.full_name,
  actor.email,
  'SUPER_ADMIN',
  'ACTIVE',
  false
FROM _fiuu_vt_void_priority_context AS context
CROSS JOIN (
  VALUES
    (
      '93000000-0000-4000-8000-000000000002'::UUID,
      'Fiuu VT constraint test actor',
      'fiuu-vt-constraint@example.invalid'
    ),
    (
      '93000000-0000-4000-8000-000000000006'::UUID,
      'Fiuu VT other-payment test actor',
      'fiuu-vt-other-payment@example.invalid'
    )
) AS actor(id, full_name, email);

UPDATE public.pos_devices AS device
SET device_code = 'POS-BR001-VOID-PRIORITY-TEST',
    device_name = 'BR001 VOID priority integration tablet',
    status = 'ACTIVE',
    enrolled_at = clock_timestamp(),
    enrolled_by = context.actor_id,
    metadata = jsonb_build_object(
      'official_hardware_profile',
      'SAMSUNG_TAB_S10_LITE_5G_128'
    ),
    created_by = context.actor_id,
    serial_number = 'RKJ-VOID-PRIORITY-001',
    imei = '990000000000011',
    asset_verified_at = clock_timestamp(),
    asset_verified_by = context.actor_id,
    enrollment_generation = 11
FROM _fiuu_vt_void_priority_context AS context
WHERE device.id = context.device_id;

INSERT INTO public.pos_shifts (
  id, organization_id, branch_id, shift_number,
  opened_by, status, opening_cash
)
SELECT
  shift_id,
  organization_id,
  branch_id,
  'FIUU-VT-VOID-PRIORITY-TEST',
  actor_id,
  'OPEN',
  0
FROM _fiuu_vt_void_priority_context
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pos_shifts AS existing_shift
  WHERE existing_shift.id =
    _fiuu_vt_void_priority_context.shift_id
);

-- Fixture-only trigger bypass ends here. All supersession assertions below
-- execute with production FK/check/constraint-trigger behaviour enabled.
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_ctx _fiuu_vt_void_priority_context%ROWTYPE;
  v_payment_id UUID := '94000000-0000-4000-8000-000000000001'::UUID;
  v_status_attempt_id UUID := '94000000-0000-4000-8000-000000000002'::UUID;
  v_void_attempt_id UUID := '94000000-0000-4000-8000-000000000003'::UUID;
  v_callback_host TEXT := 'a-94000000000040008000000000000003.fiuu-vt.rkj.one';
  v_processing_token UUID := gen_random_uuid();
  v_second_payment_id UUID := '94000000-0000-4000-8000-000000000011'::UUID;
  v_second_status_id UUID := '94000000-0000-4000-8000-000000000012'::UUID;
  v_constraint_payment_id UUID := '94000000-0000-4000-8000-000000000021'::UUID;
  v_other_payment_id UUID := '94000000-0000-4000-8000-000000000031'::UUID;
  v_constraint_actor_id UUID := '93000000-0000-4000-8000-000000000002'::UUID;
  v_other_actor_id UUID := '93000000-0000-4000-8000-000000000006'::UUID;
  v_missing_source_id UUID := '94000000-0000-4000-8000-000000000022'::UUID;
  v_wrong_payment_source_id UUID := '94000000-0000-4000-8000-000000000023'::UUID;
  v_non_void_source_id UUID := '94000000-0000-4000-8000-000000000024'::UUID;
  v_non_void_target_id UUID := '94000000-0000-4000-8000-000000000025'::UUID;
  v_wrong_payment_target_id UUID := '94000000-0000-4000-8000-000000000032'::UUID;
  v_result JSONB;
  v_late_callback JSONB;
  v_completion JSONB;
  v_replay JSONB;
  v_constraint_name TEXT;
BEGIN
  SELECT * INTO STRICT v_ctx FROM _fiuu_vt_void_priority_context;

  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    2.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-VOID-PRIORITY-TEST',
      'fiuu_enrollment_generation', 11,
      'branchId', v_ctx.branch_id,
      'shiftId', v_ctx.shift_id,
      'qr_amount', 2.50
    ),
    v_ctx.actor_id,
    clock_timestamp() + interval '15 minutes',
    'VOIDPRIORITY001'
  );

  INSERT INTO public.pos_fiuu_vt_attempts (
    id, payment_id, provider_order_id, op_type, callback_host, state,
    expires_at, launched_at, launch_lease_token,
    launch_lease_expires_at, launch_lease_generation
  ) VALUES (
    v_status_attempt_id,
    v_payment_id,
    'VOIDPRIORITY001',
    'STATUS',
    'a-94000000000040008000000000000002.fiuu-vt.rkj.one',
    'LAUNCHED',
    clock_timestamp() + interval '5 minutes',
    clock_timestamp(),
    gen_random_uuid(),
    clock_timestamp() + interval '25 seconds',
    1
  );

  v_result := public.claim_pos_fiuu_vt_launch_lease(
    v_payment_id,
    'VOID',
    v_void_attempt_id,
    v_callback_host,
    gen_random_uuid(),
    v_ctx.actor_id
  );

  IF v_result->>'outcome' <> 'LAUNCH'
    OR v_result->>'reason' <> 'STATUS_SUPERSEDED_BY_VOID'
    OR (v_result->>'superseded_status_count')::INTEGER <> 1
    OR (SELECT state FROM public.pos_fiuu_vt_attempts
        WHERE id = v_status_attempt_id) <> 'EXPIRED'
    OR (SELECT superseded_by_attempt_id FROM public.pos_fiuu_vt_attempts
        WHERE id = v_status_attempt_id) IS DISTINCT FROM v_void_attempt_id
    OR (SELECT supersession_reason FROM public.pos_fiuu_vt_attempts
        WHERE id = v_status_attempt_id) <> 'VOID_REQUESTED'
    OR (SELECT count(*) FROM public.pos_fiuu_vt_attempts
        WHERE id = v_status_attempt_id) <> 1
    OR (SELECT state FROM public.pos_fiuu_vt_attempts
        WHERE id = v_void_attempt_id) <> 'PREPARED'
    OR (SELECT status FROM public.pos_online_payments
        WHERE id = v_payment_id) <> 'PENDING'
    OR (SELECT fiuu_vt_cancel_requested_at FROM public.pos_online_payments
        WHERE id = v_payment_id) IS NOT NULL
    OR (SELECT fiuu_vt_cashier_released_at FROM public.pos_online_payments
        WHERE id = v_payment_id) IS NOT NULL THEN
    RAISE EXCEPTION 'STATUS-to-VOID priority transition failed: %', v_result;
  END IF;

  -- Force both initially-deferred invariants now; a final transaction ROLLBACK
  -- would otherwise never prove that the replacement FK/target checks pass.
  SET CONSTRAINTS pos_fiuu_vt_attempts_superseded_by_attempt_fkey,
    enforce_pos_fiuu_vt_attempt_supersession IMMEDIATE;
  SET CONSTRAINTS pos_fiuu_vt_attempts_superseded_by_attempt_fkey,
    enforce_pos_fiuu_vt_attempt_supersession DEFERRED;

  -- A privileged malformed write cannot use supersession metadata to escape
  -- either active-attempt uniqueness index. Exercise missing, cross-payment,
  -- and non-VOID targets with the real deferred constraints enabled.
  UPDATE public.pos_online_payments
  SET status = 'EXPIRED'
  WHERE id = v_payment_id;

  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_constraint_payment_id, v_ctx.organization_id, v_ctx.branch_id,
    v_ctx.shift_id, 4.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-VOID-PRIORITY-TEST',
      'fiuu_enrollment_generation', 11,
      'branchId', v_ctx.branch_id,
      'shiftId', v_ctx.shift_id,
      'qr_amount', 4.50
    ),
    v_constraint_actor_id, clock_timestamp() + interval '15 minutes',
    'VOIDPRIORITY003'
  );

  UPDATE public.pos_online_payments
  SET status = 'EXPIRED'
  WHERE id = v_constraint_payment_id;

  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_other_payment_id, v_ctx.organization_id, v_ctx.branch_id,
    v_ctx.shift_id, 5.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-VOID-PRIORITY-TEST',
      'fiuu_enrollment_generation', 11,
      'branchId', v_ctx.branch_id,
      'shiftId', v_ctx.shift_id,
      'qr_amount', 5.50
    ),
    v_other_actor_id, clock_timestamp() + interval '15 minutes',
    'VOIDPRIORITY004'
  );

  INSERT INTO public.pos_fiuu_vt_attempts (
    id, payment_id, provider_order_id, op_type, callback_host, state,
    expires_at, expired_at, launch_lease_token,
    launch_lease_expires_at, launch_lease_generation
  ) VALUES
    (
      v_missing_source_id, v_constraint_payment_id, 'VOIDPRIORITY003',
      'STATUS', 'a-94000000000040008000000000000022.fiuu-vt.rkj.one',
      'EXPIRED', clock_timestamp(), clock_timestamp(), gen_random_uuid(),
      clock_timestamp(), 1
    ),
    (
      v_wrong_payment_source_id, v_constraint_payment_id, 'VOIDPRIORITY003',
      'STATUS', 'a-94000000000040008000000000000023.fiuu-vt.rkj.one',
      'EXPIRED', clock_timestamp(), clock_timestamp(), gen_random_uuid(),
      clock_timestamp(), 1
    ),
    (
      v_non_void_source_id, v_constraint_payment_id, 'VOIDPRIORITY003',
      'STATUS', 'a-94000000000040008000000000000024.fiuu-vt.rkj.one',
      'EXPIRED', clock_timestamp(), clock_timestamp(), gen_random_uuid(),
      clock_timestamp(), 1
    ),
    (
      v_non_void_target_id, v_constraint_payment_id, 'VOIDPRIORITY003',
      'SALE', 'a-94000000000040008000000000000025.fiuu-vt.rkj.one',
      'PREPARED', clock_timestamp() + interval '5 minutes', NULL,
      gen_random_uuid(), clock_timestamp() + interval '25 seconds', 1
    ),
    (
      v_wrong_payment_target_id, v_other_payment_id, 'VOIDPRIORITY004',
      'VOID', 'a-94000000000040008000000000000032.fiuu-vt.rkj.one',
      'PREPARED', clock_timestamp() + interval '5 minutes', NULL,
      gen_random_uuid(), clock_timestamp() + interval '25 seconds', 1
    );

  BEGIN
    UPDATE public.pos_fiuu_vt_attempts
    SET superseded_at = clock_timestamp(),
        superseded_by_attempt_id =
          '94000000-0000-4000-8000-000000000099'::UUID,
        supersession_reason = 'VOID_REQUESTED'
    WHERE id = v_missing_source_id;
    SET CONSTRAINTS pos_fiuu_vt_attempts_superseded_by_attempt_fkey,
      enforce_pos_fiuu_vt_attempt_supersession IMMEDIATE;
    RAISE EXCEPTION 'Missing supersession target unexpectedly passed';
  EXCEPTION
    WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM
        'pos_fiuu_vt_attempts_superseded_by_attempt_fkey' THEN
        RAISE EXCEPTION 'Unexpected missing-target constraint: %',
          v_constraint_name;
      END IF;
    WHEN OTHERS THEN RAISE;
  END;
  SET CONSTRAINTS pos_fiuu_vt_attempts_superseded_by_attempt_fkey,
    enforce_pos_fiuu_vt_attempt_supersession DEFERRED;

  BEGIN
    UPDATE public.pos_fiuu_vt_attempts
    SET superseded_at = clock_timestamp(),
        superseded_by_attempt_id = v_wrong_payment_target_id,
        supersession_reason = 'VOID_REQUESTED'
    WHERE id = v_wrong_payment_source_id;
    SET CONSTRAINTS enforce_pos_fiuu_vt_attempt_supersession IMMEDIATE;
    RAISE EXCEPTION 'Cross-payment supersession target unexpectedly passed';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM
        'pos_fiuu_vt_attempts_supersession_target_check' THEN
        RAISE EXCEPTION 'Unexpected cross-payment constraint: %',
          v_constraint_name;
      END IF;
    WHEN OTHERS THEN RAISE;
  END;
  SET CONSTRAINTS enforce_pos_fiuu_vt_attempt_supersession DEFERRED;

  BEGIN
    UPDATE public.pos_fiuu_vt_attempts
    SET superseded_at = clock_timestamp(),
        superseded_by_attempt_id = v_non_void_target_id,
        supersession_reason = 'VOID_REQUESTED'
    WHERE id = v_non_void_source_id;
    SET CONSTRAINTS enforce_pos_fiuu_vt_attempt_supersession IMMEDIATE;
    RAISE EXCEPTION 'Non-VOID supersession target unexpectedly passed';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM
        'pos_fiuu_vt_attempts_supersession_target_check' THEN
        RAISE EXCEPTION 'Unexpected non-VOID constraint: %',
          v_constraint_name;
      END IF;
    WHEN OTHERS THEN RAISE;
  END;
  SET CONSTRAINTS enforce_pos_fiuu_vt_attempt_supersession DEFERRED;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts
    WHERE id IN (
      v_missing_source_id,
      v_wrong_payment_source_id,
      v_non_void_source_id
    )
      AND superseded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Rejected supersession metadata was not rolled back';
  END IF;

  UPDATE public.pos_online_payments
  SET status = 'EXPIRED'
  WHERE id = v_other_payment_id;

  -- A delayed callback remains claimable against its original immutable
  -- STATUS identity while the separate VOID identity stays PREPARED.
  v_late_callback := public.claim_pos_fiuu_vt_callback_processing(
    v_payment_id,
    v_status_attempt_id,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_object(
      'opType', 'STATUS',
      'status', '00',
      'orderId', 'VOIDPRIORITY001',
      'transactionId', 'VOID-PRIORITY-LATE-STATUS-001',
      'amountRm', 2.50
    ),
    v_processing_token,
    true
  );

  IF v_late_callback->>'outcome' <> 'CLAIMED'
    OR (SELECT state FROM public.pos_fiuu_vt_attempts
        WHERE id = v_status_attempt_id) <> 'RECEIVED'
    OR (SELECT state FROM public.pos_fiuu_vt_attempts
        WHERE id = v_void_attempt_id) <> 'PREPARED'
    OR (SELECT count(*) FROM public.pos_fiuu_vt_attempts
        WHERE payment_id = v_payment_id) <> 2 THEN
    RAISE EXCEPTION 'Delayed STATUS callback isolation failed: %', v_late_callback;
  END IF;

  v_completion := public.complete_pos_fiuu_vt_callback_processing(
    v_payment_id,
    v_status_attempt_id,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    v_processing_token
  );
  v_replay := public.complete_pos_fiuu_vt_callback_processing(
    v_payment_id,
    v_status_attempt_id,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    v_processing_token
  );

  IF v_completion->>'outcome' <> 'COMPLETED'
    OR (v_completion->>'already_completed')::BOOLEAN
    OR v_replay->>'outcome' <> 'COMPLETED'
    OR (v_replay->>'already_completed')::BOOLEAN IS DISTINCT FROM true
    OR (SELECT state FROM public.pos_fiuu_vt_attempts
        WHERE id = v_status_attempt_id) <> 'CONSUMED' THEN
    RAISE EXCEPTION 'Delayed callback completion/replay failed: %, %',
      v_completion, v_replay;
  END IF;

  v_replay := public.claim_pos_fiuu_vt_callback_processing(
    v_payment_id,
    v_status_attempt_id,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_object(
      'opType', 'STATUS',
      'status', '00',
      'orderId', 'VOIDPRIORITY001',
      'transactionId', 'VOID-PRIORITY-LATE-STATUS-001',
      'amountRm', 2.50
    ),
    gen_random_uuid(),
    true
  );
  IF v_replay->>'outcome' <> 'CONSUMED' THEN
    RAISE EXCEPTION 'Consumed callback replay was not idempotent: %', v_replay;
  END IF;

  -- The ordinary reconciliation uniqueness rule remains strict. Only the
  -- explicitly superseded row may coexist with the replacement VOID.
  BEGIN
    INSERT INTO public.pos_fiuu_vt_attempts (
      id, payment_id, provider_order_id, op_type, callback_host, state,
      expires_at, launch_lease_token, launch_lease_expires_at,
      launch_lease_generation
    ) VALUES (
      '94000000-0000-4000-8000-000000000004'::UUID,
      v_payment_id,
      'VOIDPRIORITY001',
      'STATUS',
      'a-94000000000040008000000000000004.fiuu-vt.rkj.one',
      'PREPARED',
      clock_timestamp() + interval '5 minutes',
      gen_random_uuid(),
      clock_timestamp() + interval '25 seconds',
      1
    );
    RAISE EXCEPTION 'Non-superseded STATUS unexpectedly coexisted with VOID';
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN RAISE;
  END;

  -- A delegate failure must roll the STATUS mutation back atomically.
  UPDATE public.pos_online_payments
  SET status = 'EXPIRED'
  WHERE id = v_payment_id;

  INSERT INTO public.pos_online_payments (
    id, organization_id, branch_id, shift_id, amount_rm, status, provider,
    sale_payload, created_by, expires_at, provider_order_id
  ) VALUES (
    v_second_payment_id, v_ctx.organization_id, v_ctx.branch_id, v_ctx.shift_id,
    3.50, 'PENDING', 'fiuu_vt',
    jsonb_build_object(
      'fiuu_branch_code', v_ctx.branch_code,
      'fiuu_device_id', v_ctx.device_id,
      'fiuu_device_code', 'POS-BR001-VOID-PRIORITY-TEST',
      'fiuu_enrollment_generation', 11,
      'branchId', v_ctx.branch_id,
      'shiftId', v_ctx.shift_id,
      'qr_amount', 3.50
    ),
    v_ctx.actor_id,
    clock_timestamp() + interval '15 minutes',
    'VOIDPRIORITY002'
  );
  INSERT INTO public.pos_fiuu_vt_attempts (
    id, payment_id, provider_order_id, op_type, callback_host, state,
    expires_at, launched_at, launch_lease_token,
    launch_lease_expires_at, launch_lease_generation
  ) VALUES (
    v_second_status_id,
    v_second_payment_id,
    'VOIDPRIORITY002',
    'STATUS',
    'a-94000000000040008000000000000012.fiuu-vt.rkj.one',
    'LAUNCHED',
    clock_timestamp() + interval '5 minutes',
    clock_timestamp(),
    gen_random_uuid(),
    clock_timestamp() + interval '25 seconds',
    1
  );

  BEGIN
    PERFORM public.claim_pos_fiuu_vt_launch_lease(
      v_second_payment_id,
      'VOID',
      v_void_attempt_id,
      v_callback_host,
      gen_random_uuid(),
      v_ctx.actor_id
    );
    RAISE EXCEPTION 'Duplicate replacement attempt unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'pos_fiuu_vt_attempts_pkey' THEN
        RAISE EXCEPTION 'Unexpected duplicate constraint: %', v_constraint_name;
      END IF;
    WHEN OTHERS THEN RAISE;
  END;

  IF (SELECT state FROM public.pos_fiuu_vt_attempts
      WHERE id = v_second_status_id) <> 'LAUNCHED'
    OR (SELECT superseded_at FROM public.pos_fiuu_vt_attempts
        WHERE id = v_second_status_id) IS NOT NULL
    OR (SELECT superseded_by_attempt_id FROM public.pos_fiuu_vt_attempts
        WHERE id = v_second_status_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Failed delegate did not roll STATUS supersession back';
  END IF;
END;
$$;

SELECT 'fiuu_vt_void_priority_integration_ok' AS result;

ROLLBACK;
