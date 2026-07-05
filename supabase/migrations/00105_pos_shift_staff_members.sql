CREATE TABLE IF NOT EXISTS public.pos_shift_staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.pos_shifts(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  role_in_shift text NOT NULL DEFAULT 'JUALAN',
  status text NOT NULL DEFAULT 'ACTIVE',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_shift_staff_members_status_check
    CHECK (status IN ('ACTIVE', 'ENDED')),
  CONSTRAINT pos_shift_staff_members_role_check
    CHECK (role_in_shift IN ('PIC', 'JUALAN', 'PEMBANTU', 'GANTI')),
  CONSTRAINT pos_shift_staff_members_time_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_pos_shift_staff_members_shift
  ON public.pos_shift_staff_members(shift_id, status, started_at);

CREATE INDEX IF NOT EXISTS idx_pos_shift_staff_members_branch
  ON public.pos_shift_staff_members(branch_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_shift_staff_members_profile
  ON public.pos_shift_staff_members(profile_id, started_at DESC)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_shift_staff_members_active_profile
  ON public.pos_shift_staff_members(shift_id, profile_id)
  WHERE status = 'ACTIVE' AND profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_shift_staff_members_active_staff
  ON public.pos_shift_staff_members(shift_id, staff_id)
  WHERE status = 'ACTIVE' AND staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_pos_shift_staff_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_shift_staff_members_updated_at
  ON public.pos_shift_staff_members;

CREATE TRIGGER trg_pos_shift_staff_members_updated_at
BEFORE UPDATE ON public.pos_shift_staff_members
FOR EACH ROW
EXECUTE FUNCTION public.set_pos_shift_staff_members_updated_at();

ALTER TABLE public.pos_shift_staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_shift_staff_members_select" ON public.pos_shift_staff_members;
CREATE POLICY "pos_shift_staff_members_select"
ON public.pos_shift_staff_members
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "pos_shift_staff_members_insert" ON public.pos_shift_staff_members;
CREATE POLICY "pos_shift_staff_members_insert"
ON public.pos_shift_staff_members
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "pos_shift_staff_members_update" ON public.pos_shift_staff_members;
CREATE POLICY "pos_shift_staff_members_update"
ON public.pos_shift_staff_members
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
