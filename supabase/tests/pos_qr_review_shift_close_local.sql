-- Isolated fixtures for the real migration. Existing sale and fulfillment
-- routines are boundary doubles; no merchant/network access is used.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TYPE public.payment_method AS ENUM ('CASH','QR','MIXED');
CREATE TABLE public.branches(id uuid PRIMARY KEY, organization_id uuid, branch_code text, status text);
CREATE TABLE public.profiles(id uuid, organization_id uuid, status text);
CREATE TABLE public.pos_devices(id uuid, branch_id uuid, organization_id uuid, status text,
 enrollment_generation integer, enrolled_at timestamptz, secret_hash text, asset_verified_at timestamptz, asset_verified_by uuid);
CREATE TABLE public.pos_shifts(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, status text,
 closed_at timestamptz, closed_by uuid, actual_work_ended_at timestamptz, opening_cash numeric, closing_cash numeric,
 expected_cash numeric, cash_variance numeric, total_cash numeric, total_qr numeric, total_sales numeric, transaction_count integer);
CREATE TABLE public.pos_transactions(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, shift_id uuid,
 qr_amount numeric, status text, payment_method public.payment_method, transaction_number text, created_by uuid);
CREATE TABLE public.pos_online_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, branch_id uuid, shift_id uuid,
 amount_rm numeric, status text, provider text, gateway_ref text, sale_payload jsonb, transaction_id uuid, created_by uuid,
 paid_at timestamptz, expires_at timestamptz, fiuu_vt_review_required boolean, fiuu_vt_cashier_released_at timestamptz,
 fiuu_vt_reconciliation_state text, provider_transaction_id text, provider_status_checked_at timestamptz, provider_result jsonb,
 fiuu_vt_review_evidence jsonb);
CREATE TABLE public.pos_fiuu_vt_attempts(id uuid PRIMARY KEY, payment_id uuid, provider_order_id text, op_type text, state text,
 launch_lease_expires_at timestamptz, expires_at timestamptz, processing_lease_token uuid, processing_lease_expires_at timestamptz,
 result_json jsonb, result_fingerprint text, callback_host text, received_at timestamptz);
ALTER TABLE public.pos_online_payments ADD COLUMN provider_order_id text;
CREATE TABLE public.pos_shift_staff_members(id uuid, staff_id uuid, profile_id uuid, shift_id uuid, status text,
 started_at timestamptz, ended_at timestamptz, role_in_shift text);
CREATE TABLE public.pos_fiuu_vt_shift_closures(shift_id uuid PRIMARY KEY, organization_id uuid, branch_id uuid,
 review_payment_ids uuid[], close_snapshot jsonb);
CREATE TABLE public.pos_fiuu_vt_shift_close_rollout(branch_id uuid PRIMARY KEY);
CREATE TABLE public.pos_trial_payment_markers(payment_id uuid);
CREATE TABLE public.pos_trial_shift_markers(shift_id uuid);
CREATE TABLE public.audit_logs(organization_id uuid,user_id uuid,action text,entity_type text,entity_id uuid,new_values jsonb);
CREATE FUNCTION public.process_pos_sale(uuid,uuid,jsonb,public.payment_method,numeric,numeric,numeric,text,text,text)
RETURNS jsonb LANGUAGE SQL AS $$
  SELECT jsonb_build_object('transaction_id',id,'transaction_number',transaction_number) FROM public.pos_transactions WHERE shift_id=$1;
$$;
CREATE FUNCTION public.close_pos_shift_with_qr_review(uuid,uuid,uuid,integer,numeric,timestamptz,text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_shift public.pos_shifts%rowtype; v_snapshot jsonb;
BEGIN
  SELECT * INTO v_shift FROM public.pos_shifts WHERE id=$1;
  SELECT close_snapshot INTO v_snapshot FROM public.pos_fiuu_vt_shift_closures WHERE shift_id=$1;
  RETURN jsonb_build_object('confirmed_qr_rm', v_shift.total_qr, 'shift',$1);
END;
$$;
-- MIGRATION UNCHANGED

CREATE TRIGGER verify_manual_close BEFORE UPDATE OF status ON public.pos_shifts FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_shift_close_pending_payments();
DO $fixture$
DECLARE
 o uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 m uuid; snapshot jsonb; proof jsonb; reviewed jsonb;
 sale jsonb:=jsonb_build_object('payment_method','MIXED','qr_amount','3.50','manual_fiuu_transaction_id','12345678');
BEGIN
 INSERT INTO public.profiles VALUES(a,o,'ACTIVE');
 INSERT INTO public.pos_devices VALUES(d,b,o,'ACTIVE',1,now(),'local-only',now(),a);
 INSERT INTO public.pos_shifts(id,organization_id,branch_id,status,opening_cash,total_cash,total_qr,total_sales,transaction_count)
 VALUES(s,o,b,'OPEN',100,3,5,8,2);
 INSERT INTO public.pos_transactions VALUES(t,o,b,s,3.50,'COMPLETED','MIXED','TX-local',a);
 m:=(public.process_pos_manual_qr_sale(a,d,1,s,b,sale)->'manual_payment_review'->>'id')::uuid;
 IF m IS NULL OR m IS DISTINCT FROM (public.process_pos_manual_qr_sale(a,d,1,s,b,sale)->'manual_payment_review'->>'id')::uuid
   OR (SELECT count(*) FROM public.pos_online_payments WHERE transaction_id=t)<>1 THEN
   RAISE EXCEPTION 'Manual review was not atomically reused'; END IF;
 IF (SELECT status FROM public.pos_online_payments WHERE id=m)<>'PENDING' THEN RAISE EXCEPTION 'Unverified manual was credited'; END IF;
 INSERT INTO public.pos_online_payments(id,organization_id,branch_id,shift_id,amount_rm,status,provider,expires_at,sale_payload,provider_order_id)
 VALUES(v,o,b,s,2.50,'PENDING','fiuu_vt',now()+interval '10 minutes','{"payment_method":"QR","cash_amount":0}','RKJ_LOCAL');
 INSERT INTO public.pos_fiuu_vt_shift_closures VALUES(s,o,b,'{}',jsonb_build_object('close_intent_xid',txid_current()::text));
 BEGIN
   UPDATE public.pos_shifts SET status='CLOSED',actual_work_ended_at=now(),closing_cash=103 WHERE id=s;
   RAISE EXCEPTION 'Active Fiuu QR did not block close';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.pos_online_payments SET status='QUARANTINED',fiuu_vt_review_required=true,
   fiuu_vt_reconciliation_state='LATE_SUCCESS_REVIEW' WHERE id=v;
 UPDATE public.pos_shifts SET status='CLOSED',actual_work_ended_at=now(),closed_at=now(),
   closing_cash=103,expected_cash=103,cash_variance=0 WHERE id=s;
 SELECT close_snapshot INTO snapshot FROM public.pos_fiuu_vt_shift_closures WHERE shift_id=s;
 IF (snapshot->>'confirmed_qr_rm')::numeric IS DISTINCT FROM 1.50 OR (snapshot->>'closing_cash')::numeric IS DISTINCT FROM 103
   OR (snapshot->>'confirmed_sales_rm')::numeric IS DISTINCT FROM 4.50
   OR (snapshot->>'qr_review_count')::integer IS DISTINCT FROM 2
   OR NOT EXISTS(SELECT 1 FROM public.pos_fiuu_vt_shift_closures WHERE shift_id=s AND review_payment_ids @> ARRAY[m,v]) THEN
   RAISE EXCEPTION 'Snapshot counted a pending payment or affected cash: %',snapshot; END IF;
 IF public.pos_fiuu_vt_status_is_verified(v,'12345679') THEN RAISE EXCEPTION 'Accepted missing STATUS evidence'; END IF;
 proof:=jsonb_build_object('callbackAttemptId',c,'callbackHost','fixture.example.invalid','opType','STATUS','status','00',
   'orderId','RKJ_LOCAL','transactionId','12345679','amountRm','2.50','currency','MYR','channel','RPP_DuitNowQR-Offline');
 INSERT INTO public.pos_fiuu_vt_attempts(id,payment_id,provider_order_id,op_type,state,result_json,result_fingerprint,callback_host,received_at)
 VALUES(c,v,'RKJ_LOCAL','STATUS','CONSUMED',proof,repeat('a',64),'fixture.example.invalid',now());
 UPDATE public.pos_online_payments SET provider_transaction_id='12345679',provider_status_checked_at=now(),
   provider_result=proof || '{"amountRm":"3.50"}' WHERE id=v;
 reviewed:=public.reconcile_pos_fiuu_vt_review_status(ARRAY[b],12);
 IF reviewed->>'verified'<>'0' THEN RAISE EXCEPTION 'Conflicting amount was accepted'; END IF;
 UPDATE public.pos_online_payments SET provider_result=proof WHERE id=v;
 INSERT INTO public.pos_trial_payment_markers VALUES(v);
 reviewed:=public.reconcile_pos_fiuu_vt_review_status(ARRAY[b],12);
 IF reviewed->>'verified'<>'0' THEN RAISE EXCEPTION 'Trial was accepted'; END IF;
 DELETE FROM public.pos_trial_payment_markers WHERE payment_id=v;
 reviewed:=public.reconcile_pos_fiuu_vt_review_status(ARRAY[b],12);
 IF reviewed->>'verified'<>'1' OR (SELECT status FROM public.pos_online_payments WHERE id=v)<>'QUARANTINED' THEN
   RAISE EXCEPTION 'Exact STATUS not audited or changed POS state: %',reviewed; END IF;
 reviewed:=public.reconcile_pos_fiuu_vt_review_status(ARRAY[b],12);
 IF reviewed->>'verified'<>'0'
   OR (SELECT count(*) FROM public.audit_logs WHERE entity_id=v AND action='FIUU_VT_STATUS_MATCHED')<>1
   OR (SELECT close_snapshot FROM public.pos_fiuu_vt_shift_closures WHERE shift_id=s) IS DISTINCT FROM snapshot THEN
   RAISE EXCEPTION 'Replayed evidence duplicated or changed cash/time'; END IF;
END;
$fixture$;
