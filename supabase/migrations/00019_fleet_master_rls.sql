-- RKJ One: RLS read policies for fleet master data
-- Migration 00019

CREATE POLICY vehicles_org_read ON vehicles
 FOR SELECT USING (organization_id = public.organization_id());

CREATE POLICY drivers_org_read ON drivers
 FOR SELECT USING (organization_id = public.organization_id());

CREATE POLICY driver_vehicle_assignments_org_read ON driver_vehicle_assignments
 FOR SELECT USING (organization_id = public.organization_id());
