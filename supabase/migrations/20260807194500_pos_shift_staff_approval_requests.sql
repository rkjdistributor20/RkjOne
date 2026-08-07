-- Permit a staff member to create only their own POS shift approval request.
-- Other approval entity types continue to use their existing RPC boundaries.

DROP POLICY IF EXISTS pos_shift_staff_approval_request_insert
ON public.approval_requests;

CREATE POLICY pos_shift_staff_approval_request_insert
ON public.approval_requests
FOR INSERT
TO authenticated
WITH CHECK (
  entity_type::text = 'POS_SHIFT_STAFF'
  AND requested_by = (SELECT auth.uid())
  AND organization_id = public.organization_id()
  AND branch_id IS NOT NULL
  AND public.has_branch_access(branch_id)
  AND EXISTS (
    SELECT 1
    FROM public.pos_shift_staff_members AS member
    WHERE member.id = approval_requests.entity_id
      AND member.organization_id = approval_requests.organization_id
      AND member.branch_id = approval_requests.branch_id
      AND member.profile_id = (SELECT auth.uid())
      AND member.started_by = (SELECT auth.uid())
      AND member.status = 'PENDING_APPROVAL'
  )
);

-- Recover pending memberships created before the insert policy existed. The
-- request remains PENDING so an AM or higher must still make the real decision.
INSERT INTO public.approval_requests (
  organization_id,
  entity_type,
  entity_id,
  title,
  description,
  status,
  requested_by,
  branch_id,
  metadata
)
SELECT
  member.organization_id,
  'POS_SHIFT_STAFF'::public.approval_entity_type,
  member.id,
  'Kelulusan staf masuk syif POS',
  member.full_name || ' perlu kelulusan AM/ke atas sebelum rekod staf syif POS menjadi rasmi.',
  'PENDING'::public.approval_status,
  member.started_by,
  member.branch_id,
  jsonb_build_object(
    'workflow', 'POS_SHIFT_STAFF_APPROVAL',
    'shift_id', member.shift_id,
    'shift_number', shift.shift_number,
    'staff_id', member.staff_id,
    'profile_id', member.profile_id,
    'role_in_shift', member.role_in_shift,
    'recovered_missing_request', true
  )
FROM public.pos_shift_staff_members AS member
JOIN public.pos_shifts AS shift
  ON shift.id = member.shift_id
 AND shift.organization_id = member.organization_id
 AND shift.branch_id = member.branch_id
JOIN public.profiles AS requester
  ON requester.id = member.started_by
 AND requester.id = member.profile_id
 AND requester.organization_id = member.organization_id
 AND requester.status = 'ACTIVE'
WHERE member.status = 'PENDING_APPROVAL'
  AND shift.status = 'OPEN'
  AND NOT EXISTS (
    SELECT 1
    FROM public.approval_requests AS existing
    WHERE existing.entity_type::text = 'POS_SHIFT_STAFF'
      AND existing.entity_id = member.id
  );
