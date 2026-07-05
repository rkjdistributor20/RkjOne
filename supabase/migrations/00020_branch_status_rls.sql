-- Allow admins and area managers to update branch status (e.g. tutup sementara)
-- Migration 00020

CREATE POLICY org_admin_branches_update ON branches
 FOR UPDATE USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND region_id = (
 SELECT region_id FROM profiles WHERE id = auth.uid()
 )
 )
 )
 )
 WITH CHECK (organization_id = public.organization_id());
