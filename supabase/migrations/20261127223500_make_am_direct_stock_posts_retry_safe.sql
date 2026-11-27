-- Protect reference-free external receipts and direct adjustments against a
-- stale/retried HTTP request. The existing validated ledger functions are
-- still the only code that writes actual stock movements.
SET LOCAL lock_timeout = '5s';

CREATE TABLE private_rkj.am_stock_operation_requests (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 request_id uuid NOT NULL,
 fingerprint bytea NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,actor_id,request_id)
);
REVOKE ALL ON TABLE private_rkj.am_stock_operation_requests FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private_rkj.am_stock_operation_requests ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.post_am_stock_operation(p_location_id uuid,p_request_id uuid,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 v_loc public.inventory_locations := public.require_am_stock_kiosk(p_location_id);
 v_actor uuid := auth.uid();
 v_previous private_rkj.am_stock_operation_requests%ROWTYPE;
 v_fingerprint bytea;
 v_result jsonb;
BEGIN
 IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('RECEIVE','ADJUSTMENT')
   OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Butiran operasi stok atau kunci cubaan semula tidak sah';
 END IF;
 v_fingerprint:=sha256(convert_to(jsonb_build_array(p_location_id,p_action,p_payload)::text,'UTF8'));
 PERFORM pg_advisory_xact_lock(hashtextextended('am-stock-post:'||v_loc.organization_id||':'||v_actor||':'||p_request_id,0));
 SELECT * INTO v_previous FROM private_rkj.am_stock_operation_requests
  WHERE organization_id=v_loc.organization_id AND actor_id=v_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF v_previous.fingerprint IS DISTINCT FROM v_fingerprint THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Kunci cubaan semula sudah digunakan dengan butiran berlainan';
  END IF;
  RETURN v_previous.result || jsonb_build_object('reused',true);
 END IF;
 IF p_action='RECEIVE' THEN
  v_result:=public.post_am_stock_receipt(p_location_id,p_payload->'items',p_payload->>'source',
   p_payload->>'document_reference',p_payload->>'notes');
 ELSE
  v_result:=public.post_am_stock_adjustment(p_location_id,p_payload->>'reason',p_payload->'items');
 END IF;
 INSERT INTO private_rkj.am_stock_operation_requests(organization_id,actor_id,request_id,fingerprint,result)
 VALUES(v_loc.organization_id,v_actor,p_request_id,v_fingerprint,v_result);
 RETURN v_result || jsonb_build_object('reused',false);
END;
$$;
REVOKE ALL ON FUNCTION public.post_am_stock_operation(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_am_stock_operation(uuid,uuid,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.post_am_stock_receipt(uuid,jsonb,text,text,text),
 public.post_am_stock_adjustment(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
