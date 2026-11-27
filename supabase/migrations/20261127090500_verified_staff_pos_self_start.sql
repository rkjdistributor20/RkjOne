SET LOCAL lock_timeout = '5s';

-- A cashier cannot directly write ACTIVE attendance for any account or fake
-- an assisted request already approved. The service RPC below verifies device
-- binding and the active staff/profile pair instead.
CREATE POLICY pos_staff_direct_insert_pending_only ON public.pos_shift_staff_members
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (
  (SELECT public.user_role())<>'STAFF'
  OR (status='PENDING_APPROVAL' AND approved_at IS NULL AND approved_by IS NULL)
 );

CREATE POLICY pos_staff_approval_manager_scope ON public.approval_requests AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (entity_type<>'POS_SHIFT_STAFF' OR (
  (SELECT public.user_role()) IN ('SUPER_ADMIN','ADMIN','OPERATION_MANAGER','AREA_MANAGER')
  AND public.has_branch_access(branch_id)
 ))
 WITH CHECK (entity_type<>'POS_SHIFT_STAFF' OR (
  (SELECT public.user_role()) IN ('SUPER_ADMIN','ADMIN','OPERATION_MANAGER','AREA_MANAGER')
  AND public.has_branch_access(branch_id)
  AND ((status='APPROVED' AND approved_by=(SELECT auth.uid())) OR
       (status='REJECTED' AND rejected_by=(SELECT auth.uid())) OR status='PENDING')
 ));

-- Close only the legacy approval linked to a newly verified self-start. The
-- status transition does not record the cashier as their own approver.
DO $patch$
DECLARE v_before text:=replace(pg_get_functiondef('public.sync_pos_shift_staff_approval()'::regprocedure),chr(13)||chr(10),chr(10)); v_after text;
BEGIN
 v_after:=replace(v_before,$old$  IF NEW.status::text = 'APPROVED' THEN$old$,$new$  IF NEW.status::text = 'APPROVED' THEN
    IF NEW.approved_by IS NULL
      AND current_setting('rkj.pos_verified_self_member',true)=NEW.entity_id::text
      AND NEW.metadata->>'resolved_by_verified_self_start'='true'
      AND EXISTS (
        SELECT 1 FROM public.pos_shift_staff_members m
        WHERE m.id=NEW.entity_id AND m.organization_id=NEW.organization_id
          AND m.branch_id=NEW.branch_id AND m.status='ACTIVE'
          AND m.profile_id=m.started_by AND m.approved_by IS NULL
      )
    THEN RETURN NEW; END IF;
    IF NEW.approved_by IS DISTINCT FROM auth.uid() OR NOT public.has_branch_access(NEW.branch_id) THEN
      RAISE EXCEPTION 'Approver or branch does not match the authenticated actor';
    END IF;$new$);
 v_after:=replace(v_after,$old$  ELSE
    SELECT p.role$old$,$new$  ELSE
    IF NEW.rejected_by IS DISTINCT FROM auth.uid() OR NOT public.has_branch_access(NEW.branch_id) THEN
      RAISE EXCEPTION 'Reviewer or branch does not match the authenticated actor';
    END IF;
    SELECT p.role$new$);
 IF v_before=v_after OR position('Reviewer or branch does not match' IN v_after)=0 THEN
  RAISE EXCEPTION 'Unexpected POS approvals resolver preimage';
 END IF;
 EXECUTE v_after;
END;
$patch$;

CREATE OR REPLACE FUNCTION public.start_verified_pos_staff_shift(
 p_actor_id uuid,p_device_id uuid,p_enrollment_generation integer,p_branch_id uuid,
 p_shift_id uuid DEFAULT NULL,p_opening_cash numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 v_actor public.profiles%ROWTYPE; v_staff public.staff%ROWTYPE; v_shift public.pos_shifts%ROWTYPE;
 v_member public.pos_shift_staff_members%ROWTYPE; v_old jsonb; v_now timestamptz;
 v_previous_actor text:=current_setting('request.jwt.claim.sub',true);
 v_previous_member text:=current_setting('rkj.pos_verified_self_member',true);
 v_local timestamp; v_schedule text; v_opened jsonb; v_role text;
BEGIN
 SELECT * INTO v_actor FROM public.profiles WHERE id=p_actor_id AND status='ACTIVE'
  AND role='STAFF' AND branch_id=p_branch_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Akaun staf bukan milik cawangan ini'; END IF;
 PERFORM 1 FROM public.branches WHERE id=p_branch_id AND organization_id=v_actor.organization_id AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cawangan tidak aktif'; END IF;
 SELECT * INTO STRICT v_staff FROM public.staff WHERE organization_id=v_actor.organization_id
  AND profile_id=v_actor.id AND branch_id=p_branch_id AND status='ACTIVE' FOR SHARE;
 PERFORM 1 FROM public.pos_devices WHERE id=p_device_id AND enrollment_generation=p_enrollment_generation
  AND organization_id=v_actor.organization_id AND branch_id=p_branch_id AND status='ACTIVE'
  AND enrolled_at IS NOT NULL AND secret_hash IS NOT NULL
  AND asset_verified_at IS NOT NULL AND asset_verified_by IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Tablet POS rasmi diperlukan'; END IF;

 IF p_shift_id IS NULL THEN
  IF p_opening_cash IS NULL OR p_opening_cash<0 OR p_opening_cash>1000000 OR p_opening_cash<>round(p_opening_cash,2) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Tunai pembukaan tidak sah';
  END IF;
  -- The old shift sequence is per organization. Serialize staff openings
  -- using the same organization key and preserve the official open routine.
  PERFORM pg_advisory_xact_lock(hashtextextended('pos-staff-open:'||v_actor.organization_id::text,0));
  SELECT * INTO v_shift FROM public.pos_shifts WHERE organization_id=v_actor.organization_id AND branch_id=p_branch_id
   AND status='OPEN' FOR UPDATE;
  IF FOUND AND (v_shift.opened_by<>v_actor.id OR v_shift.opening_cash IS DISTINCT FROM p_opening_cash) THEN
   RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Syif cawangan sudah dibuka. Rekod diri mula bertugas dalam syif itu.';
  END IF;
  IF NOT FOUND THEN
   PERFORM set_config('request.jwt.claim.sub',v_actor.id::text,true);
   v_opened:=public.open_pos_shift(p_branch_id,p_opening_cash,v_staff.id);
   PERFORM set_config('request.jwt.claim.sub',coalesce(v_previous_actor,''),true);
   SELECT * INTO STRICT v_shift FROM public.pos_shifts WHERE id=(v_opened->>'shift_id')::uuid FOR UPDATE;
  END IF;
 ELSE
  SELECT * INTO v_shift FROM public.pos_shifts WHERE id=p_shift_id AND organization_id=v_actor.organization_id
   AND branch_id=p_branch_id AND status='OPEN' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Syif POS terbuka tidak dijumpai'; END IF;
 END IF;

 SELECT * INTO v_member FROM public.pos_shift_staff_members m
 WHERE m.shift_id=v_shift.id AND m.organization_id=v_actor.organization_id AND m.branch_id=p_branch_id
  AND m.profile_id=v_actor.id AND m.status IN ('ACTIVE','PENDING_APPROVAL')
 ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END, m.created_at, m.id LIMIT 1;
 IF FOUND AND v_member.status='ACTIVE' THEN
  RETURN jsonb_build_object('shift',to_jsonb(v_shift),'member',to_jsonb(v_member),'reused',true);
 END IF;
 v_now:=clock_timestamp();
 v_old:=to_jsonb(v_member);
 v_role:=CASE WHEN v_shift.opened_by=v_actor.id AND NOT EXISTS (
  SELECT 1 FROM public.pos_shift_staff_members WHERE shift_id=v_shift.id AND role_in_shift='PIC' AND status='ACTIVE'
 ) THEN 'PIC' ELSE 'JUALAN' END;
 IF v_member.id IS NULL THEN
  INSERT INTO public.pos_shift_staff_members (organization_id,branch_id,shift_id,profile_id,staff_id,full_name,
   role_in_shift,status,started_at,started_by,approval_notes)
  VALUES(v_actor.organization_id,p_branch_id,v_shift.id,v_actor.id,v_staff.id,v_staff.full_name,
   v_role,'ACTIVE',v_now,v_actor.id,'Identiti staf dan tablet rasmi disahkan; kelulusan tidak diperlukan.')
  RETURNING * INTO v_member;
 ELSE
  -- Manager approval/rejection can race; update only if still pending.
  PERFORM 1 FROM public.approval_requests WHERE organization_id=v_actor.organization_id AND branch_id=p_branch_id
   AND entity_type='POS_SHIFT_STAFF' AND entity_id=v_member.id AND status='PENDING' ORDER BY id FOR UPDATE;
  UPDATE public.pos_shift_staff_members
  SET staff_id=v_staff.id,full_name=v_staff.full_name,role_in_shift=v_role,status='ACTIVE',started_at=v_now,started_by=v_actor.id,
   approval_notes='Identiti staf dan tablet rasmi disahkan; kelulusan tidak diperlukan.'
  WHERE id=v_member.id AND status='PENDING_APPROVAL' RETURNING * INTO v_member;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Keahlian syif telah berubah. Cuba semula.'; END IF;
  PERFORM set_config('rkj.pos_verified_self_member',v_member.id::text,true);
  UPDATE public.approval_requests SET status='APPROVED',resolved_at=v_now,approved_by=NULL,
   metadata=metadata||jsonb_build_object('resolved_by_verified_self_start',true)
  WHERE organization_id=v_actor.organization_id AND branch_id=p_branch_id
   AND entity_type='POS_SHIFT_STAFF' AND entity_id=v_member.id AND status='PENDING';
  PERFORM set_config('rkj.pos_verified_self_member',coalesce(v_previous_member,''),true);
 END IF;

 -- A missing/late schedule is an observation only; the planned row and
 -- actual attendance are retained separately, including overnight windows.
 v_local:=v_now AT TIME ZONE 'Asia/Kuala_Lumpur';
 SELECT CASE WHEN count(*)=0 THEN 'NO_PUBLISHED_SCHEDULE'
  WHEN bool_or(v_local>=s.shift_date+s.scheduled_start AND v_local<
    s.shift_date+s.scheduled_end+CASE WHEN s.scheduled_end<s.scheduled_start THEN interval '1 day' ELSE interval '0 days' END)
  THEN 'WITHIN_SCHEDULE' ELSE 'OUTSIDE_SCHEDULE' END INTO v_schedule
 FROM public.staff_shifts s WHERE s.organization_id=v_actor.organization_id AND s.staff_id=v_staff.id
  AND s.branch_id=p_branch_id AND s.shift_date BETWEEN v_local::date-1 AND v_local::date
  AND s.status='APPROVED' AND s.scheduled_end IS NOT NULL AND s.scheduled_start IS NOT NULL
  AND (s.shift_date=v_local::date OR s.scheduled_end<s.scheduled_start);
 INSERT INTO public.audit_logs (organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
 VALUES(v_actor.organization_id,v_actor.id,'POS_STAFF_VERIFIED_SELF_START','pos_shift_staff_members',v_member.id,v_old,
  jsonb_build_object('branchId',p_branch_id,'shiftId',v_shift.id,'startedAt',v_now,'schedule',v_schedule));
 IF v_schedule<>'WITHIN_SCHEDULE' THEN
  INSERT INTO public.notifications(organization_id,recipient_id,type,title,message,link,entity_type,entity_id)
  SELECT p.organization_id,p.id,'PENDING_SHIFT','Makluman jadual POS',
   v_staff.full_name||CASE WHEN v_schedule='NO_PUBLISHED_SCHEDULE' THEN ' mula bertugas tanpa jadual diterbitkan.'
    ELSE ' mula bertugas di luar waktu jadual.' END,'/shifts','pos_shift_staff_members',v_member.id
  FROM public.profile_branch_access a JOIN public.profiles p ON p.id=a.profile_id
  WHERE a.branch_id=p_branch_id AND p.organization_id=v_actor.organization_id AND p.role='AREA_MANAGER' AND p.status='ACTIVE';
 END IF;
 RETURN jsonb_build_object('shift',to_jsonb(v_shift),'member',to_jsonb(v_member),'schedule',v_schedule,'reused',false);
END;
$$;
REVOKE ALL ON FUNCTION public.start_verified_pos_staff_shift(uuid,uuid,integer,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_verified_pos_staff_shift(uuid,uuid,integer,uuid,uuid,numeric) TO service_role;
