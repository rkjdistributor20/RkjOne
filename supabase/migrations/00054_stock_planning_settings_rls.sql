-- Benarkan HQ kemaskini tetapan perancangan stok (RLS)

CREATE POLICY org_stock_planning_update ON org_stock_planning_settings
 FOR UPDATE TO authenticated
 USING (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
 )
 WITH CHECK (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 );

CREATE POLICY org_stock_planning_insert ON org_stock_planning_settings
 FOR INSERT TO authenticated
 WITH CHECK (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
 );

GRANT UPDATE, INSERT ON org_stock_planning_settings TO authenticated;
