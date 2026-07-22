-- Keep official POS device audit lookups indexed and avoid overlapping SELECT policies.

CREATE INDEX IF NOT EXISTS idx_pos_devices_enrolled_by
  ON public.pos_devices(enrolled_by)
  WHERE enrolled_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_devices_revoked_by
  ON public.pos_devices(revoked_by)
  WHERE revoked_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_devices_created_by
  ON public.pos_devices(created_by)
  WHERE created_by IS NOT NULL;

DROP POLICY IF EXISTS pos_devices_admin_write ON public.pos_devices;

DROP POLICY IF EXISTS pos_devices_admin_insert ON public.pos_devices;
CREATE POLICY pos_devices_admin_insert ON public.pos_devices
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS pos_devices_admin_update ON public.pos_devices;
CREATE POLICY pos_devices_admin_update ON public.pos_devices
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  )
  WITH CHECK (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS pos_devices_admin_delete ON public.pos_devices;
CREATE POLICY pos_devices_admin_delete ON public.pos_devices
  FOR DELETE TO authenticated
  USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  );
