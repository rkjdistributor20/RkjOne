-- Layer overlap and auditing onto the deployed weekly planner. Keep the same RPC
-- names and signatures, and do not re-run or edit the original migration.
ALTER FUNCTION public.save_weekly_roster(uuid, date, jsonb, date) SET SCHEMA private_rkj;
ALTER FUNCTION public.publish_weekly_roster(uuid) SET SCHEMA private_rkj;
REVOKE ALL ON FUNCTION private_rkj.save_weekly_roster(uuid, date, jsonb, date),
 private_rkj.publish_weekly_roster(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- An attendance-linked row is a historical projection, not the editable plan.
-- Keep even its scheduled hours: clock-out can use them to calculate overtime.
CREATE OR REPLACE FUNCTION public.sync_roster_slot(
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
   RETURN; -- still save the plan; preserve the complete historical projection
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

-- Read current planning, not stale attendance projections. Preserve approved
-- standalone shifts and fall back to snapshotted projection times for old
-- published entries whose times were only stored on the projection.
CREATE VIEW public.roster_planned_shifts WITH (security_invoker = true) AS
 SELECT e.id, p.id AS plan_id, p.organization_id, p.branch_id, e.staff_id,
  p.week_start_date + e.day_index AS shift_date, p.status,
  COALESCE(e.scheduled_start, legacy.scheduled_start, t.start_time) AS scheduled_start,
  COALESCE(e.scheduled_end, legacy.scheduled_end, t.end_time) AS scheduled_end
 FROM public.weekly_roster_entries e
 JOIN public.weekly_roster_plans p ON p.id = e.plan_id
 LEFT JOIN public.shift_templates t ON t.id = e.template_id AND t.organization_id = p.organization_id
 LEFT JOIN LATERAL (
  SELECT sh.scheduled_start, sh.scheduled_end
  FROM public.staff_shifts sh
  WHERE p.status = 'PUBLISHED' AND (e.scheduled_start IS NULL OR e.scheduled_end IS NULL)
   AND sh.organization_id = p.organization_id AND sh.branch_id = p.branch_id
   AND sh.staff_id = e.staff_id AND sh.shift_date = p.week_start_date + e.day_index
   AND sh.notes = 'roster:' || p.id
  ORDER BY sh.id LIMIT 1
 ) legacy ON true
 WHERE NOT e.is_off
 UNION ALL
 SELECT sh.id, NULL::uuid, sh.organization_id, sh.branch_id, sh.staff_id, sh.shift_date,
  'PUBLISHED'::public.weekly_roster_status, sh.scheduled_start, sh.scheduled_end
 FROM public.staff_shifts sh
 WHERE sh.status = 'APPROVED' AND NOT EXISTS (
  SELECT 1 FROM public.weekly_roster_plans p
  WHERE p.organization_id = sh.organization_id AND p.branch_id = sh.branch_id
   AND sh.shift_date BETWEEN p.week_start_date AND p.week_start_date + 6
   AND sh.notes = 'roster:' || p.id
 );
REVOKE ALL ON public.roster_planned_shifts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.roster_planned_shifts TO authenticated;

-- Local calendar timestamps share the MYT clock. Half-open windows allow the
-- next slot to start exactly at the previous slot's end, including on Monday.
CREATE FUNCTION private_rkj.roster_slot_span(p_day date, p_start time, p_end time)
RETURNS tsrange LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
 SELECT CASE WHEN p_start <> p_end AND p_start < time '24:00' AND p_end < time '24:00'
  THEN tsrange(p_day + p_start, p_day + p_end + CASE WHEN p_end < p_start
     THEN interval '1 day' ELSE interval '0 day' END, '[)') END;
$$;

CREATE FUNCTION private_rkj.assert_weekly_roster_no_overlap(p_plan_id uuid, p_entries jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
 v_staff_name text;
 v_date date;
BEGIN
 -- Compare final state, not intermediate states of a multi-slot edit. Check
 -- drafts in this branch too; drafts from an old branch cannot be published
 -- after the staff member moves, but existing published assignments still count.
 SELECT staff.full_name, candidate.shift_date INTO v_staff_name, v_date
 FROM public.roster_planned_shifts candidate
 JOIN public.staff ON staff.id = candidate.staff_id AND staff.organization_id = candidate.organization_id
 WHERE candidate.plan_id = p_plan_id
  AND (p_entries IS NULL OR EXISTS (
   SELECT 1 FROM jsonb_to_recordset(p_entries) AS e(staff_id uuid, day_index smallint)
   JOIN public.weekly_roster_plans p ON p.id = p_plan_id
   WHERE e.staff_id = candidate.staff_id AND p.week_start_date + e.day_index = candidate.shift_date
  ))
  AND EXISTS (
   SELECT 1 FROM public.roster_planned_shifts other
   WHERE other.organization_id = candidate.organization_id AND other.staff_id = candidate.staff_id
    AND (other.plan_id, other.id) IS DISTINCT FROM (candidate.plan_id, candidate.id)
    AND (other.status = 'PUBLISHED' OR other.branch_id = candidate.branch_id)
    AND other.shift_date BETWEEN candidate.shift_date - 1 AND candidate.shift_date + 1
    AND private_rkj.roster_slot_span(other.shift_date, other.scheduled_start, other.scheduled_end)
     && private_rkj.roster_slot_span(candidate.shift_date, candidate.scheduled_start, candidate.scheduled_end)
  )
 ORDER BY candidate.shift_date, candidate.staff_id
 LIMIT 1;
 IF FOUND THEN
  -- Identify only the proposed slot, never the other branch or its schedule.
  RAISE EXCEPTION USING ERRCODE = '23505',
   MESSAGE = format('Jadual staf bertindih: %s (%s, MYT)', v_staff_name, to_char(v_date, 'YYYY-MM-DD'));
 END IF;
END;
$$;

CREATE FUNCTION private_rkj.lock_weekly_roster(p_org uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 -- Serialize saves/copies/publishes across branch and week boundaries. The
 -- overlap query must take a fresh snapshot after waiting for a prior writer.
 IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
  RAISE EXCEPTION USING ERRCODE = '25000', MESSAGE = 'Jadual mingguan memerlukan transaksi READ COMMITTED';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rkj-weekly-roster:' || p_org, 0));
END;
$$;

CREATE FUNCTION private_rkj.log_weekly_roster_entry_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
 v_plan public.weekly_roster_plans%ROWTYPE;
 v_context jsonb;
 v_old jsonb;
 v_new jsonb;
BEGIN
 IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - ARRAY['created_at', 'updated_at']; END IF;
 IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - ARRAY['created_at', 'updated_at']; END IF;
 IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NULL; END IF;
 SELECT * INTO v_plan FROM public.weekly_roster_plans WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_context := jsonb_build_object('branch_id', v_plan.branch_id, 'week_start_date', v_plan.week_start_date);
 INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, old_values, new_values)
 VALUES (v_plan.organization_id, auth.uid(), 'ROSTER_SLOT_' || TG_OP, 'weekly_roster_entry',
  COALESCE(NEW.id, OLD.id), v_context || v_old, v_context || v_new);
 RETURN NULL;
END;
$$;

CREATE TRIGGER audit_weekly_roster_entry_change
 AFTER INSERT OR UPDATE OR DELETE ON public.weekly_roster_entries
 FOR EACH ROW EXECUTE FUNCTION private_rkj.log_weekly_roster_entry_change();

CREATE FUNCTION public.save_weekly_roster(
 p_branch_id uuid, p_week_start date, p_entries jsonb DEFAULT '[]', p_copy_from_week date DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
 v_plan_id uuid;
BEGIN
 IF NOT public.can_manage_roster_branch(p_branch_id) THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Cawangan di luar kawasan anda';
 END IF;
 PERFORM private_rkj.lock_weekly_roster(public.organization_id());
 v_plan_id := private_rkj.save_weekly_roster(p_branch_id, p_week_start, p_entries, p_copy_from_week);
 PERFORM private_rkj.assert_weekly_roster_no_overlap(
  v_plan_id, CASE WHEN p_copy_from_week IS NULL THEN p_entries ELSE NULL END);
 RETURN v_plan_id;
END;
$$;

CREATE FUNCTION public.publish_weekly_roster(p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
 v_plan public.weekly_roster_plans%ROWTYPE;
 v_before jsonb;
 v_result jsonb;
BEGIN
 IF NOT public.can_access_roster_plan(p_plan_id) THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Jadual di luar kawasan anda';
 END IF;
 PERFORM private_rkj.lock_weekly_roster(public.organization_id());
 SELECT to_jsonb(p) INTO v_before FROM public.weekly_roster_plans p WHERE p.id = p_plan_id;
 v_result := private_rkj.publish_weekly_roster(p_plan_id);
 PERFORM private_rkj.assert_weekly_roster_no_overlap(p_plan_id, NULL);
 SELECT * INTO STRICT v_plan FROM public.weekly_roster_plans WHERE id = p_plan_id;
 INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, old_values, new_values)
 VALUES (v_plan.organization_id, auth.uid(), 'ROSTER_PUBLISH', 'weekly_roster_plan', p_plan_id, v_before, to_jsonb(v_plan));
 RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private_rkj.roster_slot_span(date, time, time),
 private_rkj.lock_weekly_roster(uuid), private_rkj.assert_weekly_roster_no_overlap(uuid, jsonb),
 private_rkj.log_weekly_roster_entry_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_weekly_roster(uuid, date, jsonb, date), public.publish_weekly_roster(uuid)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_weekly_roster(uuid, date, jsonb, date), public.publish_weekly_roster(uuid)
 TO authenticated;

-- AM planning has one write path. Keep legacy requests available to existing
-- non-AM workflows, and recheck existing requests against the roster on approval.
ALTER FUNCTION public.create_staff_shift(uuid, uuid, date, uuid, time, time, text) SET SCHEMA private_rkj;
REVOKE ALL ON FUNCTION private_rkj.create_staff_shift(uuid, uuid, date, uuid, time, time, text)
 FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_staff_shift(
 p_staff_id uuid, p_branch_id uuid, p_shift_date date, p_template_id uuid DEFAULT NULL,
 p_scheduled_start time DEFAULT NULL, p_scheduled_end time DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF public.user_role() IS NULL OR public.user_role() = 'AREA_MANAGER' THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Gunakan Jadual Mingguan untuk menjadualkan staf.';
 END IF;
 RETURN private_rkj.create_staff_shift(p_staff_id, p_branch_id, p_shift_date, p_template_id,
  p_scheduled_start, p_scheduled_end, p_notes);
END;
$$;
REVOKE ALL ON FUNCTION public.create_staff_shift(uuid, uuid, date, uuid, time, time, text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_shift(uuid, uuid, date, uuid, time, time, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_staff_shift(p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
 v_user uuid := auth.uid();
 v_role text := public.user_role()::text;
 v_org uuid := public.organization_id();
 v_shift public.staff_shifts%ROWTYPE;
 v_span tsrange;
BEGIN
 IF v_user IS NULL OR v_role IS NULL OR v_role NOT IN ('SUPER_ADMIN','ADMIN','OPERATION_MANAGER','AREA_MANAGER') THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada kebenaran meluluskan syif.';
 END IF;
 IF v_role = 'AREA_MANAGER' THEN
  PERFORM private_rkj.lock_weekly_roster(v_org);
  SELECT sh.* INTO v_shift FROM public.staff_shifts sh
  JOIN public.staff st ON st.id = sh.staff_id AND st.organization_id = sh.organization_id
   AND st.branch_id = sh.branch_id AND st.status = 'ACTIVE'
  WHERE sh.id = p_shift_id AND sh.organization_id = v_org AND sh.status = 'PENDING'
   AND public.can_manage_roster_branch(sh.branch_id)
  FOR UPDATE OF sh;
  IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permohonan syif tidak boleh diluluskan dalam skop anda.';
  END IF;
  v_span := private_rkj.roster_slot_span(v_shift.shift_date, v_shift.scheduled_start, v_shift.scheduled_end);
  IF v_span IS NULL THEN
   RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Masa syif tidak lengkap. Gunakan Jadual Mingguan.';
  END IF;
  IF EXISTS (
   SELECT 1 FROM public.roster_planned_shifts other
   WHERE other.organization_id = v_org AND other.staff_id = v_shift.staff_id
    AND (other.status = 'PUBLISHED' OR other.branch_id = v_shift.branch_id)
    AND other.shift_date BETWEEN v_shift.shift_date - 1 AND v_shift.shift_date + 1
    AND private_rkj.roster_slot_span(other.shift_date, other.scheduled_start, other.scheduled_end) && v_span
  ) THEN
   RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Jadual staf bertindih. Semak Jadual Mingguan.';
  END IF;
 END IF;
 UPDATE public.staff_shifts SET status = 'APPROVED', approved_by = v_user, approved_at = now(), updated_at = now()
 WHERE id = p_shift_id;
 UPDATE public.approval_requests SET status = 'APPROVED', approved_by = v_user, resolved_at = now()
 WHERE entity_type = 'SHIFT' AND entity_id = p_shift_id
  AND (v_role <> 'AREA_MANAGER' OR (organization_id = v_org AND branch_id = v_shift.branch_id AND status = 'PENDING'));
 RETURN jsonb_build_object('shift_id', p_shift_id, 'status', 'APPROVED');
END;
$$;

-- An old generic approval RPC can reject by entity ID; check the actual shift
-- row there too, and audit AM decisions independently of the request projection.
CREATE FUNCTION private_rkj.guard_am_legacy_shift_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF public.user_role() = 'AREA_MANAGER' THEN
  IF OLD.status <> 'PENDING' OR OLD.organization_id IS DISTINCT FROM public.organization_id()
     OR NOT public.can_manage_roster_branch(OLD.branch_id) THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Perubahan permohonan syif di luar skop anda.';
  END IF;
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (OLD.organization_id, auth.uid(), 'ROSTER_LEGACY_' || NEW.status::text,
   'staff_shift', OLD.id, to_jsonb(OLD), to_jsonb(NEW));
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private_rkj.guard_am_legacy_shift_decision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_am_legacy_shift_decision BEFORE UPDATE OF status ON public.staff_shifts
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('APPROVED','REJECTED'))
 EXECUTE FUNCTION private_rkj.guard_am_legacy_shift_decision();

CREATE POLICY am_staff_shifts_no_direct_insert ON public.staff_shifts AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (public.user_role() IS DISTINCT FROM 'AREA_MANAGER');
CREATE POLICY am_staff_shifts_no_direct_update ON public.staff_shifts AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (public.user_role() IS DISTINCT FROM 'AREA_MANAGER')
 WITH CHECK (public.user_role() IS DISTINCT FROM 'AREA_MANAGER');
CREATE POLICY am_staff_shifts_no_direct_delete ON public.staff_shifts AS RESTRICTIVE FOR DELETE TO authenticated
 USING (public.user_role() IS DISTINCT FROM 'AREA_MANAGER');
CREATE POLICY am_legacy_shift_approval_no_direct_update ON public.approval_requests AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (entity_type <> 'SHIFT' OR public.user_role() IS DISTINCT FROM 'AREA_MANAGER')
 WITH CHECK (entity_type <> 'SHIFT' OR public.user_role() IS DISTINCT FROM 'AREA_MANAGER');
