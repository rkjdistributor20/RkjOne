-- Rotate the BR001 Preview tablet enrollment without deleting its asset row.
-- The payment trigger and reenrollment RPC share a row lock on the official
-- device, so a live Fiuu VT payment cannot race with credential rotation.

CREATE OR REPLACE FUNCTION public.guard_fiuu_vt_payment_active_device()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_device_id UUID;
BEGIN
  IF NEW.provider = 'fiuu_vt'
    AND NEW.status IN ('PENDING', 'REPORTED') THEN
    SELECT device.id
    INTO v_device_id
    FROM public.pos_devices AS device
    JOIN public.branches AS branch
      ON branch.id = device.branch_id
      AND branch.organization_id = device.organization_id
    WHERE device.organization_id = NEW.organization_id
      AND device.branch_id = NEW.branch_id
      AND device.device_code = NEW.sale_payload->>'fiuu_device_code'
      AND device.status = 'ACTIVE'
      AND upper(btrim(branch.branch_code)) = 'BR001'
    FOR SHARE OF device;

    IF v_device_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment requires the active BR001 official tablet';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_fiuu_vt_payment_active_device()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_fiuu_vt_payment_active_device
  ON public.pos_online_payments;
CREATE TRIGGER guard_fiuu_vt_payment_active_device
BEFORE INSERT OR UPDATE ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_fiuu_vt_payment_active_device();

CREATE OR REPLACE FUNCTION public.request_br001_pos_device_reenrollment(
  p_device_id UUID,
  p_organization_id UUID,
  p_actor_id UUID,
  p_enrollment_code_hash TEXT,
  p_enrollment_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  device_code TEXT,
  device_name TEXT,
  branch_id UUID,
  status TEXT,
  enrollment_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_branch_code TEXT;
BEGIN
  IF p_device_id IS NULL
    OR p_organization_id IS NULL
    OR p_actor_id IS NULL
    OR p_enrollment_code_hash !~ '^[0-9a-f]{64}$'
    OR p_enrollment_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = 'Maklumat pendaftaran semula tablet tidak sah.';
  END IF;

  SELECT device.*
  INTO v_device
  FROM public.pos_devices AS device
  WHERE device.id = p_device_id
    AND device.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'no_data_found',
      MESSAGE = 'Rekod tablet tidak dijumpai.';
  END IF;

  SELECT upper(btrim(branch.branch_code))
  INTO v_branch_code
  FROM public.branches AS branch
  WHERE branch.id = v_device.branch_id
    AND branch.organization_id = v_device.organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'no_data_found',
      MESSAGE = 'Cawangan tablet tidak dijumpai.';
  END IF;

  IF v_device.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Hanya tablet rasmi aktif boleh didaftarkan semula.';
  END IF;

  IF v_branch_code IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Pendaftaran semula UAT dikunci kepada BR001.';
  END IF;

  IF v_device.asset_verified_at IS NULL
    OR v_device.asset_verified_by IS NULL
    OR length(btrim(COALESCE(v_device.serial_number, ''))) < 5
    OR COALESCE(v_device.imei, '') !~ '^[0-9]{15}$'
    OR v_device.metadata->>'official_hardware_profile' NOT IN (
      'SAMSUNG_TAB_S10_LITE_5G_128',
      'HONOR_PAD_X8B_LTE_256'
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Lengkapkan dan sahkan rekod aset tablet sebelum menjana semula kod.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_online_payments AS payment
    WHERE payment.organization_id = v_device.organization_id
      AND payment.branch_id = v_device.branch_id
      AND payment.provider = 'fiuu_vt'
      AND payment.status IN ('PENDING', 'REPORTED')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Selesaikan bayaran Fiuu VT yang belum selesai sebelum daftar semula tablet.';
  END IF;

  UPDATE public.pos_devices AS device
  SET status = 'PENDING',
      secret_hash = NULL,
      enrollment_code_hash = p_enrollment_code_hash,
      enrollment_expires_at = p_enrollment_expires_at,
      enrollment_used_at = NULL,
      enrolled_at = NULL,
      enrolled_by = NULL,
      updated_at = clock_timestamp()
  WHERE device.id = v_device.id
    AND device.organization_id = v_device.organization_id
    AND device.status = 'ACTIVE'
  RETURNING
    device.id,
    device.device_code,
    device.device_name,
    device.branch_id,
    device.status,
    device.enrollment_expires_at
  INTO
    id,
    device_code,
    device_name,
    branch_id,
    status,
    enrollment_expires_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'serialization_failure',
      MESSAGE = 'Status tablet telah berubah. Muat semula dan cuba lagi.';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    v_device.organization_id,
    p_actor_id,
    'REENROLL_POS_DEVICE',
    'pos_device',
    v_device.id,
    jsonb_build_object(
      'status', v_device.status,
      'branch_code', v_branch_code,
      'enrolled_at', v_device.enrolled_at,
      'enrolled_by', v_device.enrolled_by,
      'enrollment_used_at', v_device.enrollment_used_at
    ),
    jsonb_build_object(
      'status', 'PENDING',
      'branch_code', v_branch_code,
      'reason', 'BR001_UAT_REENROLL',
      'enrollment_expires_at', p_enrollment_expires_at
    )
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.request_br001_pos_device_reenrollment(
  UUID,
  UUID,
  UUID,
  TEXT,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_br001_pos_device_reenrollment(
  UUID,
  UUID,
  UUID,
  TEXT,
  TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.request_br001_pos_device_reenrollment(
  UUID,
  UUID,
  UUID,
  TEXT,
  TIMESTAMPTZ
) IS 'Atomically rotates only the verified active BR001 POS tablet when no Fiuu VT payment is unresolved.';
