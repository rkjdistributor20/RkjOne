-- Recover a native Fiuu VT callback whose attempt row was committed but whose
-- payment-row write was interrupted.  The callback claim and payment update
-- intentionally live in separate HTTP/database transactions; this worker RPC
-- closes that crash window without trusting client replay.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_received_recovery
  ON public.pos_fiuu_vt_attempts(processing_lease_expires_at, received_at, id)
  WHERE state = 'RECEIVED'
    AND result_json IS NOT NULL;

CREATE OR REPLACE FUNCTION public.list_pos_fiuu_vt_received_attempts(
  p_branch_ids UUID[],
  p_branch_codes TEXT[],
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(attempt_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_branch_ids IS NULL
    OR cardinality(p_branch_ids) = 0
    OR p_branch_codes IS NULL
    OR cardinality(p_branch_codes) = 0
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 500 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT attempt.id
  FROM public.pos_fiuu_vt_attempts AS attempt
  JOIN public.pos_online_payments AS payment
    ON payment.id = attempt.payment_id
  WHERE payment.provider = 'fiuu_vt'
    AND payment.branch_id = ANY(p_branch_ids)
    AND payment.sale_payload->>'fiuu_branch_code' = ANY(p_branch_codes)
    AND attempt.state = 'RECEIVED'
    AND attempt.result_json IS NOT NULL
    AND (
      attempt.processing_lease_expires_at IS NULL
      OR attempt.processing_lease_expires_at <= clock_timestamp()
    )
  ORDER BY attempt.received_at ASC NULLS FIRST,
    attempt.created_at ASC,
    attempt.id ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_pos_fiuu_vt_received_attempts(
  UUID[], TEXT[], INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pos_fiuu_vt_received_attempts(
  UUID[], TEXT[], INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_pos_fiuu_vt_received_attempt(
  p_attempt_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id UUID;
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_vt_attempts%ROWTYPE;
  v_result JSONB;
  v_recovery JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_observed_at TIMESTAMPTZ;
  v_transaction_id TEXT;
  v_invalid_reason TEXT;
  v_error_code TEXT;
  v_error_message TEXT;
BEGIN
  IF p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'INVALID_REQUEST');
  END IF;

  SELECT payment_id INTO v_payment_id
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = v_payment_id
    AND provider = 'fiuu_vt';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- Preserve the shared lock order used by callback, review and fulfilment:
  -- shift, payment, then callback attempt.
  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = v_payment_id
    AND provider = 'fiuu_vt'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.shift_id IS DISTINCT FROM v_shift_id THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_vt_attempts
  WHERE id = p_attempt_id
    AND payment_id = v_payment.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  IF v_attempt.state = 'CONSUMED' THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED');
  END IF;
  IF v_attempt.state = 'QUARANTINED' THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_QUARANTINED');
  END IF;
  IF v_attempt.state <> 'RECEIVED'
    OR v_attempt.op_type NOT IN ('SALE', 'STATUS', 'VOID')
    OR v_attempt.result_json IS NULL
    OR jsonb_typeof(v_attempt.result_json) <> 'object' THEN
    RETURN jsonb_build_object('outcome', 'INELIGIBLE');
  END IF;
  IF v_attempt.processing_lease_token IS NOT NULL
    AND v_attempt.processing_lease_expires_at > v_now THEN
    RETURN jsonb_build_object(
      'outcome', 'ACTIVE',
      'retry_after_ms', GREATEST(
        0,
        LEAST(
          30000,
          ceil(extract(epoch FROM (v_attempt.processing_lease_expires_at - v_now)) * 1000)::INTEGER
        )
      )
    );
  END IF;

  v_result := v_attempt.result_json;
  v_transaction_id := NULLIF(v_result->>'transactionId', '');
  v_observed_at := COALESCE(v_attempt.received_at, v_now);

  IF v_result->>'opType' IS DISTINCT FROM v_attempt.op_type THEN
    v_invalid_reason := 'OPERATION_MISMATCH';
  ELSIF v_result->>'callbackAttemptId' IS DISTINCT FROM v_attempt.id::TEXT
    OR v_result->>'callbackHost' IS DISTINCT FROM v_attempt.callback_host THEN
    v_invalid_reason := 'CALLBACK_IDENTITY_MISMATCH';
  ELSIF v_attempt.provider_order_id IS DISTINCT FROM v_payment.provider_order_id
    OR v_result->>'orderId' IS DISTINCT FROM v_payment.provider_order_id THEN
    v_invalid_reason := 'ORDER_MISMATCH';
  ELSIF v_payment.created_by IS NULL THEN
    v_invalid_reason := 'MISSING_ACTOR';
  END IF;

  IF v_invalid_reason IS NULL AND v_result->>'kind' = 'ERROR' THEN
    v_error_code := NULLIF(v_result->>'errorCode', '');
    v_error_message := NULLIF(v_result->>'errorMessage', '');
    IF COALESCE(v_error_code, '') !~ '^[A-Za-z0-9_-]{1,32}$' THEN
      v_invalid_reason := 'INVALID_ERROR_CODE';
    ELSIF v_payment.status = 'PENDING'
      AND NOT v_payment.fiuu_vt_review_required THEN
      IF v_attempt.op_type = 'STATUS' THEN
        PERFORM public.record_pos_fiuu_vt_provider_error(
          v_payment.id,
          v_error_code,
          v_error_message,
          v_result,
          v_observed_at
        );
      ELSE
        UPDATE public.pos_online_payments
        SET provider_result = v_result,
            updated_at = v_now
        WHERE id = v_payment.id
          AND status = 'PENDING'
          AND fiuu_vt_review_required = false;
      END IF;

      UPDATE public.pos_fiuu_vt_attempts
      SET state = 'CONSUMED',
          consumed_at = COALESCE(consumed_at, v_now),
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          updated_at = v_now
      WHERE id = v_attempt.id;
      RETURN jsonb_build_object('outcome', 'ERROR_RECORDED');
    ELSE
      UPDATE public.pos_fiuu_vt_attempts
      SET state = 'QUARANTINED',
          quarantined_at = COALESCE(quarantined_at, v_now),
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          updated_at = v_now
      WHERE id = v_attempt.id;
      RETURN jsonb_build_object('outcome', 'ERROR_QUARANTINED');
    END IF;
  ELSIF v_invalid_reason IS NULL AND v_result ? 'kind' THEN
    v_invalid_reason := 'UNEXPECTED_RESULT_KIND';
  END IF;

  IF v_invalid_reason IS NULL THEN
    IF v_result->>'status' NOT IN ('00', '11', '22', '33', '44', '45', '55') THEN
      v_invalid_reason := 'INVALID_STATUS';
    ELSIF COALESCE(v_transaction_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
      OR (
        v_payment.provider_transaction_id IS NOT NULL
        AND v_payment.provider_transaction_id IS DISTINCT FROM v_transaction_id
      ) THEN
      v_invalid_reason := 'TRANSACTION_MISMATCH';
    ELSIF EXISTS (
      SELECT 1
      FROM public.pos_online_payments AS owner
      WHERE owner.provider = v_payment.provider
        AND owner.provider_transaction_id = v_transaction_id
        AND owner.id <> v_payment.id
    ) THEN
      v_invalid_reason := 'TRANSACTION_ALREADY_OWNED';
    ELSIF v_result->>'currency' IS DISTINCT FROM 'MYR'
      OR v_result->>'channel' IS DISTINCT FROM 'RPP_DuitNowQR-Offline' THEN
      v_invalid_reason := 'PAYMENT_CONTEXT_MISMATCH';
    ELSIF NOT (
      CASE
        WHEN COALESCE(v_result->>'amountRm', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
        THEN round((v_result->>'amountRm')::NUMERIC, 2)
          = round(v_payment.amount_rm, 2)
        ELSE false
      END
    ) THEN
      v_invalid_reason := 'AMOUNT_MISMATCH';
    END IF;
  END IF;

  IF v_invalid_reason IS NULL
    AND (v_attempt.op_type = 'VOID' OR v_result->>'status' <> '00') THEN
    IF (v_payment.status IN ('PAID', 'REPORTED'))
      AND (v_attempt.op_type = 'VOID' OR v_result->>'status' <> '00') THEN
      UPDATE public.pos_online_payments
      SET provider_result = CASE
            WHEN provider_result->>'status' = '00' THEN provider_result
            ELSE v_result
          END,
          provider_status_checked_at = CASE
            WHEN v_attempt.op_type IN ('STATUS', 'VOID')
            THEN COALESCE(provider_status_checked_at, v_observed_at)
            ELSE provider_status_checked_at
          END,
          updated_at = v_now
      WHERE id = v_payment.id;

      UPDATE public.pos_fiuu_vt_attempts
      SET state = 'QUARANTINED',
          quarantined_at = COALESCE(quarantined_at, v_now),
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          updated_at = v_now
      WHERE id = v_attempt.id;

      PERFORM public.mark_pos_fiuu_vt_review_status_aware(
        v_payment.id,
        'REVERSAL_REVIEW',
        jsonb_build_object(
          'reason', 'NON_SUCCESS_RECOVERED_FROM_RECEIVED_ATTEMPT',
          'attemptId', v_attempt.id,
          'attemptOperation', v_attempt.op_type,
          'providerResult', v_result,
          'recordedAt', v_now
        )
      );
      RETURN jsonb_build_object('outcome', 'QUARANTINED_REVERSAL_REVIEW');
    END IF;

    IF v_payment.status = 'PENDING'
      AND NOT v_payment.fiuu_vt_review_required THEN
      UPDATE public.pos_online_payments
      SET provider_transaction_id = COALESCE(provider_transaction_id, v_transaction_id),
          provider_result = v_result,
          provider_sale_reported_at = CASE
            WHEN v_attempt.op_type = 'SALE'
            THEN COALESCE(provider_sale_reported_at, v_observed_at)
            ELSE provider_sale_reported_at
          END,
          provider_status_checked_at = CASE
            WHEN v_attempt.op_type IN ('STATUS', 'VOID')
            THEN COALESCE(provider_status_checked_at, v_observed_at)
            ELSE provider_status_checked_at
          END,
          status = CASE
            WHEN v_attempt.op_type = 'STATUS' AND v_result->>'status' = '11' THEN 'FAILED'
            WHEN v_attempt.op_type = 'STATUS' AND v_result->>'status' = '44' THEN 'CANCELLED'
            WHEN v_attempt.op_type = 'STATUS' AND v_result->>'status' = '55' THEN 'EXPIRED'
            ELSE status
          END,
          failed_at = CASE
            WHEN v_attempt.op_type = 'STATUS' AND v_result->>'status' IN ('11', '44', '55')
            THEN COALESCE(failed_at, v_observed_at)
            ELSE failed_at
          END,
          fiuu_vt_provider_error_code = CASE
            WHEN v_attempt.op_type = 'STATUS' THEN NULL
            ELSE fiuu_vt_provider_error_code
          END,
          fiuu_vt_provider_error_count = CASE
            WHEN v_attempt.op_type = 'STATUS' THEN 0
            ELSE fiuu_vt_provider_error_count
          END,
          fiuu_vt_provider_error_at = CASE
            WHEN v_attempt.op_type = 'STATUS' THEN NULL
            ELSE fiuu_vt_provider_error_at
          END,
          updated_at = v_now
      WHERE id = v_payment.id
        AND status = 'PENDING'
        AND fiuu_vt_review_required = false;

      UPDATE public.pos_fiuu_vt_attempts
      SET state = 'CONSUMED',
          consumed_at = COALESCE(consumed_at, v_now),
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          updated_at = v_now
      WHERE id = v_attempt.id;
      RETURN jsonb_build_object('outcome', 'NON_SUCCESS_RECORDED');
    END IF;

    UPDATE public.pos_fiuu_vt_attempts
    SET state = CASE WHEN v_payment.fiuu_vt_review_required THEN 'QUARANTINED' ELSE 'CONSUMED' END,
        consumed_at = CASE
          WHEN v_payment.fiuu_vt_review_required THEN consumed_at
          ELSE COALESCE(consumed_at, v_now)
        END,
        quarantined_at = CASE
          WHEN v_payment.fiuu_vt_review_required THEN COALESCE(quarantined_at, v_now)
          ELSE quarantined_at
        END,
        processing_lease_token = NULL,
        processing_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'outcome',
      CASE WHEN v_payment.fiuu_vt_review_required
        THEN 'NON_SUCCESS_QUARANTINED'
        ELSE 'NON_SUCCESS_ALREADY_TERMINAL'
      END
    );
  END IF;

  IF v_invalid_reason IS NULL AND v_result->>'status' IS DISTINCT FROM '00' THEN
    v_invalid_reason := 'NOT_SUCCESS';
  ELSIF v_invalid_reason IS NULL AND v_attempt.op_type = 'VOID' THEN
    v_invalid_reason := 'UNEXPECTED_VOID_SUCCESS_PATH';
  END IF;

  IF v_invalid_reason IS NOT NULL THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'QUARANTINED',
        quarantined_at = COALESCE(quarantined_at, v_now),
        processing_lease_token = NULL,
        processing_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_attempt.id;

    PERFORM public.mark_pos_fiuu_vt_review_status_aware(
      v_payment.id,
      'FOREIGN_CALLBACK_REVIEW',
      jsonb_build_object(
        'reason', 'RECEIVED_ATTEMPT_INVALID_EVIDENCE',
        'invalidReason', v_invalid_reason,
        'attemptId', v_attempt.id,
        'attemptOperation', v_attempt.op_type,
        'providerOrderId', v_attempt.provider_order_id,
        'result', v_result,
        'recordedAt', v_now
      )
    );
    RETURN jsonb_build_object(
      'outcome', 'QUARANTINED_INVALID_EVIDENCE',
      'reason', v_invalid_reason
    );
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'CONSUMED',
        consumed_at = COALESCE(consumed_at, v_now),
        processing_lease_token = NULL,
        processing_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object('outcome', 'ALREADY_PAID');
  END IF;

  -- A success arriving after the original payment became terminal or entered
  -- HQ review remains attached to that original order.  Never move it to the
  -- next customer's checkout and never silently declare it cancelled.
  IF v_payment.status NOT IN ('PENDING', 'REPORTED')
    OR v_payment.fiuu_vt_review_required
    OR v_payment.fiuu_vt_cashier_released_at IS NOT NULL THEN
    UPDATE public.pos_online_payments
    SET provider_transaction_id = COALESCE(
          provider_transaction_id,
          v_transaction_id
        ),
        provider_result = v_result,
        provider_sale_reported_at = CASE
          WHEN v_attempt.op_type IN ('SALE', 'STATUS')
          THEN COALESCE(provider_sale_reported_at, v_observed_at)
          ELSE provider_sale_reported_at
        END,
        provider_status_checked_at = CASE
          WHEN v_attempt.op_type = 'STATUS'
          THEN COALESCE(provider_status_checked_at, v_observed_at)
          ELSE provider_status_checked_at
        END,
        updated_at = v_now
    WHERE id = v_payment.id;

    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'QUARANTINED',
        quarantined_at = COALESCE(quarantined_at, v_now),
        processing_lease_token = NULL,
        processing_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_attempt.id;

    PERFORM public.mark_pos_fiuu_vt_review_status_aware(
      v_payment.id,
      'LATE_SUCCESS_REVIEW',
      jsonb_build_object(
        'reason', 'SUCCESS_RECOVERED_FROM_RECEIVED_ATTEMPT',
        'attemptId', v_attempt.id,
        'attemptOperation', v_attempt.op_type,
        'providerOrderId', v_attempt.provider_order_id,
        'providerTransactionId', v_transaction_id,
        'providerResult', v_result,
        'recordedAt', v_now
      )
    );
    RETURN jsonb_build_object('outcome', 'QUARANTINED_LATE_SUCCESS');
  END IF;

  UPDATE public.pos_online_payments
  SET provider_transaction_id = COALESCE(
        provider_transaction_id,
        v_transaction_id
      ),
      provider_result = CASE
        WHEN provider_result->>'opType' = 'STATUS'
          AND provider_result->>'status' = '00'
        THEN provider_result
        ELSE v_result
      END,
      provider_sale_reported_at = COALESCE(
        provider_sale_reported_at,
        v_observed_at
      ),
      provider_status_checked_at = CASE
        WHEN v_attempt.op_type = 'STATUS'
        THEN COALESCE(provider_status_checked_at, v_observed_at)
        ELSE provider_status_checked_at
      END,
      status = CASE
        WHEN v_attempt.op_type = 'STATUS' AND status = 'PENDING'
        THEN 'REPORTED'
        ELSE status
      END,
      fiuu_vt_provider_error_code = CASE
        WHEN v_attempt.op_type = 'STATUS' THEN NULL
        ELSE fiuu_vt_provider_error_code
      END,
      fiuu_vt_provider_error_count = CASE
        WHEN v_attempt.op_type = 'STATUS' THEN 0
        ELSE fiuu_vt_provider_error_count
      END,
      fiuu_vt_provider_error_at = CASE
        WHEN v_attempt.op_type = 'STATUS' THEN NULL
        ELSE fiuu_vt_provider_error_at
      END,
      fiuu_vt_recovery_next_at = CASE
        WHEN v_attempt.op_type = 'STATUS' THEN NULL
        ELSE fiuu_vt_recovery_next_at
      END,
      fiuu_vt_recovery_last_error = CASE
        WHEN v_attempt.op_type = 'STATUS' THEN NULL
        ELSE fiuu_vt_recovery_last_error
      END,
      updated_at = v_now
  WHERE id = v_payment.id
    AND provider = 'fiuu_vt'
    AND status IN ('PENDING', 'REPORTED')
    AND fiuu_vt_review_required = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'RETRY');
  END IF;

  IF v_attempt.op_type = 'SALE' THEN
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'CONSUMED',
        consumed_at = COALESCE(consumed_at, v_now),
        processing_lease_token = NULL,
        processing_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object('outcome', 'SALE_RECORDED');
  END IF;

  v_recovery := public.recover_pos_fiuu_vt_reported_payment(
    v_payment.id,
    v_payment.created_by
  );
  IF COALESCE(v_recovery->>'outcome', '') NOT IN (
    'FULFILLED',
    'ALREADY_PAID',
    'QUARANTINED'
  ) THEN
    RAISE EXCEPTION 'Received Fiuu VT STATUS recovery did not reach a safe terminal outcome';
  END IF;

  UPDATE public.pos_fiuu_vt_attempts
  SET state = 'CONSUMED',
      consumed_at = COALESCE(consumed_at, v_now),
      processing_lease_token = NULL,
      processing_lease_expires_at = NULL,
      updated_at = v_now
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'outcome', v_recovery->>'outcome',
    'payment_id', v_payment.id,
    'attempt_id', v_attempt.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_pos_fiuu_vt_received_attempt(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_pos_fiuu_vt_received_attempt(UUID)
  TO service_role;

COMMENT ON FUNCTION public.recover_pos_fiuu_vt_received_attempt(UUID) IS
  'Atomically replays expired-lease SALE, STATUS or VOID evidence from a durable RECEIVED Fiuu VT callback attempt into its original payment, exact-once fulfilment or HQ review state.';
