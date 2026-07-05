-- Allow org members to read regions (fixes profile embed / dashboard queries)

CREATE POLICY org_read_regions ON regions
 FOR SELECT USING (organization_id = public.organization_id());
