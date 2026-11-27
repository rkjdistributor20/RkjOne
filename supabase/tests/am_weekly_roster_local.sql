-- Run only on a disposable local database after the AM assignment and both roster migrations.
BEGIN;

CREATE FUNCTION pg_temp.assert_roster(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Roster assertion failed: %', label; END IF;
END;
$$;

INSERT INTO organizations (id, code, name) VALUES
 ('10000000-0000-4000-8000-000000000001', 'ROSTER-TEST-A', 'Roster A'),
 ('10000000-0000-4000-8000-000000000002', 'ROSTER-TEST-B', 'Roster B');
INSERT INTO regions (id, organization_id, code, name) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','UTARA','A north'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','SELATAN','A south'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','UTARA','B north');
INSERT INTO branches (id, organization_id, region_id, branch_code, branch_name) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RTA1','A1'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','RTA2','A2'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RTA3','A3'),
 ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','RTB1','B1');
INSERT INTO auth.users (id) VALUES
 ('40000000-0000-4000-8000-000000000001'), ('40000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000003');
INSERT INTO profiles (id, organization_id, full_name, role, region_id, branch_id) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test AM','AREA_MANAGER','20000000-0000-4000-8000-000000000001',NULL),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Test Staff','STAFF','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Other AM','AREA_MANAGER','20000000-0000-4000-8000-000000000002',NULL);
INSERT INTO profile_branch_access (profile_id, branch_id) VALUES
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003');
INSERT INTO staff (id, organization_id, branch_id, staff_code, full_name, status, profile_id) VALUES
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','RT01','Shift opener','ACTIVE','40000000-0000-4000-8000-000000000002'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','RT02','Moved staff','ACTIVE',NULL),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','RT03','Wrong branch','ACTIVE',NULL),
 ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','RT04','Inactive staff','INACTIVE',NULL),
 ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','RT05','Wrong tenant','ACTIVE',NULL);
INSERT INTO shift_templates (id, organization_id, template_code, name, start_time, end_time, default_hours, crosses_midnight) VALUES
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','RT-NIGHT','Night','22:00','06:00',7.5,true),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','RT-FOREIGN','Foreign','08:00','17:00',8,false);
INSERT INTO pos_shifts (id, organization_id, branch_id, staff_id, opened_by, shift_number, status, opened_at, closed_at) VALUES
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','ROSTER-TEST-POS','CLOSED',
  '2199-11-17 22:00+08','2199-11-18 06:00+08');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_roster(
 public.can_manage_roster_branch('30000000-0000-4000-8000-000000000001')
 AND public.can_manage_roster_branch('30000000-0000-4000-8000-000000000002')
 AND NOT public.can_manage_roster_branch('30000000-0000-4000-8000-000000000003')
 AND NOT public.can_manage_roster_branch('30000000-0000-4000-8000-000000000004'),
 'AM scope honors explicit grants across regions and excludes unassigned branches in the same region');

DO $$
DECLARE
 v_staff_id uuid;
 v_branch_id uuid;
BEGIN
 FOREACH v_branch_id IN ARRAY ARRAY['30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004']::uuid[] LOOP
  BEGIN
   PERFORM public.save_weekly_roster(v_branch_id, '2199-11-11');
   RAISE EXCEPTION 'Unexpected save outside branch scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 FOREACH v_staff_id IN ARRAY ARRAY['50000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005']::uuid[] LOOP
  BEGIN
   PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
    jsonb_build_array(jsonb_build_object('staff_id',v_staff_id,'day_index',0,'is_off',true)));
   RAISE EXCEPTION 'Unexpected save for wrong branch, inactive or foreign staff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
   '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":0,"is_off":false,"template_id":"60000000-0000-4000-8000-000000000002"}]');
  RAISE EXCEPTION 'Unexpected foreign template accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
   '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":0,"is_off":false,"scheduled_start":"06:00","scheduled_end":"06:00"}]');
  RAISE EXCEPTION 'Unexpected zero-length shift accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  INSERT INTO weekly_roster_plans (organization_id, branch_id, week_start_date)
  VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2199-11-11');
  RAISE EXCEPTION 'Unexpected direct data API write';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-12');
  RAISE EXCEPTION 'Unexpected save on non-Monday';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
   '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":0,"is_off":false,"scheduled_start":"22:00","scheduled_end":"06:00"},
     {"staff_id":"50000000-0000-4000-8000-000000000001","day_index":1,"is_off":false,"scheduled_start":"05:59","scheduled_end":"11:00"}]');
  RAISE EXCEPTION 'Unexpected overnight overlap within one new draft';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'Jadual staf bertindih:%' THEN RAISE; END IF;
 END;
END;
$$;
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE week_start_date = '2199-11-11'),
 'invalid saves roll back draft creation');

SELECT set_config('roster_test.plan', public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":false,"template_id":"60000000-0000-4000-8000-000000000001"},
   {"staff_id":"50000000-0000-4000-8000-000000000001","day_index":1,"is_off":false,"scheduled_start":"21:30","scheduled_end":"04:15"},
   {"staff_id":"50000000-0000-4000-8000-000000000002","day_index":1,"is_off":true}]')::text,true);

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE id = current_setting('roster_test.plan')::uuid)
 AND NOT EXISTS (SELECT 1 FROM weekly_roster_entries WHERE plan_id = current_setting('roster_test.plan')::uuid),
 'staff cannot read roster draft');
DO $$
BEGIN
 BEGIN
  PERFORM public.publish_weekly_roster(current_setting('roster_test.plan')::uuid);
  RAISE EXCEPTION 'Unexpected staff publish';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11');
  RAISE EXCEPTION 'Unexpected STAFF write through roster RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',true);
DO $$
BEGIN
 BEGIN
  PERFORM public.publish_weekly_roster(current_setting('roster_test.plan')::uuid);
  RAISE EXCEPTION 'Unexpected other AM publish';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_roster(
 public.publish_weekly_roster(current_setting('roster_test.plan')::uuid) ->> 'shifts_created' = '2',
 'publish materializes both working slots');

RESET ROLE;
INSERT INTO public.staff_shifts (id, organization_id, staff_id, branch_id, shift_date, scheduled_start,
 scheduled_end, created_by, status) VALUES
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '2199-11-18','05:30','09:00','40000000-0000-4000-8000-000000000002','PENDING'),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '2199-11-18','06:00','09:00','40000000-0000-4000-8000-000000000002','PENDING'),
 ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',
  '2199-11-18','10:00','11:00','40000000-0000-4000-8000-000000000002','PENDING');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.create_staff_shift('50000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000001','2199-11-18');
  RAISE EXCEPTION 'Unexpected legacy AM request for the wrong staff member';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.approve_staff_shift('90000000-0000-4000-8000-000000000003');
  RAISE EXCEPTION 'Unexpected legacy AM approval outside scope';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.approve_staff_shift('90000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Unexpected legacy AM approval overlapping a published overnight slot';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 UPDATE public.staff_shifts SET status='APPROVED' WHERE id='90000000-0000-4000-8000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Unexpected direct AM status change'; END IF;
END;
$$;
SELECT pg_temp.assert_roster(
 public.approve_staff_shift('90000000-0000-4000-8000-000000000002') ->> 'status' = 'APPROVED',
 'AM can approve in-scope legacy request starting when the overnight slot ends');
RESET ROLE;
SELECT pg_temp.assert_roster(EXISTS (
 SELECT 1 FROM public.audit_logs WHERE entity_id='90000000-0000-4000-8000-000000000002'
  AND action='ROSTER_LEGACY_APPROVED' AND old_values->>'status'='PENDING' AND new_values->>'status'='APPROVED'
), 'legacy AM decision creates one before/after audit entry');
DELETE FROM public.staff_shifts WHERE id IN ('90000000-0000-4000-8000-000000000001',
 '90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_roster((
 SELECT count(*) = 2 AND sum(scheduled_hours) = 14.25 FROM staff_shifts
 WHERE notes = 'roster:' || current_setting('roster_test.plan')
), 'overnight duration and unchanged template default hours are preserved');
SELECT set_config('roster_test.shift', (
 SELECT id::text FROM staff_shifts WHERE notes = 'roster:' || current_setting('roster_test.plan') AND shift_date = '2199-11-17'
), true);

-- Copy is checked at its destination, not just where the source was valid.
SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-12-02',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":0,"is_off":false,"scheduled_start":"05:59","scheduled_end":"11:00"}]');
DO $$
BEGIN
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-18','[]','2199-12-02');
  RAISE EXCEPTION 'Copy overlapped the preceding Sunday';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'Jadual staf bertindih:%' THEN RAISE; END IF;
 END;
END;
$$;
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE week_start_date = '2199-11-18'),
 'an overlapping copy rolls back its draft');

-- An AM must reject a conflict even when the former branch is not visible.
RESET ROLE;
UPDATE staff SET branch_id = '30000000-0000-4000-8000-000000000003' WHERE id = '50000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM roster_planned_shifts WHERE branch_id = '30000000-0000-4000-8000-000000000001')
 AND NOT EXISTS (
  SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
  WHERE n.nspname = 'private_rkj' AND f.proname IN ('save_weekly_roster', 'publish_weekly_roster')
   AND has_function_privilege(f.oid, 'EXECUTE')
 ),
 'other AM cannot read the source plan or bypass the checked RPC');
DO $$
DECLARE
 v_week date;
 v_entry jsonb;
BEGIN
 FOR v_week, v_entry IN SELECT * FROM (VALUES
  (date '2199-11-11', '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":1,"is_off":false,"scheduled_start":"22:00","scheduled_end":"23:00"}]'::jsonb),
  (date '2199-11-18', '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":0,"is_off":false,"scheduled_start":"05:59","scheduled_end":"11:00"}]'::jsonb)
 ) inputs(week_start, entry) LOOP
  BEGIN
   PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000003',v_week,v_entry);
   RAISE EXCEPTION 'Cross-branch overlap was accepted';
  EXCEPTION WHEN unique_violation THEN
   IF SQLERRM <> format('Jadual staf bertindih: Shift opener (%s, MYT)',
    CASE WHEN v_week = '2199-11-11' THEN '2199-11-12' ELSE '2199-11-18' END) THEN RAISE; END IF;
  END;
 END LOOP;
END;
$$;

RESET ROLE;
-- Simulate a draft made before overlap validation existed.
INSERT INTO weekly_roster_plans (id, organization_id, branch_id, week_start_date)
VALUES ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000003','2199-11-18');
INSERT INTO weekly_roster_entries (plan_id, staff_id, day_index, scheduled_start, scheduled_end)
VALUES ('80000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',0,'05:59','11:00');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.publish_weekly_roster('80000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Unexpected publish of overlapping legacy draft';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'Jadual staf bertindih:%' THEN RAISE; END IF;
 END;
END;
$$;
SELECT pg_temp.assert_roster((
 SELECT status = 'DRAFT' FROM weekly_roster_plans WHERE id = '80000000-0000-4000-8000-000000000001'
) AND NOT EXISTS (
 SELECT 1 FROM staff_shifts WHERE notes = 'roster:80000000-0000-4000-8000-000000000001'
), 'rejected publication leaves the plan and projection unchanged');
SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000003','2199-11-18',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":0,"is_off":false,"scheduled_start":"06:00","scheduled_end":"11:00"}]');
SELECT pg_temp.assert_roster(
 public.publish_weekly_roster('80000000-0000-4000-8000-000000000001')->>'published' = 'true',
 'adjacent cross-branch slots can meet at the exact end time');

RESET ROLE;
UPDATE staff SET branch_id = '30000000-0000-4000-8000-000000000001' WHERE id = '50000000-0000-4000-8000-000000000001';
UPDATE staff SET branch_id = '30000000-0000-4000-8000-000000000002' WHERE id = '50000000-0000-4000-8000-000000000002';
UPDATE shift_templates SET start_time = '23:00' WHERE id = '60000000-0000-4000-8000-000000000001';
INSERT INTO weekly_roster_entries (plan_id, staff_id, day_index, is_off)
VALUES (current_setting('roster_test.plan')::uuid, '50000000-0000-4000-8000-000000000001', 4, false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
DO $$
BEGIN
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
   '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":false,"scheduled_start":"22:00","scheduled_end":"07:00"}]');
  RAISE EXCEPTION 'Published amendment overlapped the next branch';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'Jadual staf bertindih:%' THEN RAISE; END IF;
 END;
END;
$$;
SELECT pg_temp.assert_roster((
 SELECT scheduled_end = '06:00' FROM weekly_roster_entries
 WHERE plan_id = current_setting('roster_test.plan')::uuid AND day_index = 6
) AND (
 SELECT scheduled_end = '06:00' FROM staff_shifts WHERE id = current_setting('roster_test.shift')::uuid
), 'rejected amendment rolls back both the published slot and its projection');

-- Validate the final transaction state, not its temporarily overlapping first edit.
SELECT set_config('roster_test.batch', public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-12-09',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":1,"is_off":false,"scheduled_start":"08:00","scheduled_end":"16:00"},
   {"staff_id":"50000000-0000-4000-8000-000000000001","day_index":2,"is_off":false,"scheduled_start":"05:00","scheduled_end":"12:00"}]')::text,true);
SELECT pg_temp.assert_roster(
 public.publish_weekly_roster(current_setting('roster_test.batch')::uuid)->>'shifts_created' = '2',
 'batch plan published');
SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-12-09',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":1,"is_off":false,"scheduled_start":"22:00","scheduled_end":"06:00"},
   {"staff_id":"50000000-0000-4000-8000-000000000001","day_index":2,"is_off":false,"scheduled_start":"06:00","scheduled_end":"12:00"}]');
SELECT pg_temp.assert_roster((
 SELECT count(*) = 2 AND count(*) FILTER (WHERE scheduled_start = '06:00' OR scheduled_start = '22:00') = 2
 FROM roster_planned_shifts WHERE plan_id = current_setting('roster_test.batch')::uuid
), 'batched overnight edit validates adjacent final slots and retains both staff assignments');

SELECT set_config('roster_test.copy', public.save_weekly_roster(
 '30000000-0000-4000-8000-000000000001','2199-11-18','[]','2199-11-11')::text,true);
SELECT pg_temp.assert_roster((
 SELECT count(*) = 2 AND max(scheduled_start) = '22:00' FROM weekly_roster_entries
 WHERE plan_id = current_setting('roster_test.copy')::uuid
) AND (
 SELECT status = 'DRAFT' FROM weekly_roster_plans WHERE id = current_setting('roster_test.copy')::uuid
), 'copy is a draft, skips moved staff and incomplete legacy slots, and retains snapshotted times');
DO $$
BEGIN
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-18','[]','2199-11-11');
  RAISE EXCEPTION 'Unexpected copy over existing slots';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END;
$$;

SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":false,"scheduled_start":"23:00","scheduled_end":"05:00"},
   {"staff_id":"50000000-0000-4000-8000-000000000001","day_index":1,"is_off":true}]');
SELECT pg_temp.assert_roster((
 SELECT count(*) = 1 AND min(id::text) = current_setting('roster_test.shift') AND max(scheduled_hours) = 6
 FROM staff_shifts WHERE notes = 'roster:' || current_setting('roster_test.plan')
), 'published edits retain the shift ID and remove only the unused off projection');

RESET ROLE;
INSERT INTO attendance_records (organization_id, staff_id, staff_shift_id, branch_id, attendance_date, clock_in)
VALUES ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
 current_setting('roster_test.shift')::uuid,'30000000-0000-4000-8000-000000000001','2199-11-17','2199-11-17 23:05+08');
UPDATE staff_shifts SET actual_start = '2199-11-17 23:05+08'
 WHERE id = current_setting('roster_test.shift')::uuid;
SELECT set_config('roster_test.shift_before', (
 SELECT to_jsonb(sh)::text FROM staff_shifts sh WHERE id = current_setting('roster_test.shift')::uuid
), true);
SELECT set_config('roster_test.attendance_before', (
 SELECT to_jsonb(a)::text FROM attendance_records a WHERE staff_shift_id = current_setting('roster_test.shift')::uuid
), true);
SET LOCAL ROLE authenticated;
SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":false,"scheduled_start":"21:00","scheduled_end":"04:00","notes":"Updated plan"}]');
SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":false,"scheduled_start":"21:00","scheduled_end":"04:00","notes":"Updated plan"}]');
SELECT pg_temp.assert_roster((
 SELECT count(*) = 1 AND min(scheduled_start) = '21:00' AND max(scheduled_end) = '04:00'
 FROM roster_planned_shifts WHERE plan_id = current_setting('roster_test.plan')::uuid AND shift_date = '2199-11-17'
), 'comparison reads the revised plan, not the attendance projection');
SELECT public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
 '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":true}]');
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM roster_planned_shifts
  WHERE branch_id = '30000000-0000-4000-8000-000000000001'
   AND staff_id = '50000000-0000-4000-8000-000000000001' AND shift_date = '2199-11-17'),
 'changing to off does not report the stale projection as a planned shift');
SELECT pg_temp.assert_roster((
 SELECT to_jsonb(sh) = current_setting('roster_test.shift_before')::jsonb
 FROM staff_shifts sh WHERE id = current_setting('roster_test.shift')::uuid
) AND (
 SELECT to_jsonb(a) = current_setting('roster_test.attendance_before')::jsonb
 FROM attendance_records a WHERE staff_shift_id = current_setting('roster_test.shift')::uuid
), 'planning preserves the entire linked attendance record and its historical projection');
SELECT pg_temp.assert_roster((
 SELECT opened_at = '2199-11-17 22:00+08' AND closed_at = '2199-11-18 06:00+08' AND status = 'CLOSED'
 FROM pos_shifts WHERE id = '70000000-0000-4000-8000-000000000001'
), 'planning does not change actual POS opening or close');

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_roster((
 SELECT count(*) = 3 AND bool_or(day_index = 6 AND is_off)
 FROM weekly_roster_entries WHERE plan_id = current_setting('roster_test.plan')::uuid
) AND NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE id = current_setting('roster_test.copy')::uuid),
 'staff sees only their published slots including the planning change');

RESET ROLE;
SELECT pg_temp.assert_roster((
 SELECT count(*) = 1 FROM audit_logs
 WHERE action = 'ROSTER_SLOT_UPDATE' AND user_id = '40000000-0000-4000-8000-000000000001'
  AND organization_id = '10000000-0000-4000-8000-000000000001' AND created_at IS NOT NULL
  AND old_values->>'plan_id' = current_setting('roster_test.plan') AND old_values->>'scheduled_start' = '23:00:00'
  AND new_values->>'scheduled_start' = '21:00:00' AND new_values->>'notes' = 'Updated plan'
  AND new_values->>'branch_id' = '30000000-0000-4000-8000-000000000001' AND new_values->>'week_start_date' = '2199-11-11'
) AND NOT EXISTS (
 SELECT 1 FROM audit_logs WHERE action = 'ROSTER_SLOT_UPDATE'
  AND old_values->>'plan_id' = current_setting('roster_test.plan')
  AND ((old_values->>'scheduled_start' = '21:00:00' AND new_values->>'scheduled_start' = '21:00:00')
   OR new_values->>'scheduled_end' = '07:00:00')
) AND EXISTS (
 SELECT 1 FROM audit_logs WHERE action = 'ROSTER_SLOT_UPDATE' AND old_values->>'scheduled_start' = '21:00:00'
  AND new_values->>'is_off' = 'true' AND old_values->>'plan_id' = current_setting('roster_test.plan')
) AND (
 SELECT count(*) = 1 FROM audit_logs WHERE action = 'ROSTER_PUBLISH'
  AND entity_id = '80000000-0000-4000-8000-000000000001'
  AND old_values->>'status' = 'DRAFT' AND new_values->>'status' = 'PUBLISHED'
), 'audit captures actor, scope and before/after changes once; rejected and unchanged operations leave no audit');

DELETE FROM profile_branch_access
WHERE profile_id = '40000000-0000-4000-8000-000000000001'
 AND branch_id = '30000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE id = current_setting('roster_test.plan')::uuid)
 AND NOT EXISTS (SELECT 1 FROM roster_planned_shifts WHERE plan_id = current_setting('roster_test.plan')::uuid)
 AND NOT EXISTS (SELECT 1 FROM pos_shifts WHERE id = '70000000-0000-4000-8000-000000000001'),
 'revocation immediately hides both planned and actual rows');

ROLLBACK;
