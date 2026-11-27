SET LOCAL lock_timeout='5s';

CREATE FUNCTION public.validate_pos_server_actor_device(
 p_actor_id uuid,p_device_id uuid,p_enrollment_generation integer,p_branch_id uuid
) RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO v_actor FROM public.profiles WHERE id=p_actor_id AND status='ACTIVE'
  AND role IN ('SUPER_ADMIN','ADMIN','OPERATION_MANAGER','AREA_MANAGER','STAFF') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Akaun POS tidak aktif'; END IF;
 PERFORM 1 FROM public.branches WHERE id=p_branch_id AND organization_id=v_actor.organization_id AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND OR (v_actor.role='STAFF' AND v_actor.branch_id IS DISTINCT FROM p_branch_id) OR
  (v_actor.role='AREA_MANAGER' AND NOT EXISTS(
   SELECT 1 FROM public.profile_branch_access WHERE profile_id=v_actor.id AND branch_id=p_branch_id
  )) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Akses di luar cawangan POS';
 END IF;
 PERFORM 1 FROM public.pos_devices WHERE id=p_device_id AND enrollment_generation=p_enrollment_generation
  AND organization_id=v_actor.organization_id AND branch_id=p_branch_id AND status='ACTIVE'
  AND enrolled_at IS NOT NULL AND secret_hash IS NOT NULL AND asset_verified_at IS NOT NULL AND asset_verified_by IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Tablet POS rasmi diperlukan'; END IF;
 RETURN v_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_pos_server_actor_device(uuid,uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.open_registered_pos_manager_shift(
 p_actor_id uuid,p_device_id uuid,p_enrollment_generation integer,p_branch_id uuid,
 p_opening_cash numeric,p_staff_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_before text:=current_setting('request.jwt.claim.sub',true); v_result jsonb;
BEGIN
 v_actor:=public.validate_pos_server_actor_device(p_actor_id,p_device_id,p_enrollment_generation,p_branch_id);
 IF v_actor.role='STAFF' OR p_opening_cash IS NULL OR p_opening_cash<0 OR p_opening_cash>1000000 OR p_opening_cash<>round(p_opening_cash,2) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Akaun pengurus atau tunai pembukaan tidak sah';
 END IF;
 IF p_staff_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.staff s WHERE s.id=p_staff_id AND s.organization_id=v_actor.organization_id
   AND s.status='ACTIVE' AND (s.branch_id=p_branch_id OR (v_actor.role='AREA_MANAGER' AND s.profile_id=v_actor.id))
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Staf pembukaan tidak berada dalam skop'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pos-staff-open:'||v_actor.organization_id::text,0));
 PERFORM set_config('request.jwt.claim.sub',v_actor.id::text,true);
 v_result:=public.open_pos_shift(p_branch_id,p_opening_cash,p_staff_id);
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_before,''),true);
 RETURN v_result;
END;
$$;

CREATE FUNCTION public.process_registered_pos_cash_sale(
 p_actor_id uuid,p_device_id uuid,p_enrollment_generation integer,p_shift_id uuid,p_branch_id uuid,p_sale jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_before text:=current_setting('request.jwt.claim.sub',true); v_result jsonb;
BEGIN
 v_actor:=public.validate_pos_server_actor_device(p_actor_id,p_device_id,p_enrollment_generation,p_branch_id);
 IF p_sale->>'payment_method' IS DISTINCT FROM 'CASH' OR coalesce((p_sale->>'qr_amount')::numeric,0)<>0
  OR coalesce(p_sale->>'offline_id','') LIKE 'manual-qr:%' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Laluan ini hanya menerima jualan tunai';
 END IF;
 PERFORM 1 FROM public.pos_shifts WHERE id=p_shift_id AND organization_id=v_actor.organization_id
  AND branch_id=p_branch_id AND status='OPEN' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Syif POS tidak lagi terbuka'; END IF;
 IF v_actor.role IN ('STAFF','AREA_MANAGER') AND NOT EXISTS(
  SELECT 1 FROM public.pos_shift_staff_members m WHERE m.organization_id=v_actor.organization_id
   AND m.branch_id=p_branch_id AND m.shift_id=p_shift_id AND m.profile_id=v_actor.id AND m.status='ACTIVE'
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Keahlian aktif dalam syif asal diperlukan'; END IF;
 PERFORM set_config('request.jwt.claim.sub',v_actor.id::text,true);
 v_result:=public.process_pos_sale(p_shift_id,p_branch_id,p_sale->'items','CASH',
  (p_sale->>'cash_amount')::numeric,0,coalesce((p_sale->>'discount')::numeric,0),
  p_sale->>'offline_id',p_sale->>'receipt_email',p_sale->>'receipt_phone');
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_before,''),true);
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.open_pos_shift(uuid,numeric,uuid),
 public.process_pos_sale(uuid,uuid,jsonb,public.payment_method,numeric,numeric,numeric,text,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.open_registered_pos_manager_shift(uuid,uuid,integer,uuid,numeric,uuid),
 public.process_registered_pos_cash_sale(uuid,uuid,integer,uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_registered_pos_manager_shift(uuid,uuid,integer,uuid,numeric,uuid),
 public.process_registered_pos_cash_sale(uuid,uuid,integer,uuid,uuid,jsonb) TO service_role;
