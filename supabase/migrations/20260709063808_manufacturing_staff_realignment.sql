-- RKJ One: Manufacturing staff realignment after GMP setup
-- Production data fix requested by owner on 2026-07-09.
-- Idempotent: safe to rerun without duplicating notes.

DO $$
DECLARE
 v_org_id UUID;
 v_dist_id UUID;
 v_mfg_id UUID;
 v_dist012_staff UUID;
 v_dist012_profile UUID;
 v_old_staff JSONB;
 v_old_profile JSONB;
 v_new_staff JSONB;
 v_new_profile JSONB;
 v_boundary_old JSONB;
 v_boundary_new JSONB;
BEGIN
 SELECT id INTO v_org_id FROM public.organizations WHERE code = 'RKJ' LIMIT 1;
 IF v_org_id IS NULL THEN
  RAISE NOTICE 'RKJ organization not found; skip Manufacturing staff realignment';
  RETURN;
 END IF;

 SELECT id INTO v_dist_id
 FROM public.legal_entities
 WHERE organization_id = v_org_id AND code = 'RKJ_DIST'
 LIMIT 1;

 SELECT id INTO v_mfg_id
 FROM public.legal_entities
 WHERE organization_id = v_org_id AND code = 'RKJ_MFG'
 LIMIT 1;

 IF v_dist_id IS NULL OR v_mfg_id IS NULL THEN
  RAISE NOTICE 'Required legal entities not found; skip Manufacturing staff realignment';
  RETURN;
 END IF;

 SELECT id, profile_id, to_jsonb(s)
 INTO v_dist012_staff, v_dist012_profile, v_old_staff
 FROM public.staff s
 WHERE organization_id = v_org_id AND staff_code = 'DIST012'
 LIMIT 1;

 IF v_dist012_staff IS NOT NULL THEN
  SELECT to_jsonb(p) INTO v_old_profile
  FROM public.profiles p
  WHERE p.id = v_dist012_profile;

  UPDATE public.staff
  SET
   legal_entity_id = v_dist_id,
   remarks = CASE
    WHEN COALESCE(remarks, '') ILIKE '%GMP realignment: moved to RKJ_DIST%'
     THEN remarks
    ELSE concat_ws(' | ', NULLIF(remarks, ''), 'GMP realignment: moved to RKJ_DIST as Distributor driver assistant on 2026-07-09')
   END,
   updated_at = now()
  WHERE id = v_dist012_staff;

  IF v_dist012_profile IS NOT NULL THEN
   UPDATE public.profiles
   SET
    legal_entity_id = v_dist_id,
    updated_at = now()
   WHERE id = v_dist012_profile;
  END IF;

  SELECT to_jsonb(s) INTO v_new_staff
  FROM public.staff s
  WHERE s.id = v_dist012_staff;

  SELECT to_jsonb(p) INTO v_new_profile
  FROM public.profiles p
  WHERE p.id = v_dist012_profile;

  INSERT INTO public.audit_logs (
   organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  )
  VALUES
  (
   v_org_id,
   NULL,
   'manufacturing_staff_realignment_dist012',
   'staff',
   v_dist012_staff,
   jsonb_build_object('staff', v_old_staff, 'profile', v_old_profile),
   jsonb_build_object('staff', v_new_staff, 'profile', v_new_profile)
  );
 END IF;

 SELECT jsonb_agg(to_jsonb(s) ORDER BY s.staff_code) INTO v_boundary_old
 FROM public.staff s
 WHERE s.organization_id = v_org_id
 AND s.staff_code IN ('MFG001', 'MFG005', 'MFG006', 'MFG009');

 UPDATE public.staff
 SET
  remarks = CASE
   WHEN COALESCE(remarks, '') ILIKE '%GMP boundary: Factory Logistics Support%'
    THEN remarks
   ELSE concat_ws(' | ', NULLIF(remarks, ''), 'GMP boundary: Factory Logistics Support for pickup/dispatch; payroll/access remain RKJ_DIST')
  END,
  updated_at = now()
 WHERE organization_id = v_org_id
 AND staff_code IN ('MFG001', 'MFG005', 'MFG006', 'MFG009');

 UPDATE public.drivers
 SET
  remarks = CASE
   WHEN COALESCE(remarks, '') ILIKE '%GMP boundary: Factory Logistics Support%'
    THEN remarks
   ELSE concat_ws(' | ', NULLIF(remarks, ''), 'GMP boundary: Factory Logistics Support for pickup/dispatch')
  END,
  updated_at = now()
 WHERE organization_id = v_org_id
 AND profile_id IN (
  SELECT profile_id
  FROM public.staff
  WHERE organization_id = v_org_id
  AND staff_code IN ('MFG001', 'MFG005', 'MFG006', 'MFG009')
  AND profile_id IS NOT NULL
 );

 SELECT jsonb_agg(to_jsonb(s) ORDER BY s.staff_code) INTO v_boundary_new
 FROM public.staff s
 WHERE s.organization_id = v_org_id
 AND s.staff_code IN ('MFG001', 'MFG005', 'MFG006', 'MFG009');

 INSERT INTO public.audit_logs (
  organization_id, user_id, action, entity_type, entity_id, old_values, new_values
 )
 VALUES
 (
  v_org_id,
  NULL,
  'manufacturing_staff_boundary_logistics_support',
  'staff_group',
  NULL,
  jsonb_build_object('staff', COALESCE(v_boundary_old, '[]'::jsonb)),
  jsonb_build_object('staff', COALESCE(v_boundary_new, '[]'::jsonb))
 );
END $$;
