-- RKJ One: clear required password flags for approved production UAT accounts.
-- Requested by owner on 2026-07-09 to continue role UAT without API lockout.
-- Idempotent: only profiles currently marked must_change_password=true are updated.

DO $$
DECLARE
 v_org_id UUID;
 v_old_profiles JSONB;
 v_new_profiles JSONB;
 v_changed INTEGER := 0;
BEGIN
 SELECT id INTO v_org_id
 FROM public.organizations
 WHERE code = 'RKJ'
 LIMIT 1;

 IF v_org_id IS NULL THEN
  RAISE NOTICE 'RKJ organization not found; skip UAT password flag clearance';
  RETURN;
 END IF;

 WITH target_profiles AS (
  SELECT
   p.id,
   p.employee_code,
   p.full_name,
   p.email,
   p.role::TEXT AS role,
   p.status::TEXT AS status,
   p.must_change_password
  FROM public.profiles p
  WHERE p.organization_id = v_org_id
  AND p.must_change_password IS TRUE
  AND (
   p.employee_code IN ('DIST009', 'DIST010', 'MFG010')
   OR (p.role::TEXT = 'SALES_AGENT' AND p.status::TEXT = 'ACTIVE')
  )
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(target_profiles) ORDER BY employee_code, email), '[]'::jsonb)
 INTO v_old_profiles
 FROM target_profiles;

 UPDATE public.profiles p
 SET
  must_change_password = false,
  updated_at = now()
 WHERE p.organization_id = v_org_id
 AND p.must_change_password IS TRUE
 AND (
  p.employee_code IN ('DIST009', 'DIST010', 'MFG010')
  OR (p.role::TEXT = 'SALES_AGENT' AND p.status::TEXT = 'ACTIVE')
 );

 GET DIAGNOSTICS v_changed = ROW_COUNT;

 IF v_changed > 0 THEN
  WITH changed_profiles AS (
   SELECT
    p.id,
    p.employee_code,
    p.full_name,
    p.email,
    p.role::TEXT AS role,
    p.status::TEXT AS status,
    p.must_change_password
   FROM public.profiles p
   WHERE p.organization_id = v_org_id
   AND (
    p.employee_code IN ('DIST009', 'DIST010', 'MFG010')
    OR (p.role::TEXT = 'SALES_AGENT' AND p.status::TEXT = 'ACTIVE')
   )
   AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_old_profiles) AS old_profile
    WHERE old_profile->>'id' = p.id::TEXT
   )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(changed_profiles) ORDER BY employee_code, email), '[]'::jsonb)
  INTO v_new_profiles
  FROM changed_profiles;

  INSERT INTO public.audit_logs (
   organization_id,
   user_id,
   action,
   entity_type,
   entity_id,
   old_values,
   new_values
  )
  VALUES (
   v_org_id,
   NULL,
   'uat_clear_required_password_flags',
   'profiles',
   NULL,
   jsonb_build_object('profiles', v_old_profiles, 'changed_count', v_changed),
   jsonb_build_object('profiles', v_new_profiles, 'changed_count', v_changed)
  );
 END IF;
END $$;
