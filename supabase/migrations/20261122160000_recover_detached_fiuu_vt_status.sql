-- Let the currently active branch shift reconcile a prior shift's Fiuu VT
-- STATUS on the exact same enrolled tablet. STATUS is read-only at Fiuu; SALE
-- and VOID remain bound to the original cashier/shift. A callback whose server
-- processing lease died is quarantined with its durable evidence instead of
-- blocking the terminal forever or being discarded as if no payment occurred.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_review_status_lease(
  p_payment_id UUID,
  p_attempt_id UUID,
  p_callback_host TEXT,
  p_lease_token UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.pos_online_payments%ROWTYPE;
  v_active public.pos_fiuu_vt_attempts%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_duration CONSTANT INTERVAL := interval '25 seconds';
  v_retry_after_ms INTEGER := 0;
  v_release_attempts INTEGER := 0;
  v_oldest_release_attempt_at TIMESTAMPTZ;
  v_attempt_json JSONB;
  v_stale_evidence JSONB;
  v_detached_pending BOOLEAN := false;
  v_review_release BOOLEAN := false;
BEGIN
  IF p_actor_id IS NULL OR p_attempt_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT detached STATUS identity is required';
  END IF;
  IF p_callback_host IS DISTINCT FROM (
    'a-' || replace(lower(p_attempt_id::TEXT), '-', '') || '.fiuu-vt.rkj.one'
  ) THEN
    RAISE EXCEPTION 'Invalid Fiuu VT callback host';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_vt' THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  v_detached_pending := v_payment.status = 'PENDING'
    AND NOT v_payment.fiuu_vt_review_required;
  v_review_release := v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required;
  IF NOT v_detached_pending AND NOT v_review_release THEN
    RETURN jsonb_build_object(
      'outcome',
      CASE WHEN v_payment.fiuu_vt_review_required
        THEN 'REVIEW_REQUIRED'
        ELSE 'TERMINAL'
      END
    );
  END IF;

  IF v_detached_pending AND NOT EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts sale_attempt
    WHERE sale_attempt.payment_id = v_payment.id
      AND sale_attempt.op_type = 'SALE'
      AND sale_attempt.state <> 'ABANDONED'
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'FORBIDDEN',
      'reason', 'DETACHED_STATUS_WITHOUT_SALE_EVIDENCE'
    );
  END IF;

  -- An expired STATUS identity is renewed in place below so a late callback
  -- and the retry keep the same one-time host. VOID cannot be reused as STATUS,
  -- so only an expired VOID launch is retired here. RECEIVED evidence is
  -- handled separately and is never silently expired.
  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'EXPIRED',
      expired_at = COALESCE(expired_at, v_now),
      expires_at = LEAST(expires_at, v_now),
      launch_lease_expires_at = LEAST(
        COALESCE(launch_lease_expires_at, v_now),
        v_now
      ),
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND op_type = 'VOID'
    AND state IN ('PREPARED', 'LAUNCHED')
    AND launch_lease_expires_at <= v_now;

  SELECT * INTO v_active
  FROM public.pos_fiuu_vt_attempts
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
    AND (
      state = 'RECEIVED'
      OR launch_lease_expires_at > v_now
    )
  ORDER BY
    CASE state
      WHEN 'RECEIVED' THEN 0
      WHEN 'LAUNCHED' THEN 1
      ELSE 2
    END,
    CASE op_type WHEN 'VOID' THEN 0 ELSE 1 END,
    created_at DESC,
    id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- An exact callback replay normally resumes through the processing lease.
    -- If both the request and native replay disappeared, preserve the stored
    -- result as review evidence and release only through a fresh STATUS check.
    IF v_active.state = 'RECEIVED'
       AND COALESCE(
         v_active.processing_lease_expires_at,
         v_active.received_at + interval '30 seconds',
         v_active.updated_at + interval '30 seconds'
       ) <= v_now THEN
      v_stale_evidence := jsonb_build_object(
        'eventType', 'STALE_RECEIVED_CALLBACK_QUARANTINED',
        'attemptId', v_active.id,
        'opType', v_active.op_type,
        'receivedAt', v_active.received_at,
        'processingLeaseExpiredAt', v_active.processing_lease_expires_at,
        'resultFingerprint', v_active.result_fingerprint,
        'result', v_active.result_json,
        'actorId', p_actor_id,
        'recordedAt', v_now
      );

      UPDATE public.pos_fiuu_vt_attempts
      SET state = 'QUARANTINED',
          quarantined_at = COALESCE(quarantined_at, v_now),
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          updated_at = v_now
      WHERE id = v_active.id
        AND state = 'RECEIVED'
        AND processing_lease_expires_at IS NOT DISTINCT FROM v_active.processing_lease_expires_at;

      UPDATE public.pos_online_payments
      SET status = CASE WHEN v_detached_pending THEN 'QUARANTINED' ELSE status END,
          failed_at = CASE WHEN v_detached_pending THEN NULL ELSE failed_at END,
          fiuu_vt_review_required = true,
          fiuu_vt_reconciliation_state = CASE
            WHEN v_detached_pending THEN 'FOREIGN_CALLBACK_REVIEW'
            ELSE fiuu_vt_reconciliation_state
          END,
          fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
            fiuu_vt_review_evidence,
            v_stale_evidence
          ),
          fiuu_vt_recovery_next_at = NULL,
          fiuu_vt_recovery_last_error = NULL,
          updated_at = v_now
      WHERE id = v_payment.id;

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
        'FIUU_VT_STALE_CALLBACK_QUARANTINED',
        'pos_online_payments',
        v_payment.id,
        jsonb_build_object('status', v_payment.status),
        jsonb_build_object(
          'status', CASE WHEN v_detached_pending THEN 'QUARANTINED' ELSE v_payment.status END,
          'reviewState', CASE
            WHEN v_detached_pending THEN 'FOREIGN_CALLBACK_REVIEW'
            ELSE v_payment.fiuu_vt_reconciliation_state
          END,
          'attemptId', v_active.id,
          'evidencePreserved', true
        )
      );

      IF v_detached_pending THEN
        RETURN jsonb_build_object(
          'outcome', 'REVIEW_REQUIRED',
          'reason', 'STALE_CALLBACK_QUARANTINED'
        );
      END IF;

      -- Re-arbitrate on the next request after the stale row is durably
      -- quarantined. This prevents a concurrent active SALE/VOID from being
      -- hidden by the formerly higher-priority RECEIVED row and avoids rolling
      -- the quarantine back on an active-lane uniqueness error.
      RETURN jsonb_build_object(
        'outcome', 'ACTIVE',
        'active_operation', jsonb_build_object(
          'id', v_active.id,
          'callback_host', v_active.callback_host,
          'expires_at', v_active.expires_at,
          'op_type', v_active.op_type,
          'state', 'QUARANTINED',
          'lease_generation', v_active.launch_lease_generation,
          'lease_expires_at', NULL
        ),
        'retry_after_ms', 250,
        'reason', 'STALE_CALLBACK_REARBITRATION'
      );
    ELSE
      v_attempt_json := jsonb_build_object(
        'id', v_active.id,
        'callback_host', v_active.callback_host,
        'expires_at', v_active.expires_at,
        'op_type', v_active.op_type,
        'state', v_active.state,
        'lease_generation', v_active.launch_lease_generation,
        'lease_expires_at', v_active.launch_lease_expires_at
      );
      IF v_active.state = 'RECEIVED' THEN
        v_retry_after_ms := GREATEST(
          1000,
          LEAST(
            30000,
            COALESCE(
              ceil(extract(epoch FROM (v_active.processing_lease_expires_at - v_now)) * 1000)::INTEGER,
              1000
            )
          )
        );
      ELSIF v_active.launch_lease_expires_at > v_now THEN
        v_retry_after_ms := GREATEST(
          0,
          LEAST(
            30000,
            ceil(extract(epoch FROM (v_active.launch_lease_expires_at - v_now)) * 1000)::INTEGER
          )
        );
      END IF;
      RETURN jsonb_build_object(
        'outcome', 'ACTIVE',
        'active_operation', v_attempt_json,
        'retry_after_ms', v_retry_after_ms,
        'reason', CASE
          WHEN v_active.op_type <> 'STATUS' THEN 'OPERATION_CONFLICT'
          WHEN v_active.state = 'RECEIVED' THEN 'CALLBACK_RECEIVED'
          ELSE 'LAUNCH_LEASE_ACTIVE'
        END
      );
    END IF;
  END IF;

  SELECT count(*)::INTEGER, min(created_at)
  INTO v_release_attempts, v_oldest_release_attempt_at
  FROM public.pos_fiuu_vt_attempts
  WHERE payment_id = v_payment.id
    AND reconciliation_purpose = 'NATIVE_RELEASE'
    AND state <> 'ABANDONED'
    AND created_at > v_now - interval '60 seconds';

  IF v_release_attempts >= 3 THEN
    v_retry_after_ms := GREATEST(
      1000,
      LEAST(
        30000,
        ceil(extract(epoch FROM (
          v_oldest_release_attempt_at + interval '60 seconds' - v_now
        )) * 1000)::INTEGER
      )
    );
    RETURN jsonb_build_object(
      'outcome', 'RETRY_LIMIT',
      'reason', 'NATIVE_RELEASE_RATE_LIMIT',
      'retry_after_ms', v_retry_after_ms
    );
  END IF;

  -- Reuse an unresolved STATUS callback identity instead of rotating it away.
  -- Fiuu may deliver the first launch late; keeping the exact attempt/host
  -- means either launch resolves through the same idempotent callback row and
  -- cannot collide with a replacement in the one-active-reconciliation index.
  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE payment_id = v_payment.id
    AND op_type = 'STATUS'
    AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED')
    AND result_fingerprint IS NULL
    AND result_json IS NULL
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'PREPARED',
        expires_at = v_now + interval '5 minutes',
        launched_at = NULL,
        expired_at = NULL,
        abandoned_at = NULL,
        launch_error_code = NULL,
        launch_lease_token = p_lease_token,
        launch_lease_expires_at = v_now + v_lease_duration,
        launch_lease_generation = GREATEST(launch_lease_generation, 0) + 1,
        processing_lease_token = NULL,
        processing_lease_expires_at = NULL,
        reconciliation_purpose = 'NATIVE_RELEASE',
        updated_at = v_now
    WHERE id = v_attempt.id
      AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED')
      AND result_fingerprint IS NULL
      AND result_json IS NULL
    RETURNING * INTO v_attempt;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fiuu VT STATUS retry lease changed concurrently';
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'LAUNCH',
      'attempt', jsonb_build_object(
        'id', v_attempt.id,
        'callback_host', v_attempt.callback_host,
        'expires_at', v_attempt.expires_at,
        'op_type', v_attempt.op_type,
        'state', v_attempt.state,
        'lease_generation', v_attempt.launch_lease_generation,
        'lease_expires_at', v_attempt.launch_lease_expires_at
      ),
      'reused', true,
      'reason', 'STATUS_CALLBACK_IDENTITY_RENEWED'
    );
  END IF;

  INSERT INTO public.pos_fiuu_vt_attempts (
    id,
    payment_id,
    provider_order_id,
    op_type,
    callback_host,
    state,
    expires_at,
    launch_lease_token,
    launch_lease_expires_at,
    launch_lease_generation,
    reconciliation_purpose,
    updated_at
  ) VALUES (
    p_attempt_id,
    v_payment.id,
    v_payment.provider_order_id,
    'STATUS',
    p_callback_host,
    'PREPARED',
    v_now + interval '5 minutes',
    p_lease_token,
    v_now + v_lease_duration,
    1,
    'NATIVE_RELEASE',
    v_now
  )
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'outcome', 'LAUNCH',
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'callback_host', v_attempt.callback_host,
      'expires_at', v_attempt.expires_at,
      'op_type', v_attempt.op_type,
      'state', v_attempt.state,
      'lease_generation', v_attempt.launch_lease_generation,
      'lease_expires_at', v_attempt.launch_lease_expires_at
    ),
    'reused', false,
    'reason', CASE WHEN v_detached_pending
      THEN 'DETACHED_STATUS_RECONCILIATION'
      ELSE 'QUARANTINED_STATUS_RECONCILIATION'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_review_status_lease(
  UUID, UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_review_status_lease(
  UUID, UUID, TEXT, UUID, UUID
) TO service_role;

-- Recover an exact durable STATUS=00 result in one database transaction.  A
-- customer GET must never fabricate REPORTED in memory while the database is
-- still PENDING: doing so leaves fulfilment unable to cross its row-locked
-- REPORTED boundary.  This function either promotes and fulfils atomically,
-- or quarantines a success that belongs to a shift which has already closed.
CREATE OR REPLACE FUNCTION public.recover_pos_fiuu_vt_reported_payment(
  p_payment_id UUID,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_status public.pos_shift_status;
  v_payment public.pos_online_payments%ROWTYPE;
  v_fulfilment JSONB;
  v_review_event JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_payment_id IS NULL OR p_confirmed_by IS NULL THEN
    RETURN jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- Keep the same lock order as fulfilment and review: shift, then payment.
  SELECT status INTO v_shift_status
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;

  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'ALREADY_PAID',
      'transaction_id', v_payment.transaction_id
    );
  END IF;

  IF v_payment.status NOT IN ('PENDING', 'REPORTED') THEN
    RETURN jsonb_build_object('outcome', 'NOT_RECOVERABLE');
  END IF;

  IF v_payment.fiuu_vt_review_required THEN
    RETURN jsonb_build_object('outcome', 'REVIEW_REQUIRED');
  END IF;

  -- Validate both SALE identity and the exact stored STATUS success before
  -- changing state.  No provider call or client-supplied result is trusted.
  IF v_payment.created_by IS NULL
    OR p_confirmed_by IS DISTINCT FROM v_payment.created_by
    OR v_payment.provider_sale_reported_at IS NULL
    OR v_payment.provider_status_checked_at IS NULL
    OR COALESCE(v_payment.provider_order_id, '') !~ '^RKJ_[A-F0-9]{32}$'
    OR COALESCE(v_payment.provider_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
    OR v_payment.provider_result IS NULL
    OR jsonb_typeof(v_payment.provider_result) <> 'object'
    OR v_payment.provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR v_payment.provider_result->>'status' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'orderId' IS DISTINCT FROM v_payment.provider_order_id
    OR v_payment.provider_result->>'transactionId' IS DISTINCT FROM v_payment.provider_transaction_id
    OR v_payment.provider_result->>'currency' IS DISTINCT FROM 'MYR'
    OR v_payment.provider_result->>'channel' IS DISTINCT FROM 'RPP_DuitNowQR-Offline'
    OR CASE
      -- CASE deliberately guards the cast. PostgreSQL may reorder boolean OR
      -- expressions, so a separate regex term is not sufficient protection
      -- against malformed durable provider evidence.
      WHEN COALESCE(v_payment.provider_result->>'amountRm', '')
        ~ '^[0-9]+(\.[0-9]{1,2})?$'
      THEN round((v_payment.provider_result->>'amountRm')::NUMERIC, 2)
        <> round(v_payment.amount_rm, 2)
      ELSE true
    END THEN
    RETURN jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  END IF;

  IF v_shift_status <> 'OPEN' THEN
    v_review_event := jsonb_build_object(
      'eventType', 'SUCCESS_ON_CLOSED_SHIFT_QUARANTINED',
      'reason', 'ORIGINAL_SHIFT_CLOSED',
      'paymentId', v_payment.id,
      'shiftId', v_payment.shift_id,
      'providerOrderId', v_payment.provider_order_id,
      'providerTransactionId', v_payment.provider_transaction_id,
      'providerResult', v_payment.provider_result,
      'recordedAt', v_now
    );

    UPDATE public.pos_online_payments
    SET status = 'QUARANTINED',
        failed_at = NULL,
        fiuu_vt_review_required = true,
        fiuu_vt_reconciliation_state = 'LATE_SUCCESS_REVIEW',
        fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
          fiuu_vt_review_evidence,
          v_review_event
        ),
        fiuu_vt_recovery_next_at = NULL,
        fiuu_vt_recovery_last_error = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;

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
      p_confirmed_by,
      'FIUU_VT_CLOSED_SHIFT_SUCCESS_QUARANTINED',
      'pos_online_payments',
      v_payment.id,
      jsonb_build_object('status', v_payment.status),
      jsonb_build_object(
        'status', 'QUARANTINED',
        'reviewState', 'LATE_SUCCESS_REVIEW',
        'evidencePreserved', true
      )
    );

    RETURN jsonb_build_object('outcome', 'QUARANTINED');
  END IF;

  IF v_payment.status = 'PENDING' THEN
    UPDATE public.pos_online_payments
    SET status = 'REPORTED',
        updated_at = v_now
    WHERE id = v_payment.id
      AND status = 'PENDING';
  END IF;

  -- This call is part of the same transaction. Any validation/stock failure
  -- rolls the PENDING -> REPORTED promotion back instead of stranding the row.
  v_fulfilment := public.fulfill_pos_fiuu_vt_payment(
    v_payment.id,
    v_payment.provider_order_id,
    v_payment.provider_transaction_id,
    v_payment.amount_rm,
    'MYR',
    'RPP_DuitNowQR-Offline',
    v_payment.provider_result,
    p_confirmed_by
  );

  RETURN jsonb_build_object(
    'outcome', 'FULFILLED',
    'result', v_fulfilment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_pos_fiuu_vt_reported_payment(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_pos_fiuu_vt_reported_payment(UUID, UUID)
  TO service_role;

-- A malformed native callback registry cannot safely launch another STATUS,
-- but leaving the PENDING intent in place forever also blocks every following
-- customer. After the original QR has expired, this reviewed escape hatch
-- quarantines only an exact no-success-evidence payment from its verified
-- official tablet. It never declares the customer uncharged; Finance/HQ keeps
-- the durable evidence and remains the only authority that can resolve it.
CREATE OR REPLACE FUNCTION public.park_pos_fiuu_vt_native_storage_recovery(
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
  v_shift_id UUID;
  v_shift public.pos_shifts%ROWTYPE;
  v_payment public.pos_online_payments%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_device public.pos_devices%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_expired_at TIMESTAMPTZ;
  v_event JSONB;
BEGIN
  IF p_actor_id IS NULL OR p_device_id IS NULL OR p_enrollment_generation IS NULL THEN
    RAISE EXCEPTION 'Fiuu VT native recovery identity is required';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  -- Match every other Fiuu fulfilment/review path: shift first, payment second.
  SELECT * INTO v_shift
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
    RAISE EXCEPTION 'Fiuu VT payment changed during native storage recovery';
  END IF;

  IF v_shift.status <> 'OPEN'
    OR v_shift.organization_id IS DISTINCT FROM v_payment.organization_id
    OR v_shift.branch_id IS DISTINCT FROM v_payment.branch_id THEN
    RAISE EXCEPTION 'Fiuu VT payment requires its matching open shift';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id
    AND organization_id = v_payment.organization_id
    AND status = 'ACTIVE'
  FOR SHARE;
  IF NOT FOUND OR v_payment.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Fiuu VT payment is not owned by this active cashier';
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
    RAISE EXCEPTION 'Cashier is no longer active in this POS shift';
  END IF;

  SELECT device.* INTO v_device
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
  IF NOT FOUND
    OR v_payment.sale_payload->>'fiuu_device_id' IS DISTINCT FROM p_device_id::TEXT
    OR v_payment.sale_payload->>'fiuu_enrollment_generation'
      IS DISTINCT FROM p_enrollment_generation::TEXT THEN
    RAISE EXCEPTION 'Fiuu VT payment requires this branch current verified official tablet';
  END IF;

  IF v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW' THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'review_state', v_payment.fiuu_vt_reconciliation_state,
      'reused', true
    );
  END IF;

  v_expired_at := COALESCE(
    v_payment.expires_at,
    v_payment.created_at + INTERVAL '15 minutes'
  );
  IF v_payment.status <> 'PENDING'
    OR v_payment.fiuu_vt_review_required
    OR v_payment.transaction_id IS NOT NULL
    OR v_payment.paid_at IS NOT NULL
    OR v_payment.provider_transaction_id IS NOT NULL
    OR v_payment.provider_confirmed_at IS NOT NULL
    OR v_payment.provider_sale_reported_at IS NOT NULL
    OR v_expired_at + INTERVAL '15 seconds' > v_now
    OR (
      v_payment.provider_result IS NOT NULL
      AND jsonb_typeof(v_payment.provider_result) = 'object'
      AND v_payment.provider_result->>'kind' IS DISTINCT FROM 'ERROR'
      AND v_payment.provider_result->>'status' = '00'
      AND v_payment.provider_result->>'opType' IN ('SALE', 'STATUS')
    ) THEN
    RAISE EXCEPTION 'Fiuu VT payment is not eligible for native storage recovery';
  END IF;

  -- Lock callback rows only after the shift/payment locks. A fresh callback or
  -- launch lease always wins; the cashier must retry instead of racing it.
  PERFORM attempt.id
  FROM public.pos_fiuu_vt_attempts AS attempt
  WHERE attempt.payment_id = v_payment.id
  ORDER BY attempt.id
  FOR UPDATE;

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
      )
  ) THEN
    RAISE EXCEPTION 'A Fiuu VT callback or launch lease is still active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.result_json IS NOT NULL
      AND jsonb_typeof(attempt.result_json) = 'object'
      AND attempt.result_json->>'kind' IS DISTINCT FROM 'ERROR'
      AND attempt.result_json->>'status' = '00'
      AND attempt.op_type IN ('SALE', 'STATUS')
  ) THEN
    RAISE EXCEPTION 'Fiuu VT success evidence exists and cannot be quarantined';
  END IF;

  v_event := jsonb_build_object(
    'eventType', 'NATIVE_CALLBACK_REGISTRY_RECOVERY_QUARANTINED',
    'actorId', p_actor_id,
    'deviceId', p_device_id,
    'enrollmentGeneration', p_enrollment_generation,
    'quarantinedAt', v_now,
    'expiredAt', v_expired_at,
    'providerResult', v_payment.provider_result,
    'providerStatusCheckedAt', v_payment.provider_status_checked_at,
    'resolutionAuthority', 'FINANCE_HQ'
  );

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      result_json = COALESCE(result_json, v_event),
      quarantined_at = COALESCE(quarantined_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED');

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
      fiuu_vt_recovery_last_error = NULL,
      updated_at = v_now
  WHERE id = v_payment.id;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_payment.organization_id,
    p_actor_id,
    'FIUU_VT_NATIVE_STORAGE_QUARANTINED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object(
      'status', 'QUARANTINED',
      'reviewState', 'PROVIDER_ERROR_REVIEW',
      'evidencePreserved', true,
      'resolutionAuthority', 'FINANCE_HQ'
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'QUARANTINED',
    'review_state', 'PROVIDER_ERROR_REVIEW',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_native_storage_recovery(
  UUID, UUID, UUID, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.park_pos_fiuu_vt_native_storage_recovery(
  UUID, UUID, UUID, INTEGER
) TO service_role;

-- Stop a durable STATUS=00 row from retrying fulfilment forever. After several
-- serialized recovery attempts, keep the success evidence under Finance/HQ
-- review and release the cashier lane; never downgrade it to not-charged.
CREATE OR REPLACE FUNCTION public.quarantine_pos_fiuu_vt_recovery_failure(
  p_payment_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift public.pos_shifts%ROWTYPE;
  v_payment public.pos_online_payments%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event JSONB;
BEGIN
  IF p_expected_updated_at IS NULL
    OR p_reason NOT IN ('retryable', 'invalid_evidence') THEN
    RAISE EXCEPTION 'Invalid Fiuu VT recovery escalation request';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT payment not found';
  END IF;

  SELECT * INTO v_shift
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
    RAISE EXCEPTION 'Fiuu VT recovery payment changed';
  END IF;

  IF v_payment.status = 'QUARANTINED'
    AND v_payment.fiuu_vt_review_required
    AND v_payment.fiuu_vt_reconciliation_state = 'LATE_SUCCESS_REVIEW' THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'review_state', v_payment.fiuu_vt_reconciliation_state,
      'reused', true
    );
  END IF;

  IF v_payment.updated_at IS DISTINCT FROM p_expected_updated_at
    OR v_payment.status NOT IN ('PENDING', 'REPORTED')
    OR v_payment.fiuu_vt_review_required
    OR COALESCE(v_payment.fiuu_vt_recovery_attempts, 0) < 4
    OR v_payment.created_by IS NULL
    OR v_payment.provider_sale_reported_at IS NULL
    OR v_payment.provider_status_checked_at IS NULL
    OR COALESCE(v_payment.provider_order_id, '') !~ '^RKJ_[A-F0-9]{32}$'
    OR COALESCE(v_payment.provider_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
    OR v_payment.provider_result IS NULL
    OR jsonb_typeof(v_payment.provider_result) <> 'object'
    OR v_payment.provider_result->>'opType' IS DISTINCT FROM 'STATUS'
    OR v_payment.provider_result->>'status' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'orderId' IS DISTINCT FROM v_payment.provider_order_id
    OR v_payment.provider_result->>'transactionId'
      IS DISTINCT FROM v_payment.provider_transaction_id THEN
    RAISE EXCEPTION 'Fiuu VT recovery escalation evidence changed or is incomplete';
  END IF;

  PERFORM attempt.id
  FROM public.pos_fiuu_vt_attempts AS attempt
  WHERE attempt.payment_id = v_payment.id
  ORDER BY attempt.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.pos_fiuu_vt_attempts AS attempt
    WHERE attempt.payment_id = v_payment.id
      AND attempt.state = 'RECEIVED'
  ) THEN
    RAISE EXCEPTION 'A Fiuu VT callback is still being processed';
  END IF;

  v_event := jsonb_build_object(
    'eventType', 'DURABLE_SUCCESS_FULFILMENT_QUARANTINED',
    'quarantinedAt', v_now,
    'reason', p_reason,
    'recoveryAttempts', v_payment.fiuu_vt_recovery_attempts,
    'providerOrderId', v_payment.provider_order_id,
    'providerTransactionId', v_payment.provider_transaction_id,
    'providerResult', v_payment.provider_result,
    'resolutionAuthority', 'FINANCE_HQ'
  );

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'QUARANTINED',
      quarantined_at = COALESCE(quarantined_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED');

  UPDATE public.pos_online_payments
  SET status = 'QUARANTINED',
      failed_at = NULL,
      fiuu_vt_review_required = true,
      fiuu_vt_reconciliation_state = 'LATE_SUCCESS_REVIEW',
      fiuu_vt_review_evidence = public.append_pos_fiuu_vt_review_event(
        fiuu_vt_review_evidence,
        v_event
      ),
      fiuu_vt_recovery_attempted_at = v_now,
      fiuu_vt_recovery_next_at = NULL,
      fiuu_vt_recovery_last_error = 'DURABLE_SUCCESS_REQUIRES_REVIEW',
      updated_at = v_now
  WHERE id = v_payment.id
    AND updated_at = p_expected_updated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu VT recovery evidence changed concurrently';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_payment.organization_id,
    v_payment.created_by,
    'FIUU_VT_RECOVERY_FAILURE_QUARANTINED',
    'pos_online_payments',
    v_payment.id,
    jsonb_build_object(
      'status', v_payment.status,
      'recoveryAttempts', v_payment.fiuu_vt_recovery_attempts
    ),
    jsonb_build_object(
      'status', 'QUARANTINED',
      'reviewState', 'LATE_SUCCESS_REVIEW',
      'reason', p_reason,
      'evidencePreserved', true
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'QUARANTINED',
    'review_state', 'LATE_SUCCESS_REVIEW',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_pos_fiuu_vt_recovery_failure(
  UUID, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_pos_fiuu_vt_recovery_failure(
  UUID, TIMESTAMPTZ, TEXT
) TO service_role;
