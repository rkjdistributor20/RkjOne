-- The order QR deadline is not the callback deadline of a fresh STATUS.
-- Keep the original open-shift/tenant guards. Outside the old grace window,
-- allow only the exact authenticated STATUS=00 already durably RECEIVED for
-- this payment, with a preceding SALE reference and an on-time STATUS callback.
-- No provider outcome or payment row is written by this migration.
DO $migration$
DECLARE
  v_rpc regprocedure := 'public.guard_fiuu_vt_reported_open_shift()'::regprocedure;
  v_definition text := replace(pg_get_functiondef(v_rpc), chr(13)||chr(10), chr(10));
  v_old constant text := 'IF NEW.expires_at IS NULL' || chr(10)
    || '      OR now() > NEW.expires_at + INTERVAL ''20 minutes'' THEN';
  v_new constant text := $new$IF NEW.expires_at IS NULL
      OR (now() > NEW.expires_at + INTERVAL '20 minutes' AND (
        OLD.status = 'PENDING'
        AND OLD.provider_sale_reported_at IS NOT NULL
        AND NULLIF(OLD.provider_transaction_id, '') IS NOT NULL
        AND NEW.provider_transaction_id = OLD.provider_transaction_id
        AND NEW.provider_order_id = OLD.provider_order_id
        AND NEW.provider_status_checked_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.pos_fiuu_vt_attempts AS status_attempt
          WHERE status_attempt.payment_id = OLD.id
            AND status_attempt.provider_order_id = OLD.provider_order_id
            AND status_attempt.op_type = 'STATUS'
            AND status_attempt.state = 'RECEIVED'
            AND status_attempt.result_fingerprint IS NOT NULL
            AND status_attempt.launched_at IS NOT NULL
            AND status_attempt.received_at BETWEEN status_attempt.launched_at AND status_attempt.expires_at
            AND status_attempt.result_json = NEW.provider_result
            AND status_attempt.result_json->>'opType' = 'STATUS'
            AND status_attempt.result_json->>'status' = '00'
            AND status_attempt.result_json->>'callbackAttemptId' = status_attempt.id::text
            AND status_attempt.result_json->>'callbackHost' = status_attempt.callback_host
            AND status_attempt.result_json->>'orderId' = OLD.provider_order_id
            AND status_attempt.result_json->>'transactionId' = OLD.provider_transaction_id
            AND status_attempt.result_json->>'currency' = 'MYR'
            AND status_attempt.result_json->>'channel' = 'RPP_DuitNowQR-Offline'
            AND CASE WHEN status_attempt.result_json->>'amountRm' ~ '^[0-9]+([.][0-9]{1,2})?$'
              THEN (status_attempt.result_json->>'amountRm')::numeric = OLD.amount_rm
              ELSE false END
        )
      ) IS NOT TRUE) THEN$new$;
BEGIN
  IF md5(v_definition) IS DISTINCT FROM 'c94f78a68bc13b19003b81eef563c198'
    OR strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Unexpected definition for Fiuu VT reported guard; refuse to replace it';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
