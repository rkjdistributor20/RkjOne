-- A local QR deadline does not prove that the provider did not charge.
-- Let the original authenticated tablet/staff use the existing read-only
-- STATUS path for a PENDING payment with durable, exact SALE=00 evidence.
-- Retain the three-attempt ceiling, locks, callback arbitration, and every
-- SALE/VOID rule. Never turn the SALE callback into proof of settlement.
DO $migration$
DECLARE
  v_rpc regprocedure := 'public.claim_pos_fiuu_vt_launch_lease(uuid,text,uuid,text,uuid,uuid)'::regprocedure;
  v_definition text := replace(pg_get_functiondef(v_rpc), chr(13)||chr(10), chr(10));
  v_expiry_guard constant text := 'IF v_payment.expires_at IS NOT NULL' || chr(10)
    || '          AND v_payment.expires_at <= v_now THEN';
  v_exact_sale_guard constant text := $new$IF v_payment.expires_at IS NOT NULL
          AND v_payment.expires_at <= v_now
          AND NOT (
            NULLIF(v_payment.provider_transaction_id, '') IS NOT NULL
            AND v_payment.provider_sale_reported_at IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.pos_fiuu_vt_attempts AS sale
              WHERE sale.payment_id = v_payment.id
                AND sale.provider_order_id = v_payment.provider_order_id
                AND sale.op_type = 'SALE'
                AND sale.state = 'CONSUMED'
                AND sale.launched_at IS NOT NULL
                AND sale.consumed_at IS NOT NULL
                AND sale.result_fingerprint IS NOT NULL
                AND sale.result_json->>'opType' = 'SALE'
                AND sale.result_json->>'status' = '00'
                AND sale.result_json->>'orderId' = v_payment.provider_order_id
                AND sale.result_json->>'transactionId' = v_payment.provider_transaction_id
                AND sale.result_json->>'currency' = 'MYR'
                AND sale.result_json->>'channel' = 'RPP_DuitNowQR-Offline'
                AND CASE WHEN sale.result_json->>'amountRm' ~ '^[0-9]+([.][0-9]{1,2})?$'
                  THEN (sale.result_json->>'amountRm')::numeric = v_payment.amount_rm
                  ELSE false END
            )
          ) THEN$new$;
BEGIN
  IF md5(v_definition) IS DISTINCT FROM '651e63b1af5fac935bebb4709936bc8d'
    OR strpos(v_definition, v_expiry_guard) = 0 THEN
    RAISE EXCEPTION 'Unexpected definition for Fiuu VT launch lease; refuse to replace it';
  END IF;
  EXECUTE replace(v_definition, v_expiry_guard, v_exact_sale_guard);
END;
$migration$;
