-- RKJ One: Shift management RPC functions
-- Migration 00014

CREATE OR REPLACE FUNCTION create_staff_shift(
  p_staff_id UUID,
  p_branch_id UUID,
  p_shift_date DATE,
  p_template_id UUID DEFAULT NULL,
  p_scheduled_start TIME DEFAULT NULL,
  p_scheduled_end TIME DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_template RECORD;
  v_shift_id UUID;
  v_hours NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF NOT public.has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  SELECT organization_id INTO v_org_id FROM branches WHERE id = p_branch_id;

  IF p_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM shift_templates WHERE id = p_template_id;
    p_scheduled_start := COALESCE(p_scheduled_start, v_template.start_time);
    p_scheduled_end := COALESCE(p_scheduled_end, v_template.end_time);
    v_hours := v_template.default_hours;
  END IF;

  INSERT INTO staff_shifts (
    organization_id, staff_id, branch_id, template_id, shift_date,
    scheduled_start, scheduled_end, scheduled_hours, notes, created_by, status
  ) VALUES (
    v_org_id, p_staff_id, p_branch_id, p_template_id, p_shift_date,
    p_scheduled_start, p_scheduled_end, v_hours, p_notes, v_user_id, 'PENDING'
  ) RETURNING id INTO v_shift_id;

  INSERT INTO approval_requests (
    organization_id, entity_type, entity_id, title, status, requested_by, branch_id
  ) VALUES (
    v_org_id, 'SHIFT', v_shift_id,
    'Shift Request ' || p_shift_date::text, 'PENDING', v_user_id, p_branch_id
  );

  RETURN jsonb_build_object('shift_id', v_shift_id);
END;
$$;

CREATE OR REPLACE FUNCTION approve_staff_shift(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE staff_shifts SET
    status = 'APPROVED', approved_by = v_user_id, approved_at = now(), updated_at = now()
  WHERE id = p_shift_id;

  UPDATE approval_requests SET status = 'APPROVED', approved_by = v_user_id, resolved_at = now()
  WHERE entity_type = 'SHIFT' AND entity_id = p_shift_id;

  RETURN jsonb_build_object('shift_id', p_shift_id, 'status', 'APPROVED');
END;
$$;

CREATE OR REPLACE FUNCTION clock_in_staff(p_staff_id UUID, p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_attendance_id UUID;
  v_shift_id UUID;
BEGIN
  v_user_id := auth.uid();
  SELECT organization_id INTO v_org_id FROM branches WHERE id = p_branch_id;

  SELECT id INTO v_shift_id FROM staff_shifts
  WHERE staff_id = p_staff_id AND branch_id = p_branch_id
    AND shift_date = CURRENT_DATE AND status = 'APPROVED'
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO attendance_records (
    organization_id, staff_id, staff_shift_id, branch_id, attendance_date, clock_in
  ) VALUES (
    v_org_id, p_staff_id, v_shift_id, p_branch_id, CURRENT_DATE, now()
  )
  ON CONFLICT (staff_id, attendance_date)
  DO UPDATE SET clock_in = now(), updated_at = now()
  RETURNING id INTO v_attendance_id;

  UPDATE staff_shifts SET actual_start = now() WHERE id = v_shift_id;

  RETURN jsonb_build_object('attendance_id', v_attendance_id, 'clock_in', now());
END;
$$;

CREATE OR REPLACE FUNCTION clock_out_staff(p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att RECORD;
  v_hours NUMERIC;
  v_scheduled NUMERIC;
  v_ot NUMERIC;
BEGIN
  SELECT * INTO v_att FROM attendance_records
  WHERE staff_id = p_staff_id AND attendance_date = CURRENT_DATE AND clock_out IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'No active clock-in found'; END IF;

  v_hours := EXTRACT(EPOCH FROM (now() - v_att.clock_in)) / 3600.0;

  SELECT scheduled_hours INTO v_scheduled FROM staff_shifts WHERE id = v_att.staff_shift_id;
  v_ot := GREATEST(v_hours - COALESCE(v_scheduled, 8), 0);

  UPDATE attendance_records SET
    clock_out = now(),
    hours_worked = ROUND(v_hours::numeric, 2),
    ot_hours = ROUND(v_ot::numeric, 2),
    updated_at = now()
  WHERE id = v_att.id;

  UPDATE staff_shifts SET
    actual_end = now(),
    actual_hours = ROUND(v_hours::numeric, 2),
    ot_hours = ROUND(v_ot::numeric, 2),
    updated_at = now()
  WHERE id = v_att.staff_shift_id;

  RETURN jsonb_build_object(
    'hours_worked', ROUND(v_hours::numeric, 2),
    'ot_hours', ROUND(v_ot::numeric, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_staff_shift TO authenticated;
GRANT EXECUTE ON FUNCTION approve_staff_shift TO authenticated;
GRANT EXECUTE ON FUNCTION clock_in_staff TO authenticated;
GRANT EXECUTE ON FUNCTION clock_out_staff TO authenticated;

-- Shift RLS
CREATE POLICY staff_shifts_branch ON staff_shifts
  FOR ALL USING (
    organization_id = public.organization_id()
    AND public.has_branch_access(branch_id)
  );

CREATE POLICY attendance_branch ON attendance_records
  FOR ALL USING (
    organization_id = public.organization_id()
    AND public.has_branch_access(branch_id)
  );

CREATE POLICY shift_templates_org ON shift_templates
  FOR SELECT USING (organization_id = public.organization_id());

CREATE POLICY staff_org_read ON staff
  FOR SELECT USING (organization_id = public.organization_id());

ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
