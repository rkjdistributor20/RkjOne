-- Preserve only the existing Admin-selected territory for active legacy AMs.
-- After migration the assigned IDs themselves are authoritative, including an
-- empty list. A future branch added to the same region is not a new grant.
SET LOCAL lock_timeout = '5s';

INSERT INTO public.profile_branch_access(profile_id,branch_id)
SELECT p.id,b.id
FROM public.profiles p
JOIN public.branches b ON b.organization_id=p.organization_id
 AND (b.id=p.branch_id OR b.region_id=p.region_id)
WHERE p.role='AREA_MANAGER' AND p.status='ACTIVE'
 AND NOT EXISTS (SELECT 1 FROM public.profile_branch_access x WHERE x.profile_id=p.id)
ON CONFLICT (profile_id,branch_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN public.branches b ON b.id=p_branch_id AND b.organization_id=p.organization_id
  WHERE p.id=auth.uid() AND p.status='ACTIVE'
  AND (
   p.role IN ('SUPER_ADMIN','ADMIN','OPERATION_MANAGER','HR','FINANCE','CEO_FACTORY')
   OR (p.role<>'AREA_MANAGER' AND p.branch_id=b.id)
   OR EXISTS (SELECT 1 FROM public.profile_branch_access a WHERE a.profile_id=p.id AND a.branch_id=b.id)
  )
 );
$$;

-- The legacy tenant-wide branch directory is still useful for other roles.
-- AMs get only their own branch rows; the transfer RPC supplies just the
-- minimum names/IDs for counterparties when a transfer needs them.
CREATE POLICY am_branches_assigned_only ON public.branches AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT public.user_role())<>'AREA_MANAGER' OR public.has_branch_access(id));

-- The prior personnel-manager policies still apply to other roles' grants.
-- These restrictive policies prevent anyone except the tenant Super Admin
-- from editing grants for AMs even through the direct Data API.
CREATE POLICY am_branch_grants_insert_admin_only ON public.profile_branch_access
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (
  (SELECT public.user_role())='SUPER_ADMIN'
  OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.role='AREA_MANAGER')
 );
CREATE POLICY am_branch_grants_delete_admin_only ON public.profile_branch_access
 AS RESTRICTIVE FOR DELETE TO authenticated
 USING (
  (SELECT public.user_role())='SUPER_ADMIN'
  OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.role='AREA_MANAGER')
 );
CREATE POLICY am_branch_grants_update_admin_only ON public.profile_branch_access
 AS RESTRICTIVE FOR UPDATE TO authenticated
 USING ((SELECT public.user_role())='SUPER_ADMIN')
 WITH CHECK ((SELECT public.user_role())='SUPER_ADMIN');

CREATE FUNCTION public.clear_am_grants_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.role IS DISTINCT FROM NEW.role AND (OLD.role='AREA_MANAGER' OR NEW.role='AREA_MANAGER') THEN
  DELETE FROM public.profile_branch_access WHERE profile_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_am_grants_on_role_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clear_am_grants_on_role_change AFTER UPDATE OF role ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.clear_am_grants_on_role_change();

-- Change a complete list atomically. Validate the target and every branch
-- before revoking anything, and preserve the old/new list for audit.
CREATE OR REPLACE FUNCTION public.replace_area_manager_branch_grants(p_profile_id uuid,p_branch_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_admin public.profiles%ROWTYPE; v_am public.profiles%ROWTYPE; v_before uuid[]; v_after uuid[];
BEGIN
 SELECT * INTO v_admin FROM public.profiles WHERE id=auth.uid() AND status='ACTIVE' AND role='SUPER_ADMIN';
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Hanya Pentadbir Utama boleh menetapkan cawangan AM'; END IF;
 SELECT * INTO v_am FROM public.profiles WHERE id=p_profile_id AND organization_id=v_admin.organization_id AND role='AREA_MANAGER' FOR UPDATE;
 IF NOT FOUND OR p_branch_ids IS NULL OR cardinality(p_branch_ids)>100 OR array_position(p_branch_ids,NULL::uuid) IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Akaun AM atau senarai cawangan tidak sah';
 END IF;
 SELECT coalesce(array_agg(DISTINCT assigned.branch_id ORDER BY assigned.branch_id),'{}'::uuid[])
 INTO v_after FROM unnest(p_branch_ids) AS assigned(branch_id);
 IF EXISTS (SELECT 1 FROM unnest(v_after) AS assigned(branch_id) WHERE NOT EXISTS(
  SELECT 1 FROM public.branches b WHERE b.id=assigned.branch_id AND b.organization_id=v_am.organization_id AND b.status='ACTIVE'
 )) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cawangan di luar organisasi atau tidak aktif'; END IF;
 SELECT coalesce(array_agg(branch_id ORDER BY branch_id),'{}'::uuid[]) INTO v_before FROM public.profile_branch_access WHERE profile_id=v_am.id;
 DELETE FROM public.profile_branch_access WHERE profile_id=v_am.id AND NOT (branch_id=ANY(v_after));
 INSERT INTO public.profile_branch_access(profile_id,branch_id)
 SELECT v_am.id,assigned.branch_id FROM unnest(v_after) AS assigned(branch_id) ON CONFLICT (profile_id,branch_id) DO NOTHING;
 IF v_before IS DISTINCT FROM v_after THEN
  INSERT INTO public.audit_logs (organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
  VALUES(v_admin.organization_id,v_admin.id,'AREA_MANAGER_BRANCH_GRANTS_CHANGED','profiles',v_am.id,
    jsonb_build_object('branchIds',v_before),jsonb_build_object('branchIds',v_after));
 END IF;
 RETURN jsonb_build_object('branch_ids',v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_area_manager_branch_grants(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_area_manager_branch_grants(uuid,uuid[]) TO authenticated;
