-- Branch-bound official POS devices and one-time enrollment.

CREATE TABLE IF NOT EXISTS public.pos_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_code TEXT NOT NULL,
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  secret_hash TEXT,
  enrollment_code_hash TEXT,
  enrollment_expires_at TIMESTAMPTZ,
  enrollment_used_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ,
  enrolled_by UUID REFERENCES public.profiles(id),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, device_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_devices_one_active_per_branch
  ON public.pos_devices(branch_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_pos_devices_org_branch
  ON public.pos_devices(organization_id, branch_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_devices_enrollment_hash
  ON public.pos_devices(enrollment_code_hash)
  WHERE status = 'PENDING';

ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_devices_admin_select ON public.pos_devices;
CREATE POLICY pos_devices_admin_select ON public.pos_devices
  FOR SELECT TO authenticated
  USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS pos_devices_admin_write ON public.pos_devices;
CREATE POLICY pos_devices_admin_write ON public.pos_devices
  FOR ALL TO authenticated
  USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  )
  WITH CHECK (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN')
  );

COMMENT ON TABLE public.pos_devices IS
  'Official branch POS tablets. Secrets and one-time enrollment codes are stored as SHA-256 hashes only.';
