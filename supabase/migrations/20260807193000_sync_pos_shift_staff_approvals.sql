-- Keep generic approval decisions and the authoritative POS shift membership
-- record in sync. This preserves the AM-or-higher approval boundary while
-- allowing approvals made from the central approval queue to take effect in POS.

CREATE OR REPLACE FUNCTION public.sync_pos_shift_staff_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_approver_role public.user_role;
BEGIN
  IF NEW.entity_type::text <> 'POS_SHIFT_STAFF'
     OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status::text NOT IN ('APPROVED', 'REJECTED')
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = 'APPROVED' THEN
    SELECT p.role
    INTO v_approver_role
    FROM public.profiles AS p
    WHERE p.id = NEW.approved_by
      AND p.organization_id = NEW.organization_id
      AND p.status = 'ACTIVE';

    IF v_approver_role IS NULL
       OR v_approver_role::text NOT IN (
         'SUPER_ADMIN',
         'ADMIN',
         'OPERATION_MANAGER',
         'AREA_MANAGER'
       )
    THEN
      RAISE EXCEPTION 'POS shift staff approval requires an active AM or higher approver';
    END IF;

    UPDATE public.pos_shift_staff_members AS member
    SET status = 'ACTIVE',
        approved_by = NEW.approved_by,
        approved_at = COALESCE(NEW.resolved_at, now()),
        approval_notes = COALESCE(
          member.approval_notes,
          'Diluluskan melalui pusat kelulusan.'
        )
    WHERE member.id = NEW.entity_id
      AND member.organization_id = NEW.organization_id
      AND (NEW.branch_id IS NULL OR member.branch_id = NEW.branch_id)
      AND member.status IN ('PENDING_APPROVAL', 'ACTIVE');
  ELSE
    SELECT p.role
    INTO v_approver_role
    FROM public.profiles AS p
    WHERE p.id = NEW.rejected_by
      AND p.organization_id = NEW.organization_id
      AND p.status = 'ACTIVE';

    IF v_approver_role IS NULL
       OR v_approver_role::text NOT IN (
         'SUPER_ADMIN',
         'ADMIN',
         'OPERATION_MANAGER',
         'AREA_MANAGER'
       )
    THEN
      RAISE EXCEPTION 'POS shift staff rejection requires an active AM or higher approver';
    END IF;

    UPDATE public.pos_shift_staff_members AS member
    SET status = 'REJECTED',
        ended_at = COALESCE(member.ended_at, NEW.resolved_at, now()),
        ended_by = NEW.rejected_by,
        approval_notes = COALESCE(
          NEW.rejection_reason,
          member.approval_notes,
          'Ditolak melalui pusat kelulusan.'
        )
    WHERE member.id = NEW.entity_id
      AND member.organization_id = NEW.organization_id
      AND (NEW.branch_id IS NULL OR member.branch_id = NEW.branch_id)
      AND member.status IN ('PENDING_APPROVAL', 'REJECTED');
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matching POS shift staff membership was not found for approval request %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pos_shift_staff_approval
ON public.approval_requests;

CREATE TRIGGER sync_pos_shift_staff_approval
AFTER UPDATE OF status ON public.approval_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_pos_shift_staff_approval();

REVOKE ALL ON FUNCTION public.sync_pos_shift_staff_approval()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pos_shift_staff_approval()
TO service_role;

-- Repair central approvals that were already resolved while their matching
-- membership remained pending. Only active, explicitly allowed approvers and
-- currently open POS shifts are eligible for this narrowly scoped backfill.
UPDATE public.pos_shift_staff_members AS member
SET status = 'ACTIVE',
    approved_by = request.approved_by,
    approved_at = COALESCE(request.resolved_at, now()),
    approval_notes = COALESCE(
      member.approval_notes,
      'Diselaraskan daripada kelulusan POS sedia ada.'
    )
FROM public.approval_requests AS request
JOIN public.profiles AS approver
  ON approver.id = request.approved_by
 AND approver.organization_id = request.organization_id
 AND approver.status = 'ACTIVE'
JOIN public.pos_shift_staff_members AS approved_member
  ON approved_member.id = request.entity_id
 AND approved_member.organization_id = request.organization_id
JOIN public.pos_shifts AS shift
  ON shift.id = approved_member.shift_id
WHERE request.entity_type::text = 'POS_SHIFT_STAFF'
  AND request.status::text = 'APPROVED'
  AND request.entity_id = member.id
  AND request.organization_id = member.organization_id
  AND (request.branch_id IS NULL OR request.branch_id = member.branch_id)
  AND approved_member.id = member.id
  AND shift.status = 'OPEN'
  AND approver.role::text IN (
    'SUPER_ADMIN',
    'ADMIN',
    'OPERATION_MANAGER',
    'AREA_MANAGER'
  )
  AND member.status = 'PENDING_APPROVAL';
