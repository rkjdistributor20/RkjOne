-- Admin boleh sync is_active lokasi kiosk bila tutup/buka kedai
-- Migration 00037

CREATE POLICY org_admin_inventory_locations_update ON inventory_locations
  FOR UPDATE
  USING (
    organization_id = public.organization_id()
    AND can_admin_settings()
  )
  WITH CHECK (organization_id = public.organization_id());
