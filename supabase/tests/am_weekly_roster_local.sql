-- Run only on a disposable local database after the AM assignment and roster migrations.
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
SELECT pg_temp.assert_roster((
 SELECT count(*) = 2 AND sum(scheduled_hours) = 14.25 FROM staff_shifts
 WHERE notes = 'roster:' || current_setting('roster_test.plan')
), 'overnight duration and unchanged template default hours are preserved');
SELECT set_config('roster_test.shift', (
 SELECT id::text FROM staff_shifts WHERE notes = 'roster:' || current_setting('roster_test.plan') AND shift_date = '2199-11-17'
), true);

RESET ROLE;
UPDATE staff SET branch_id = '30000000-0000-4000-8000-000000000002' WHERE id = '50000000-0000-4000-8000-000000000002';
UPDATE shift_templates SET start_time = '23:00' WHERE id = '60000000-0000-4000-8000-000000000001';
INSERT INTO weekly_roster_entries (plan_id, staff_id, day_index, is_off)
VALUES (current_setting('roster_test.plan')::uuid, '50000000-0000-4000-8000-000000000001', 4, false);
SET LOCAL ROLE authenticated;
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
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.save_weekly_roster('30000000-0000-4000-8000-000000000001','2199-11-11',
   '[{"staff_id":"50000000-0000-4000-8000-000000000001","day_index":6,"is_off":true}]');
  RAISE EXCEPTION 'Unexpected overwrite of attendance-bound slot';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END;
$$;
SELECT pg_temp.assert_roster((
 SELECT opened_at = '2199-11-17 22:00+08' AND closed_at = '2199-11-18 06:00+08' AND status = 'CLOSED'
 FROM pos_shifts WHERE id = '70000000-0000-4000-8000-000000000001'
), 'planning does not change actual POS opening or close');

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_roster((
 SELECT count(*) = 3 AND bool_or(scheduled_start = '23:00' AND NOT is_off)
 FROM weekly_roster_entries WHERE plan_id = current_setting('roster_test.plan')::uuid
) AND NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE id = current_setting('roster_test.copy')::uuid),
 'staff sees only their published slots including the planning change');

RESET ROLE;
DELETE FROM profile_branch_access
WHERE profile_id = '40000000-0000-4000-8000-000000000001'
 AND branch_id = '30000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_roster(
 NOT EXISTS (SELECT 1 FROM weekly_roster_plans WHERE id = current_setting('roster_test.plan')::uuid)
 AND NOT EXISTS (SELECT 1 FROM pos_shifts WHERE id = '70000000-0000-4000-8000-000000000001'),
 'revocation immediately hides both planned and actual rows');

ROLLBACK;
