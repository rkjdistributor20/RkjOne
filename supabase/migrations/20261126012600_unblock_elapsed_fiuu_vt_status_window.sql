-- If SALE never returned and the normal STATUS window already expired,
-- the cashier cannot acquire the three STATUS leases required by the old
-- retry-budget gate. After the existing 20-minute late-callback grace, the
-- exact original payment can enter HQ review without inventing an outcome.
-- No payment rows are touched by this migration itself.
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  v_target regprocedure := to_regprocedure(
    'public.park_pos_fiuu_vt_status_retry_limit(uuid,uuid,uuid,integer)'
  );
  v_definition text := pg_get_functiondef(v_target);
BEGIN
  -- Guard the full preimage: retain locks, role/device/shift checks, provider
  -- evidence checks, callback identity and existing execution privileges.
  IF md5(v_definition) IS DISTINCT FROM 'ff2866e36c6247c9140cec8696d7f3fb' THEN
    RAISE EXCEPTION 'Unexpected definition for Fiuu VT STATUS retry quarantine';
  END IF;

  v_definition := replace(
    v_definition,
    'IF v_status_attempt_count < v_status_retry_budget THEN',
    $new$IF v_status_attempt_count < v_status_retry_budget
    AND v_payment.expires_at > v_now - interval '20 minutes' THEN$new$
  );
  v_definition := replace(
    v_definition,
    $old$'statusRetryBudget', v_status_retry_budget,$old$,
    $new$'statusRetryBudget', v_status_retry_budget,
    'releasePath', CASE WHEN v_status_attempt_count >= v_status_retry_budget
      THEN 'STATUS_BUDGET_EXHAUSTED' ELSE 'CALLBACK_WINDOW_ELAPSED' END,$new$
  );
  v_definition := replace(
    v_definition,
    $old$fiuu_vt_recovery_last_error = 'STATUS_RETRY_LIMIT_EXHAUSTED',$old$,
    $new$fiuu_vt_recovery_last_error = CASE WHEN v_status_attempt_count >= v_status_retry_budget
        THEN 'STATUS_RETRY_LIMIT_EXHAUSTED' ELSE 'STATUS_WINDOW_ELAPSED_WITHOUT_RESULT' END,$new$
  );
  EXECUTE v_definition;
END;
$migration$;
