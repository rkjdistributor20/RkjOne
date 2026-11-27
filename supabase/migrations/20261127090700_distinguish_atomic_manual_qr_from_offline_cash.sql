-- Manual QR uses an online POS retry key; it is not an offline QR sale.
-- Propagate the key only inside the official-device-only, service-only
-- wrapper. General sale RPCs and offline sync remain cash-only for any key.
SET LOCAL lock_timeout='5s';
DO $patch$
DECLARE
 v_wrapper regprocedure:='public.process_pos_manual_qr_sale(uuid,uuid,integer,uuid,uuid,jsonb)'::regprocedure;
 v_guard regprocedure:='public.guard_offline_pos_transaction_insert()'::regprocedure;
 v_before text; v_after text;
BEGIN
 v_before:=replace(pg_get_functiondef(v_wrapper),chr(13)||chr(10),chr(10));
 v_after:=replace(v_before,$a$  v_result jsonb;$a$,$b$  v_previous_manual_key text:=current_setting('rkj.manual_qr_retry_key',true);
  v_result jsonb;$b$);
 v_after:=replace(v_after,$a$  v_result := public.process_pos_sale($a$,$b$  IF p_sale->>'offline_id' IS NOT NULL AND (p_sale->>'offline_id') !~
    ('^manual-qr:'||p_shift_id::text||':(cart-[0-9]{10,16}-[a-z0-9]{1,12}|[a-f0-9-]{36})$') THEN
    RAISE EXCEPTION 'Kunci cubaan semula QR tidak sah';
  END IF;
  PERFORM set_config('rkj.manual_qr_retry_key',coalesce(p_sale->>'offline_id',''),true);
  v_result := public.process_pos_sale($b$);
 v_after:=replace(v_after,$a$  PERFORM set_config('request.jwt.claim.sub',coalesce(v_before_subject,''),true);$a$,$b$  PERFORM set_config('rkj.manual_qr_retry_key',coalesce(v_previous_manual_key,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_before_subject,''),true);$b$);
 IF v_after=v_before OR position('v_previous_manual_key' IN v_after)=0 OR position('Kunci cubaan semula QR' IN v_after)=0 THEN
  RAISE EXCEPTION 'Unexpected manual QR wrapper preimage';
 END IF;
 EXECUTE v_after;
 v_before:=replace(pg_get_functiondef(v_guard),chr(13)||chr(10),chr(10));
 v_after:=replace(v_before,$a$  IF NEW.payment_method <> 'CASH'
    OR COALESCE(NEW.qr_amount, 0) <> 0 THEN$a$,$b$  IF NOT (
    NEW.payment_method IN ('QR','MIXED') AND NEW.qr_amount>0
    AND NEW.offline_id=coalesce(current_setting('rkj.manual_qr_retry_key',true),'')
    AND NEW.offline_id LIKE 'manual-qr:'||NEW.shift_id::text||':%'
  ) AND (NEW.payment_method<>'CASH' OR COALESCE(NEW.qr_amount,0)<>0) THEN$b$);
 IF v_after=v_before THEN RAISE EXCEPTION 'Unexpected offline POS guard preimage'; END IF;
 EXECUTE v_after;
END;
$patch$;
