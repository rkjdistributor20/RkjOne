-- Keep official POS tablet mutations behind authenticated server APIs.
-- The application uses the service-role client after checking the user's role
-- and organization, so browser clients only need scoped read access.

DROP POLICY IF EXISTS pos_devices_admin_insert ON public.pos_devices;
DROP POLICY IF EXISTS pos_devices_admin_update ON public.pos_devices;
DROP POLICY IF EXISTS pos_devices_admin_delete ON public.pos_devices;
DROP POLICY IF EXISTS pos_devices_admin_write ON public.pos_devices;

REVOKE ALL ON TABLE public.pos_devices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.pos_devices FROM authenticated;
GRANT SELECT ON TABLE public.pos_devices TO authenticated;

ALTER TABLE public.pos_devices
  DROP CONSTRAINT IF EXISTS pos_devices_organization_id_fkey,
  ADD CONSTRAINT pos_devices_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS pos_devices_branch_id_fkey,
  ADD CONSTRAINT pos_devices_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pos_devices_serial_number_format
    CHECK (serial_number IS NULL OR length(btrim(serial_number)) BETWEEN 5 AND 64),
  ADD CONSTRAINT pos_devices_imei_format
    CHECK (imei IS NULL OR imei ~ '^[0-9]{15}$'),
  ADD CONSTRAINT pos_devices_warranty_dates
    CHECK (
      purchase_date IS NULL
      OR warranty_expires_at IS NULL
      OR warranty_expires_at >= purchase_date
    ),
  ADD CONSTRAINT pos_devices_asset_verification_pair
    CHECK ((asset_verified_at IS NULL) = (asset_verified_by IS NULL));

DROP INDEX IF EXISTS public.idx_pos_devices_one_active_per_branch;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_devices_one_current_per_branch
  ON public.pos_devices(branch_id)
  WHERE status IN ('PENDING', 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_pos_devices_asset_verified_by
  ON public.pos_devices(asset_verified_by)
  WHERE asset_verified_by IS NOT NULL;

COMMENT ON TABLE public.pos_devices IS
  'Audited official branch POS tablets. Browser clients have scoped read-only access; mutations use authenticated server APIs.';
