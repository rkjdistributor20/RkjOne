-- Release a cashier/tablet lane only after an expired Fiuu VT payment has
-- consumed the same bounded STATUS budget enforced by
-- claim_pos_fiuu_vt_launch_lease(). The payment is never declared cancelled:
-- it becomes a Finance/HQ review item while its original provider order and
-- callback identities remain available for an exact late-success match.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.park_pos_fiuu_vt_status_retry_limit(
  p_payment_id UUID,
  p_actor_id UUID,
  p_device_id UUID,
  p_enrollment_generation INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_shift_id UUID;
  v_payment_branch_id UUID;
  v_shift public.pos_shifts%ROWTYPE;
  v_payment public.pos_online_payments%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_status_attempt_count INTEGER := 0;
  -- Keep this equal to v_status_retry_budget in
  -- 20261123170000_bound_fiuu_vt_status_attempts.sql.
  v_status_retry_budget CONSTANT INTEGER := 3;
  v_event JSONB;
  v_replayed BOOLEAN := false;
BEGIN
  IF p_payment_id IS NULL
    OR p_actor_id IS NULL
    OR p_device_id IS NULL
    OR p_enrollment_generation IS NULL
    OR p_enrollment_generation < 1 THEN
    RETURN jsonb_build_object('outcome', 'INVALID_REQUEST');
  END IF;

  -- Discover the immutable lock root, then use the established lock order:
  -- shift -> payment -> attempts. Callback claim/review functions use the
  -- same order, so success evidence and terminal release cannot pass each
  -- other between checks and writes.
  SELECT shift_id, branch_id INTO v_payment_shift_id, v_payment_branch_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;
  SELECT * INTO v_shift
  FROM public.pos_shifts
  WHERE id = v_payment_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND
    OR v_payment.shift_id IS DISTINCT FROM v_payment_shift_id
    OR v_payment.branch_id IS DISTINCT FROM v_payment_branch_id THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- Static ownership is checked even for a replay. This lets a committed
  -- response be retried after a shift/device status changes without allowing
  -- another branch, cashier, shift or enrollment to inherit the release.
  IF v_payment.created_by IS DISTINCT FROM p_actor_id
    OR v_payment.sale_payload->>'fiuu_device_id'
      IS DISTINCT FROM p_device_id::TEXT
    OR v_payment.sale_payload->>'fiuu_enrollment_generation'
      IS DISTINCT FROM p_enrollment_generation::TEXT THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_payment.fiuu_vt_review_evidence->'events') = 'array'
          THEN v_payment.fiuu_vt_review_evidence->'events'
        WHEN jsonb_typeof(v_payment.fiuu_vt_review_evidence) = 'object'
          THEN jsonb_build_array(v_payment.fiuu_vt_review_evidence)
        ELSE '[]'::JSONB
      END
    ) AS review_event
    WHERE review_event->>'eventType'
      = 'STATUS_RETRY_LIMIT_QUARANTINED'
  ) INTO v_replayed;

  IF v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required
    AND v_replayed THEN
    RETURN jsonb_build_object(
      'outcome', 'QUARANTINED',
      'payment_id', v_payment.id,
      'payment_status', v_payment.status,
      'review_state', v_payment.fiuu_vt_reconciliation_state,
      'cashier_lane_released', true,
      'reused', true
    );
  END IF;

  -- First execution requires the exact live tenant/branch/shift/cashier and
  -- the current verified official tablet enrollment that created the intent.
  IF v_shift.status <> 'OPEN'
    OR v_shift.organization_id IS DISTINCT FROM v_payment.organization_id
    OR v_shift.branch_id IS DISTINCT FROM v_payment.branch_id THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id
    AND organization_id = v_payment.organization_id
    AND status = 'ACTIVE'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;

  IF v_actor.role::TEXT NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
    AND NOT EXISTS (
      SELECT 1
      FROM public.pos_shift_staff_members AS member
      WHERE member.shift_id = v_payment.shift_id
        AND member.branch_id = v_payment.branch_id
        AND member.profile_id = p_actor_id
        AND member.status = 'ACTIVE'
    ) THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;

  PERFORM device.id
  FROM public.pos_devices AS device
  JOIN public.branches AS branch
    ON branch.id = device.branch_id
   AND branch.organization_id = device.organization_id
  JOIN public.organizations AS tenant
    ON tenant.id = device.organization_id
  WHERE device.id = p_device_id
    AND device.organization_id = v_payment.organization_id
    AND device.branch_id = v_payment.branch_id
    AND device.device_code = v_payment.sale_payload->>'fiuu_device_code'
    AND device.enrollment_generation = p_enrollment_generation
    AND device.status = 'ACTIVE'
    AND device.asset_verified_at IS NOT NULL
    AND device.asset_verified_by IS NOT NULL
    AND length(btrim(COALESCE(device.serial_number, ''))) BETWEEN 5 AND 64
    AND COALESCE(device.imei, '') ~ '^[0-9]{15}$'
    AND device.metadata->>'official_hardware_profile' IN (
      'SAMSUNG_TAB_S10_LITE_5G_128',
      'HONOR_PAD_X8B_LTE_256'
    )
    AND branch.status::TEXT = 'ACTIVE'
    AND tenant.status::TEXT = 'ACTIVE'
  FOR SHARE OF device, branch, tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'FORBIDDEN');
  END IF;

  -- This primitive is intentionally narrower than ordinary provider-error
  -- quarantine. It accepts only an unresolved PENDING intent whose actual QR
  -- deadline has passed and whose lane has not already been released.
  IF v_payment.status <> 'PENDING'
    OR v_payment.fiuu_vt_review_required
    OR v_payment.fiuu_vt_cashier_released_at IS NOT NULL
    OR v_payment.expires_at IS NULL
    OR v_payment.expires_at > v_now
    OR v_payment.provider_order_id IS NULL
    OR v_payment.transaction_id IS NOT NULL
    OR v_payment.paid_at IS NOT NULL
    OR v_payment.gateway_ref IS NOT NULL
    OR v_payment.provider_transaction_id IS NOT NULL
    OR v_payment.provider_sale_reported_at IS NOT NULL
    OR v_payment.provider_confirmed_at IS NOT NULL
    OR v_payment.provider_confirmed_by IS NOT NULL
    OR (
      v_payment.provider_result IS NOT NULL
      AND (
        jsonb_typeof(v_payment.provider_result) <> 'object'
        OR COALESCE(v_payment.provider_result->>'transactionId', '') <> ''
        OR (
          v_payment.provider_result->>'opType' IN ('SALE', 'STATUS')
          AND v_payment.provider_result->>'status' = '00'
        )
      )
    ) THEN
    RETURN jsonb_build_object(
      'outcome', 'NOT_ELIGIBLE',
      'reason', 'PAYMENT_STATE_OR_PROVIDER_EVIDENCE'
    );
  END IF;

  -- Retain every attempt row and callback host. Locking all rows closes the
  -- race with a late callback; no synthetic result/fingerprint is written, so
  -- a later exact provider result can still occupy its original evidence slot.
  PERFORM attempt.id
  FROM public.pos_fiuu_vt_attempts AS attempt
  WHERE attempt.payment_id = v_payment.id
  ORDER BY attempt.id
  FOR UPDATE;

  -- A PREPARED/LAUNCHED native operation still owns the tablet lane until its
  -- launch lease (or, for legacy rows, its attempt deadline) has elapsed.
  -- Fail closed for either launch or callback work before mutating any row.
  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND (
        attempt.state = 'RECEIVED'
        OR (
          attempt.state IN ('PREPARED', 'LAUNCHED')
          AND COALESCE(attempt.launch_lease_expires_at, attempt.expires_at) > v_now
        )
        OR (
          attempt.processing_lease_token IS NOT NULL
          AND attempt.processing_lease_expires_at > v_now
        )
      )
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'CALLBACK_ACTIVE',
      'reason', 'LAUNCH_OR_CALLBACK_PROCESSING_NOT_TERMINAL'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.op_type IN ('SALE', 'STATUS')
      AND attempt.result_json IS NOT NULL
      AND jsonb_typeof(attempt.result_json) = 'object'
      AND (
        COALESCE(attempt.result_json->>'transactionId', '') <> ''
        OR attempt.result_json->>'status' = '00'
      )
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'NOT_ELIGIBLE',
      'reason', 'ATTEMPT_PROVIDER_SUCCESS_EVIDENCE'
    );
  END IF;

  SELECT count(*)::INTEGER INTO v_status_attempt_count
  FROM public.pos_fiuu_vt_attempts AS attempt
  WHERE attempt.payment_id = v_payment.id
    AND attempt.op_type = 'STATUS';

  IF v_status_attempt_count < v_status_retry_budget THEN
    RETURN jsonb_build_object(
      'outcome', 'NOT_ELIGIBLE',
      'reason', 'STATUS_RETRY_BUDGET_NOT_EXHAUSTED',
      'status_attempt_count', v_status_attempt_count,
      'status_retry_budget', v_status_retry_budget
    );
  END IF;

  v_event := jsonb_build_object(
    'eventType', 'STATUS_RETRY_LIMIT_QUARANTINED',
    'paymentId', v_payment.id,
    'providerOrderId', v_payment.provider_order_id,
    'branchId', v_payment.branch_id,
    'shiftId', v_payment.shift_id,
    'actorId', p_actor_id,
    'deviceId', p_device_id,
    'enrollmentGeneration', p_enrollment_generation,
    'expiredAt', v_payment.expires_at,
    'statusAttemptCount', v_status_attempt_count,
    'statusRetryBudget', v_status_retry_budget,
    'quarantinedAt', v_now,
    'providerCancellationConfirmed', false,
    'lateCallbackAttributionPreserved', true,
    'relatedActiveCheckoutChanged', false,
    'resolutionAuthority', 'FINANCE_HQ'
  );

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      quarantined_at = COALESCE(quarantined_at, v_now),
      launch_lease_token = NULL,
      launch_lease_expires_at = NULL,
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND (
      state IN ('EXPIRED', 'ABANDONED')
      OR (
        state IN ('PREPARED', 'LAUNCHED')
        AND COALESCE(launch_lease_expires_at, expires_at) <= v_now
      )
    );

  UPDATE public.pos_online_payments
  SET status = 'QUARANTINED',
      failed_at = NULL,
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW',
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        fiuu_vt_review_evidence,
        v_event
      ),
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = 'STATUS_RETRY_LIMIT_EXHAUSTED',
      updated_at = v_now
  WHERE id = v_payment.id
    AND provider = 'fiuu_vt'
    AND status = 'PENDING'
    AND fiuu_vt_review_required = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'STATUS_CHANGED');
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    v_payment.organization_id,
    p_actor_id,
    'FIUU_VT_STATUS_RETRY_LIMIT_QUARANTINED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object(
      'status', v_payment.status,
      'reviewRequired', v_payment.fiuu_vt_review_required,
      'statusAttemptCount', v_status_attempt_count
    ),
    jsonb_build_object(
      'status', 'QUARANTINED',
      'reviewRequired', true,
      'reviewState', 'PROVIDER_ERROR_REVIEW',
      'providerCancellationConfirmed', false,
      'lateCallbackAttributionPreserved', true,
      'cashierLaneReleased', true
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'QUARANTINED',
    'payment_id', v_payment.id,
    'payment_status', 'QUARANTINED',
    'review_state', 'PROVIDER_ERROR_REVIEW',
    'status_attempt_count', v_status_attempt_count,
    'status_retry_budget', v_status_retry_budget,
    'cashier_lane_released', true,
    'provider_cancellation_confirmed', false,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_status_retry_limit(
  UUID, UUID, UUID, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.park_pos_fiuu_vt_status_retry_limit(
  UUID, UUID, UUID, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.park_pos_fiuu_vt_status_retry_limit(
  UUID, UUID, UUID, INTEGER
) IS
  'Quarantines an expired PENDING Fiuu VT payment after its bounded STATUS retry budget is exhausted, releasing only that cashier lane while preserving exact late-callback attribution and Finance/HQ review.';

-- The generic review path intentionally locks a related active checkout when
-- an old unresolved payment has not released its lane. This new primitive is
-- the opposite: its QUARANTINED row is the durable release decision. Route a
-- later callback review to the original payment only, without changing the
-- next customer's payment on the same cashier/tablet lane.
CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review_status_aware(
  p_payment_id UUID,
  p_state TEXT,
  p_evidence JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event JSONB;
  v_status_retry_limit_release BOOLEAN := false;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

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
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RAISE EXCEPTION 'Fiuu VT payment changed during status-aware review';
  END IF;

  IF v_payment.fiuu_vt_cashier_released_at IS NOT NULL THEN
    RETURN public.mark_pos_fiuu_vt_released_review(
      p_payment_id,
      p_state,
      p_evidence
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.audit_logs AS audit
    WHERE audit.entity_type = 'pos_online_payments'
      AND audit.entity_id = v_payment.id
      AND audit.action = 'FIUU_VT_STATUS_RETRY_LIMIT_QUARANTINED'
  ) INTO v_status_retry_limit_release;

  IF v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required
    AND (
      v_payment.fiuu_vt_recovery_last_error = 'STATUS_RETRY_LIMIT_EXHAUSTED'
      OR v_status_retry_limit_release
    ) THEN
    IF p_state NOT IN (
      'LATE_SUCCESS_REVIEW',
      'REVERSAL_REVIEW',
      'FOREIGN_CALLBACK_REVIEW',
      'PROVIDER_ERROR_REVIEW'
    ) THEN
      RAISE EXCEPTION 'Invalid status-retry-limit Fiuu VT review state';
    END IF;
    IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
      RAISE EXCEPTION 'Status-retry-limit Fiuu VT review evidence must be an object';
    END IF;

    v_event := p_evidence || jsonb_build_object(
      'eventType', p_state,
      'sourcePaymentId', v_payment.id,
      'releaseReason', 'STATUS_RETRY_LIMIT_EXHAUSTED',
      'relatedActiveCheckoutChanged', false,
      'recordedAt', v_now
    );

    UPDATE public.pos_online_payments
    SET fiuu_vt_review_required = true,
        fiuu_vt_reconciliation_state = p_state,
        fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
          fiuu_vt_review_evidence,
          v_event
        ),
        fiuu_vt_recovery_next_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id
      AND status = 'QUARANTINED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Status-retry-limit Fiuu VT payment changed during review';
    END IF;

    INSERT INTO public.audit_logs (
      organization_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values
    ) VALUES (
      v_payment.organization_id,
      v_payment.created_by,
      'FIUU_VT_STATUS_RETRY_LIMIT_CALLBACK_REVIEWED',
      'pos_online_payments',
      v_payment.id,
      jsonb_build_object(
        'status', v_payment.status,
        'reviewState', v_payment.fiuu_vt_reconciliation_state
      ),
      jsonb_build_object(
        'status', 'QUARANTINED',
        'reviewState', p_state,
        'relatedActiveCheckoutChanged', false
      )
    );

    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'payment_status', 'QUARANTINED',
      'related_payments', 0
    );
  END IF;

  RETURN public.mark_pos_fiuu_vt_review(
    p_payment_id,
    p_state,
    p_evidence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware(
  UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware(
  UUID, TEXT, JSONB
) TO service_role;

-- Rollback (only removes the callable primitive; it must never rewrite rows
-- already quarantined because those rows are retained provider evidence):
-- REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_status_retry_limit(
--   UUID, UUID, UUID, INTEGER
-- ) FROM service_role;
-- DROP FUNCTION IF EXISTS public.park_pos_fiuu_vt_status_retry_limit(
--   UUID, UUID, UUID, INTEGER
-- );
-- Restore mark_pos_fiuu_vt_review_status_aware(UUID, TEXT, JSONB) from
-- 20261123150000_release_fiuu_vt_cashier_after_void_launch.sql only after no
-- STATUS_RETRY_LIMIT_QUARANTINED payment can receive a late callback. Rows
-- already quarantined by this migration must never be auto-reverted.
