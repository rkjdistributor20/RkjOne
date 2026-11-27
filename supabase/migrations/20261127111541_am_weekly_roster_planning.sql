-- Weekly planning only. POS opening/closing and attendance correction are not changed.
CREATE OR REPLACE FUNCTION public.can_manage_roster_branch(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
 SELECT COALESCE(public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER'), false)
  AND public.has_branch_access(p_branch_id);
$$;

CREATE OR REPLACE FUNCTION public.can_access_roster_plan(p_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM weekly_roster_plans p
  WHERE p.id = p_plan_id AND p.organization_id = public.organization_id()
   AND public.can_manage_roster_branch(p.branch_id)
 );
$$;

CREATE OR REPLACE FUNCTION public.is_own_published_roster_entry(p_entry_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM weekly_roster_entries e
  JOIN weekly_roster_plans p ON p.id = e.plan_id
  JOIN staff s ON s.id = e.staff_id AND s.organization_id = p.organization_id
  WHERE e.id = p_entry_id AND p.status = 'PUBLISHED'
   AND p.organization_id = public.organization_id() AND s.profile_id = auth.uid()
 );
$$;

CREATE OR REPLACE FUNCTION public.is_own_published_roster_plan(p_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM weekly_roster_entries e
  JOIN weekly_roster_plans p ON p.id = e.plan_id
  JOIN staff s ON s.id = e.staff_id AND s.organization_id = p.organization_id
  WHERE p.id = p_plan_id AND p.status = 'PUBLISHED'
   AND p.organization_id = public.organization_id() AND s.profile_id = auth.uid()
 );
$$;

DROP POLICY IF EXISTS roster_plans_read ON public.weekly_roster_plans;
DROP POLICY IF EXISTS roster_plans_branch_insert ON public.weekly_roster_plans;
DROP POLICY IF EXISTS roster_plans_branch_update ON public.weekly_roster_plans;
DROP POLICY IF EXISTS roster_plans_branch_delete ON public.weekly_roster_plans;
CREATE POLICY roster_plans_read ON public.weekly_roster_plans FOR SELECT TO authenticated
 USING (organization_id = (SELECT public.organization_id()) AND
  (public.can_manage_roster_branch(branch_id) OR public.is_own_published_roster_plan(id)));

DROP POLICY IF EXISTS roster_entries_read ON public.weekly_roster_entries;
DROP POLICY IF EXISTS roster_entries_manager_insert ON public.weekly_roster_entries;
DROP POLICY IF EXISTS roster_entries_manager_update ON public.weekly_roster_entries;
DROP POLICY IF EXISTS roster_entries_manager_delete ON public.weekly_roster_entries;
CREATE POLICY roster_entries_read ON public.weekly_roster_entries FOR SELECT TO authenticated
 USING (public.can_access_roster_plan(plan_id) OR public.is_own_published_roster_entry(id));

-- Resolve template defaults once on save/publish. A finish earlier than the
-- start means next MYT day. Equal times are ambiguous and are rejected.
CREATE FUNCTION public.roster_slot_times(p_org uuid, p_template uuid, p_start time, p_end time)
RETURNS TABLE (start_time time, end_time time)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
 IF p_template IS NOT NULL THEN
  SELECT COALESCE(p_start, t.start_time), COALESCE(p_end, t.end_time)
  INTO p_start, p_end
  FROM shift_templates t WHERE t.id = p_template AND t.organization_id = p_org;
  IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Template di luar organisasi anda';
  END IF;
 END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start = p_end
    OR p_start >= time '24:00' OR p_end >= time '24:00' THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Isi masa mula dan tamat yang berbeza untuk setiap syif';
 END IF;
 RETURN QUERY SELECT p_start, p_end;
END;
$$;

-- Keep the existing staff_shifts projection for payroll/legacy consumers.
-- Never update or delete a projection already used by attendance.
CREATE FUNCTION public.sync_roster_slot(
 p_plan weekly_roster_plans, p_staff uuid, p_day smallint, p_off boolean,
 p_template uuid, p_start time, p_end time
)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
 v_shift staff_shifts%ROWTYPE;
 v_date date := p_plan.week_start_date + p_day;
 v_tag text := 'roster:' || p_plan.id;
 v_hours numeric := round((extract(epoch FROM (p_end - p_start)) +
  CASE WHEN p_end < p_start THEN 86400 ELSE 0 END) / 3600, 2);
 v_template_hours numeric;
BEGIN
 IF p_template IS NOT NULL THEN
  SELECT default_hours INTO v_template_hours FROM shift_templates
  WHERE id = p_template AND organization_id = p_plan.organization_id
   AND start_time = p_start AND end_time = p_end;
  v_hours := COALESCE(v_template_hours, v_hours);
 END IF;
 SELECT * INTO v_shift FROM staff_shifts sh
 WHERE sh.organization_id = p_plan.organization_id AND sh.branch_id = p_plan.branch_id
  AND sh.staff_id = p_staff AND sh.shift_date = v_date AND sh.notes = v_tag
 ORDER BY sh.id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF NOT p_off AND (v_shift.template_id, v_shift.scheduled_start, v_shift.scheduled_end)
    IS NOT DISTINCT FROM (p_template, p_start, p_end) THEN
   RETURN;
  END IF;
  IF v_shift.actual_start IS NOT NULL OR v_shift.actual_end IS NOT NULL
     OR v_shift.actual_hours IS NOT NULL OR v_shift.ot_hours <> 0
     OR EXISTS (SELECT 1 FROM attendance_records WHERE staff_shift_id = v_shift.id) THEN
   RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Slot ini sudah digunakan dalam rekod kehadiran dan tidak boleh diubah';
  END IF;
  IF p_off THEN
   DELETE FROM staff_shifts WHERE id = v_shift.id;
  ELSE
   UPDATE staff_shifts SET template_id = p_template, scheduled_start = p_start,
    scheduled_end = p_end, scheduled_hours = v_hours WHERE id = v_shift.id;
  END IF;
 ELSIF NOT p_off THEN
  INSERT INTO staff_shifts (organization_id, staff_id, branch_id, template_id, shift_date,
   scheduled_start, scheduled_end, scheduled_hours, notes, created_by, status)
  VALUES (p_plan.organization_id, p_staff, p_plan.branch_id, p_template, v_date,
   p_start, p_end, v_hours, v_tag, auth.uid(), 'APPROVED');
 END IF;
END;
$$;

CREATE FUNCTION public.save_weekly_roster(
 p_branch_id uuid, p_week_start date, p_entries jsonb DEFAULT '[]', p_copy_from_week date DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
 v_org uuid := public.organization_id();
 v_plan weekly_roster_plans%ROWTYPE;
 v_source_id uuid;
 v_entry record;
 v_start time;
 v_end time;
BEGIN
 IF NOT public.can_manage_roster_branch(p_branch_id) THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Cawangan di luar kawasan anda';
 END IF;
 IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1
    OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Pilih tarikh Isnin dan slot jadual yang sah';
 END IF;
 IF p_copy_from_week IS NOT NULL AND (p_copy_from_week = p_week_start
    OR extract(isodow FROM p_copy_from_week) <> 1 OR jsonb_array_length(p_entries) <> 0) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Pilih minggu sumber lain untuk disalin';
 END IF;

 INSERT INTO weekly_roster_plans (organization_id, branch_id, week_start_date, created_by)
 VALUES (v_org, p_branch_id, p_week_start, auth.uid())
 ON CONFLICT (organization_id, branch_id, week_start_date) DO NOTHING;

 SELECT * INTO STRICT v_plan FROM weekly_roster_plans p
 WHERE p.organization_id = v_org AND p.branch_id = p_branch_id AND p.week_start_date = p_week_start
 FOR UPDATE;

 IF p_copy_from_week IS NOT NULL THEN
  IF v_plan.status = 'PUBLISHED' OR EXISTS (SELECT 1 FROM weekly_roster_entries WHERE plan_id = v_plan.id) THEN
   RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Salinan hanya boleh dibuat ke jadual kosong';
  END IF;
  SELECT p.id INTO v_source_id FROM weekly_roster_plans p
  WHERE p.organization_id = v_org AND p.branch_id = p_branch_id AND p.week_start_date = p_copy_from_week;
  SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]') INTO p_entries
  FROM weekly_roster_entries e JOIN staff s ON s.id = e.staff_id
  LEFT JOIN shift_templates t ON t.id = e.template_id AND t.organization_id = v_org
  WHERE e.plan_id = v_source_id AND s.organization_id = v_org
   AND s.branch_id = p_branch_id AND s.status = 'ACTIVE'
   -- Legacy plans may have a work slot without a template or two times.
   -- Copy only usable slots; an incomplete slot stays unplanned, not off.
   AND (e.is_off OR (
    (e.template_id IS NULL OR t.id IS NOT NULL)
    AND COALESCE(e.scheduled_start, t.start_time) < time '24:00'
    AND COALESCE(e.scheduled_end, t.end_time) < time '24:00'
    AND COALESCE(e.scheduled_start, t.start_time) <> COALESCE(e.scheduled_end, t.end_time)
   ));
  IF jsonb_array_length(p_entries) = 0 THEN
   RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Tiada slot lengkap untuk staf aktif dalam minggu sumber';
  END IF;
 END IF;

 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(p_entries) AS e(staff_id uuid, day_index smallint)
  GROUP BY e.staff_id, e.day_index HAVING count(*) > 1
 ) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Slot staf dan hari berulang';
 END IF;

 FOR v_entry IN SELECT * FROM jsonb_to_recordset(p_entries) AS e(
  staff_id uuid, day_index smallint, is_off boolean, template_id uuid,
  scheduled_start time, scheduled_end time, notes text
 ) LOOP
  IF v_entry.day_index IS NULL OR v_entry.day_index NOT BETWEEN 0 AND 6 OR v_entry.is_off IS NULL THEN
   RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Slot jadual tidak sah';
  END IF;
  PERFORM 1 FROM staff s WHERE s.id = v_entry.staff_id AND s.organization_id = v_org
   AND s.branch_id = p_branch_id AND s.status = 'ACTIVE' FOR SHARE;
  IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Staf mesti aktif dan ditetapkan ke cawangan ini';
  END IF;
  IF v_entry.is_off THEN
   v_entry.template_id := NULL;
   v_start := NULL;
   v_end := NULL;
  ELSE
   SELECT t.start_time, t.end_time INTO v_start, v_end
   FROM public.roster_slot_times(v_org, v_entry.template_id, v_entry.scheduled_start, v_entry.scheduled_end) t;
  END IF;

  IF v_plan.status = 'PUBLISHED' THEN
   PERFORM public.sync_roster_slot(v_plan, v_entry.staff_id, v_entry.day_index,
    v_entry.is_off, v_entry.template_id, v_start, v_end);
  END IF;
  INSERT INTO weekly_roster_entries (plan_id, staff_id, day_index, is_off, template_id, scheduled_start, scheduled_end, notes)
  VALUES (v_plan.id, v_entry.staff_id, v_entry.day_index, v_entry.is_off, v_entry.template_id, v_start, v_end, v_entry.notes)
  ON CONFLICT (plan_id, staff_id, day_index) DO UPDATE
   SET is_off = excluded.is_off, template_id = excluded.template_id,
    scheduled_start = excluded.scheduled_start, scheduled_end = excluded.scheduled_end,
    notes = excluded.notes, updated_at = now();
 END LOOP;
 UPDATE weekly_roster_plans SET updated_at = now() WHERE id = v_plan.id;
 RETURN v_plan.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_weekly_roster(p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
 v_plan weekly_roster_plans%ROWTYPE;
 v_entry weekly_roster_entries%ROWTYPE;
 v_count integer := 0;
 v_start time;
 v_end time;
BEGIN
 IF NOT public.can_access_roster_plan(p_plan_id) THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Jadual di luar kawasan anda';
 END IF;
 SELECT * INTO STRICT v_plan FROM weekly_roster_plans WHERE id = p_plan_id FOR UPDATE;
 IF v_plan.status = 'PUBLISHED' THEN
  RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Jadual sudah diterbitkan';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM weekly_roster_entries WHERE plan_id = v_plan.id) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Isi sekurang-kurangnya satu slot sebelum terbitkan';
 END IF;
 FOR v_entry IN SELECT * FROM weekly_roster_entries WHERE plan_id = v_plan.id LOOP
  -- Staff may have moved since draft creation. Drop those obsolete draft slots.
  PERFORM 1 FROM staff s WHERE s.id = v_entry.staff_id AND s.organization_id = v_plan.organization_id
   AND s.branch_id = v_plan.branch_id AND s.status = 'ACTIVE' FOR SHARE;
  IF NOT FOUND THEN
   DELETE FROM weekly_roster_entries WHERE id = v_entry.id;
   CONTINUE;
  END IF;
  IF NOT v_entry.is_off THEN
   SELECT t.start_time, t.end_time INTO v_start, v_end
   FROM public.roster_slot_times(v_plan.organization_id, v_entry.template_id, v_entry.scheduled_start, v_entry.scheduled_end) t;
   UPDATE weekly_roster_entries SET scheduled_start = v_start, scheduled_end = v_end WHERE id = v_entry.id;
   PERFORM public.sync_roster_slot(v_plan, v_entry.staff_id, v_entry.day_index,
    false, v_entry.template_id, v_start, v_end);
   v_count := v_count + 1;
  END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM weekly_roster_entries WHERE plan_id = v_plan.id) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tiada slot untuk staf aktif di cawangan ini';
 END IF;
 UPDATE weekly_roster_plans SET status = 'PUBLISHED', published_at = now(),
  published_by = auth.uid(), updated_at = now() WHERE id = v_plan.id;
 RETURN jsonb_build_object('published', true, 'shifts_created', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_roster_branch(uuid), public.can_access_roster_plan(uuid),
 public.is_own_published_roster_entry(uuid), public.is_own_published_roster_plan(uuid),
 public.save_weekly_roster(uuid, date, jsonb, date), public.publish_weekly_roster(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_roster_branch(uuid), public.can_access_roster_plan(uuid),
 public.is_own_published_roster_entry(uuid), public.is_own_published_roster_plan(uuid),
 public.save_weekly_roster(uuid, date, jsonb, date), public.publish_weekly_roster(uuid)
 TO authenticated;
REVOKE ALL ON FUNCTION public.roster_slot_times(uuid, uuid, time, time),
 public.sync_roster_slot(weekly_roster_plans, uuid, smallint, boolean, uuid, time, time)
 FROM PUBLIC, anon, authenticated;
