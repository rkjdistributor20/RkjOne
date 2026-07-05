ALTER TYPE public.approval_entity_type ADD VALUE IF NOT EXISTS 'POS_SHIFT_STAFF';

ALTER TABLE public.pos_shift_staff_members
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text;

ALTER TABLE public.pos_shift_staff_members
  DROP CONSTRAINT IF EXISTS pos_shift_staff_members_status_check;

ALTER TABLE public.pos_shift_staff_members
  ADD CONSTRAINT pos_shift_staff_members_status_check
  CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'ENDED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS idx_pos_shift_staff_members_pending
  ON public.pos_shift_staff_members(branch_id, status, started_at DESC)
  WHERE status = 'PENDING_APPROVAL';
