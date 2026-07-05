-- Staf: Admin HQ + Pengurus Kawasan (kawasan sendiri) boleh urus
-- Migration 00038

CREATE OR REPLACE FUNCTION can_manage_personnel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
 SELECT public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER');
$$;

GRANT EXECUTE ON FUNCTION can_manage_personnel TO authenticated;

CREATE POLICY staff_admin_manage ON staff
 FOR ALL
 USING (
 organization_id = public.organization_id()
 AND can_admin_settings()
 )
 WITH CHECK (organization_id = public.organization_id());

CREATE POLICY staff_am_manage ON staff
 FOR ALL
 USING (
 organization_id = public.organization_id()
 AND public.user_role() = 'AREA_MANAGER'
 AND branch_id IS NOT NULL
 AND public.has_branch_access(branch_id)
 )
 WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() = 'AREA_MANAGER'
 AND branch_id IS NOT NULL
 AND public.has_branch_access(branch_id)
 );

CREATE POLICY profiles_am_staff ON profiles
 FOR ALL
 USING (
 organization_id = public.organization_id()
 AND public.user_role() = 'AREA_MANAGER'
 AND role = 'STAFF'
 AND branch_id IS NOT NULL
 AND public.has_branch_access(branch_id)
 )
 WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() = 'AREA_MANAGER'
 AND role = 'STAFF'
 AND branch_id IS NOT NULL
 AND public.has_branch_access(branch_id)
 );
