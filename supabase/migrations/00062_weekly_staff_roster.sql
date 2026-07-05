-- RKJ One: Weekly staff roster for Area Managers
-- Jadual mingguan staf per cawangan — siap sebelum Isnin, reminder harian

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ROSTER_DUE';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ROSTER_PUBLISHED';

CREATE TYPE weekly_roster_status AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE weekly_roster_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id),
 week_start_date DATE NOT NULL,
 status weekly_roster_status NOT NULL DEFAULT 'DRAFT',
 published_at TIMESTAMPTZ,
 published_by UUID REFERENCES profiles(id),
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, branch_id, week_start_date),
 CONSTRAINT week_start_is_monday CHECK (EXTRACT(ISODOW FROM week_start_date) = 1)
);

CREATE TABLE weekly_roster_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id UUID NOT NULL REFERENCES weekly_roster_plans(id) ON DELETE CASCADE,
 staff_id UUID NOT NULL REFERENCES staff(id),
 day_index SMALLINT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
 is_off BOOLEAN NOT NULL DEFAULT false,
 template_id UUID REFERENCES shift_templates(id),
 scheduled_start TIME,
 scheduled_end TIME,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (plan_id, staff_id, day_index)
);

CREATE TABLE weekly_roster_reminder_log (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id),
 week_start_date DATE NOT NULL,
 manager_profile_id UUID NOT NULL REFERENCES profiles(id),
 reminder_date DATE NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (branch_id, week_start_date, reminder_date)
);

CREATE INDEX idx_roster_plans_branch_week ON weekly_roster_plans(branch_id, week_start_date DESC);
CREATE INDEX idx_roster_entries_plan ON weekly_roster_entries(plan_id);
CREATE INDEX idx_roster_entries_staff ON weekly_roster_entries(staff_id);

ALTER TABLE weekly_roster_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_roster_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_roster_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY roster_plans_branch ON weekly_roster_plans
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

CREATE POLICY roster_entries_via_plan ON weekly_roster_entries
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM weekly_roster_plans p
 WHERE p.id = plan_id
 AND p.organization_id = public.organization_id()
 AND public.has_branch_access(p.branch_id)
 )
 );

CREATE POLICY roster_plans_staff_read ON weekly_roster_plans
 FOR SELECT USING (
 status = 'PUBLISHED'
 AND organization_id = public.organization_id()
 AND EXISTS (
 SELECT 1 FROM weekly_roster_entries e
 JOIN staff s ON s.id = e.staff_id
 WHERE e.plan_id = weekly_roster_plans.id
 AND s.profile_id = auth.uid()
 )
 );

CREATE POLICY roster_entries_staff_read ON weekly_roster_entries
 FOR SELECT USING (
 EXISTS (
 SELECT 1 FROM staff s
 JOIN weekly_roster_plans p ON p.id = plan_id
 WHERE s.id = staff_id
 AND s.profile_id = auth.uid()
 AND p.status = 'PUBLISHED'
 )
 );

CREATE POLICY roster_reminder_log_am ON weekly_roster_reminder_log
 FOR ALL USING (
 organization_id = public.organization_id()
 AND (
 manager_profile_id = auth.uid()
 OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
 )
 );

-- Publish roster → create approved staff_shifts for the week
CREATE OR REPLACE FUNCTION publish_weekly_roster(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_plan RECORD;
 v_entry RECORD;
 v_template RECORD;
 v_shift_date DATE;
 v_hours NUMERIC;
 v_start TIME;
 v_end TIME;
 v_count INT := 0;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN
 RAISE EXCEPTION 'Not authenticated';
 END IF;

 SELECT * INTO v_plan FROM weekly_roster_plans WHERE id = p_plan_id;
 IF NOT FOUND THEN
 RAISE EXCEPTION 'Roster plan not found';
 END IF;

 IF NOT public.has_branch_access(v_plan.branch_id) THEN
 RAISE EXCEPTION 'No branch access';
 END IF;

 IF v_plan.status = 'PUBLISHED' THEN
 RAISE EXCEPTION 'Roster already published';
 END IF;

 FOR v_entry IN
 SELECT * FROM weekly_roster_entries WHERE plan_id = p_plan_id AND NOT is_off
 LOOP
 v_shift_date := v_plan.week_start_date + v_entry.day_index;
 v_start := v_entry.scheduled_start;
 v_end := v_entry.scheduled_end;
 v_hours := NULL;

 IF v_entry.template_id IS NOT NULL THEN
 SELECT * INTO v_template FROM shift_templates WHERE id = v_entry.template_id;
 v_start := COALESCE(v_start, v_template.start_time);
 v_end := COALESCE(v_end, v_template.end_time);
 v_hours := v_template.default_hours;
 END IF;

 DELETE FROM staff_shifts
 WHERE staff_id = v_entry.staff_id
 AND branch_id = v_plan.branch_id
 AND shift_date = v_shift_date
 AND notes LIKE 'roster:%';

 INSERT INTO staff_shifts (
 organization_id, staff_id, branch_id, template_id, shift_date,
 scheduled_start, scheduled_end, scheduled_hours, notes,
 created_by, status
 ) VALUES (
 v_plan.organization_id, v_entry.staff_id, v_plan.branch_id, v_entry.template_id,
 v_shift_date, v_start, v_end, v_hours,
 'roster:' || p_plan_id::text,
 v_user_id, 'APPROVED'
 );
 v_count := v_count + 1;
 END LOOP;

 UPDATE weekly_roster_plans SET
 status = 'PUBLISHED',
 published_at = now(),
 published_by = v_user_id,
 updated_at = now()
 WHERE id = p_plan_id;

 RETURN jsonb_build_object('published', true, 'shifts_created', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION publish_weekly_roster(UUID) TO authenticated;
