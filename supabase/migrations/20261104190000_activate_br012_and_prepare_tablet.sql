-- Close the final registered-device rollout gap for BR012.
--
-- This migration deliberately prepares only a PENDING tablet slot. It does not
-- create an enrollment code, verify hardware, activate a device or copy any
-- device identity. Fiuu VT therefore remains fail-closed until the owner enters
-- the exact official tablet asset details and completes one-time enrollment.

DO $$
DECLARE
  v_organization_id UUID;
  v_branch_id UUID;
  v_branch_name TEXT;
  v_branch_status TEXT;
  v_target_count INTEGER;
  v_ready_slot_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_target_count
  FROM public.organizations AS organization
  JOIN public.branches AS branch
    ON branch.organization_id = organization.id
  WHERE organization.code = 'RKJ'
    AND organization.name = 'Roti Kaya Junus'
    AND organization.status = 'ACTIVE'
    AND branch.branch_code = 'BR012';

  IF v_target_count <> 1 THEN
    RAISE EXCEPTION
      'BR012 rollout preparation expected exactly one active RKJ organization target, found %',
      v_target_count;
  END IF;

  SELECT
    organization.id,
    branch.id,
    branch.branch_name,
    branch.status::TEXT
  INTO
    v_organization_id,
    v_branch_id,
    v_branch_name,
    v_branch_status
  FROM public.organizations AS organization
  JOIN public.branches AS branch
    ON branch.organization_id = organization.id
  WHERE organization.code = 'RKJ'
    AND organization.name = 'Roti Kaya Junus'
    AND organization.status = 'ACTIVE'
    AND branch.branch_code = 'BR012';

  IF v_branch_name IS DISTINCT FROM 'Hentian Sebelah Bukit Gantang Arah Selatan' THEN
    RAISE EXCEPTION
      'BR012 rollout preparation refused unexpected branch name: %',
      v_branch_name;
  END IF;

  IF v_branch_status NOT IN ('ACTIVE', 'INACTIVE') THEN
    RAISE EXCEPTION
      'BR012 rollout preparation refused unexpected branch status: %',
      v_branch_status;
  END IF;

  UPDATE public.branches
  SET
    status = 'ACTIVE',
    updated_at = clock_timestamp()
  WHERE id = v_branch_id
    AND status = 'INACTIVE';

  SELECT count(*)
  INTO v_ready_slot_count
  FROM public.pos_devices AS device
  WHERE device.organization_id = v_organization_id
    AND device.branch_id = v_branch_id
    AND device.status IN ('PENDING', 'ACTIVE');

  IF v_ready_slot_count > 1 THEN
    RAISE EXCEPTION
      'BR012 rollout preparation refused % current tablet slots',
      v_ready_slot_count;
  END IF;

  IF v_ready_slot_count = 0 THEN
    INSERT INTO public.pos_devices (
      organization_id,
      branch_id,
      device_code,
      device_name,
      status
    )
    VALUES (
      v_organization_id,
      v_branch_id,
      'POS-BR012-' || upper(substr(md5(v_branch_id::TEXT), 1, 6)),
      left('Tablet POS - ' || v_branch_name, 80),
      'PENDING'
    )
    ON CONFLICT (organization_id, device_code) DO NOTHING;
  END IF;

  SELECT count(*)
  INTO v_ready_slot_count
  FROM public.pos_devices AS device
  WHERE device.organization_id = v_organization_id
    AND device.branch_id = v_branch_id
    AND device.status IN ('PENDING', 'ACTIVE');

  IF v_ready_slot_count <> 1 THEN
    RAISE EXCEPTION
      'BR012 rollout preparation expected one current tablet slot after preparation, found %',
      v_ready_slot_count;
  END IF;
END
$$;
