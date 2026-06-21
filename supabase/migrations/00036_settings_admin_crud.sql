-- Admin settings: cawangan CRUD + kiosk lokasi auto
-- Migration 00036

CREATE OR REPLACE FUNCTION can_admin_settings()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.user_role() IN ('SUPER_ADMIN', 'ADMIN');
$$;

GRANT EXECUTE ON FUNCTION can_admin_settings TO authenticated;

CREATE POLICY org_admin_branches_insert ON branches
  FOR INSERT
  WITH CHECK (
    organization_id = public.organization_id()
    AND can_admin_settings()
  );

CREATE POLICY org_admin_branches_delete ON branches
  FOR DELETE
  USING (
    organization_id = public.organization_id()
    AND can_admin_settings()
  );

CREATE OR REPLACE FUNCTION admin_create_branch(
  p_region_id UUID,
  p_branch_code TEXT,
  p_branch_name TEXT,
  p_area TEXT DEFAULT NULL,
  p_manager_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_branch_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_admin_settings() THEN
    RAISE EXCEPTION 'Hanya pentadbir HQ boleh tambah cawangan';
  END IF;

  v_org_id := public.organization_id();

  IF NOT EXISTS (
    SELECT 1 FROM regions
    WHERE id = p_region_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Kawasan tidak dijumpai';
  END IF;

  IF EXISTS (
    SELECT 1 FROM branches
    WHERE organization_id = v_org_id AND branch_code = p_branch_code
  ) THEN
    RAISE EXCEPTION 'Kod cawangan sudah wujud: %', p_branch_code;
  END IF;

  INSERT INTO branches (
    organization_id, region_id, branch_code, branch_name, area, manager_name, status
  ) VALUES (
    v_org_id, p_region_id, upper(trim(p_branch_code)), trim(p_branch_name),
    p_area, p_manager_name, 'ACTIVE'
  ) RETURNING id INTO v_branch_id;

  INSERT INTO inventory_locations (
    organization_id, location_type, name, branch_id, is_active
  ) VALUES (
    v_org_id, 'BRANCH_KIOSK', trim(p_branch_name), v_branch_id, true
  );

  RETURN jsonb_build_object(
    'branch_id', v_branch_id,
    'branch_code', upper(trim(p_branch_code)),
    'status', 'ACTIVE'
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_branch(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_tx_count INT;
  v_staff_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_admin_settings() THEN
    RAISE EXCEPTION 'Hanya pentadbir HQ boleh padam cawangan';
  END IF;

  v_org_id := public.organization_id();

  IF NOT EXISTS (
    SELECT 1 FROM branches
    WHERE id = p_branch_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Cawangan tidak dijumpai';
  END IF;

  SELECT count(*) INTO v_tx_count
  FROM pos_transactions WHERE branch_id = p_branch_id;

  SELECT count(*) INTO v_staff_count
  FROM staff WHERE branch_id = p_branch_id;

  IF v_tx_count > 0 OR v_staff_count > 0 THEN
    RAISE EXCEPTION 'Cawangan ada rekod jualan/staf — gunakan tutup kedai (OFF) dahulu';
  END IF;

  DELETE FROM inventory_locations
  WHERE branch_id = p_branch_id AND location_type = 'BRANCH_KIOSK';

  DELETE FROM branches WHERE id = p_branch_id AND organization_id = v_org_id;

  RETURN jsonb_build_object('branch_id', p_branch_id, 'deleted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_branch TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_branch TO authenticated;
