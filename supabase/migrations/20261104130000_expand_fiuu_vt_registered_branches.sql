-- Expand Fiuu VT App-to-App from the BR001 UAT boundary to BR001-BR036.
-- Configuration alone never makes a branch payment-ready: every live VT
-- intent is bound to one active, verified official tablet and its current
-- enrollment generation. Branch tablets remain fail-closed until HQ records
-- the physical asset and the branch registers it with a one-time code.

BEGIN;

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS enrollment_generation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.pos_devices
  DROP CONSTRAINT IF EXISTS pos_devices_enrollment_generation_nonnegative;
ALTER TABLE public.pos_devices
  ADD CONSTRAINT pos_devices_enrollment_generation_nonnegative
  CHECK (enrollment_generation >= 0);

COMMENT ON COLUMN public.pos_devices.enrollment_generation IS
  'Monotonic credential generation. Every successful enrollment increments it so old VT intents cannot cross device rotations.';

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_br001_payload;
ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_branch_payload;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_branch_payload
  CHECK (
    provider <> 'fiuu_vt'
    OR (
      jsonb_typeof(sale_payload) = 'object'
      AND sale_payload->>'fiuu_branch_code' ~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
      AND length(btrim(COALESCE(sale_payload->>'fiuu_device_code', ''))) > 0
    )
  ) NOT VALID;

-- Preserve an unresolved BR001 intent across this migration only when its
-- legacy device code resolves unambiguously to the currently active tablet.
UPDATE public.pos_online_payments AS payment
SET sale_payload = jsonb_set(
    jsonb_set(
      payment.sale_payload,
      '{fiuu_device_id}',
      to_jsonb(device.id::TEXT),
      true
    ),
    '{fiuu_enrollment_generation}',
    to_jsonb(device.enrollment_generation),
    true
  ),
  updated_at = clock_timestamp()
FROM public.pos_devices AS device
WHERE payment.provider = 'fiuu_vt'
  AND payment.status IN ('PENDING', 'REPORTED')
  AND payment.organization_id = device.organization_id
  AND payment.branch_id = device.branch_id
  AND payment.sale_payload->>'fiuu_device_code' = device.device_code
  AND device.status = 'ACTIVE'
  AND (
    NULLIF(payment.sale_payload->>'fiuu_device_id', '') IS NULL
    OR NULLIF(payment.sale_payload->>'fiuu_enrollment_generation', '') IS NULL
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_online_payments AS payment
    WHERE payment.provider = 'fiuu_vt'
      AND payment.status IN ('PENDING', 'REPORTED')
      AND (
        COALESCE(payment.sale_payload->>'fiuu_device_id', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        OR COALESCE(payment.sale_payload->>'fiuu_enrollment_generation', '') !~ '^[0-9]{1,10}$'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Resolve legacy Fiuu VT payments before expanding the registered-device rollout';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_vt_branch_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_branch_code TEXT;
  v_branch_status TEXT;
  v_shift_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.provider = 'fiuu_vt' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.amount_rm IS DISTINCT FROM OLD.amount_rm
      OR NEW.sale_payload IS DISTINCT FROM OLD.sale_payload
      OR NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT branch and registered-device identity are immutable';
    END IF;
  END IF;

  IF NEW.provider = 'fiuu_vt' THEN
    IF TG_OP = 'UPDATE' AND OLD.provider IS DISTINCT FROM 'fiuu_vt' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'An existing payment cannot be converted into Fiuu VT';
    END IF;

    SELECT upper(btrim(branch.branch_code)), branch.status::TEXT
    INTO v_branch_code, v_branch_status
    FROM public.branches AS branch
    WHERE branch.id = NEW.branch_id
      AND branch.organization_id = NEW.organization_id;

    IF v_branch_code IS NULL
      OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
      OR NEW.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment branch does not match BR001-BR036';
    END IF;

    IF NEW.sale_payload->>'branchId' IS DISTINCT FROM NEW.branch_id::TEXT
      OR NEW.sale_payload->>'shiftId' IS DISTINCT FROM NEW.shift_id::TEXT
      OR COALESCE(NEW.sale_payload->>'qr_amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment payload does not match its branch, shift or amount';
    END IF;

    IF round((NEW.sale_payload->>'qr_amount')::NUMERIC, 2)
      IS DISTINCT FROM round(NEW.amount_rm, 2) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment payload does not match its branch, shift or amount';
    END IF;

    SELECT shift.status::TEXT
    INTO v_shift_status
    FROM public.pos_shifts AS shift
    WHERE shift.id = NEW.shift_id
      AND shift.organization_id = NEW.organization_id
      AND shift.branch_id = NEW.branch_id;

    IF v_shift_status IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment requires a matching POS shift';
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'PENDING'
        OR v_branch_status IS DISTINCT FROM 'ACTIVE'
        OR v_shift_status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'check_violation',
          MESSAGE = 'A new Fiuu VT payment requires an active branch and open shift';
      END IF;

      PERFORM shift.id
      FROM public.pos_shifts AS shift
      WHERE shift.id = NEW.shift_id
        AND shift.organization_id = NEW.organization_id
        AND shift.branch_id = NEW.branch_id
        AND shift.status = 'OPEN'
      FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'check_violation',
          MESSAGE = 'The Fiuu VT shift changed before payment creation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_vt_branch_payment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_fiuu_vt_br001_payment
  ON public.pos_online_payments;
DROP TRIGGER IF EXISTS guard_pos_fiuu_vt_branch_payment
  ON public.pos_online_payments;
CREATE TRIGGER guard_pos_fiuu_vt_branch_payment
BEFORE INSERT OR UPDATE ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_vt_branch_payment();

DROP FUNCTION IF EXISTS public.guard_pos_fiuu_vt_br001_payment();

CREATE OR REPLACE FUNCTION public.guard_fiuu_vt_payment_active_device()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_device_id UUID;
  v_payload_device_id UUID;
  v_generation INTEGER;
BEGIN
  IF NEW.provider = 'fiuu_vt'
    AND (
      TG_OP = 'INSERT'
      OR NEW.status IN ('PENDING', 'REPORTED')
      OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'PAID')
    ) THEN
    IF COALESCE(NEW.sale_payload->>'fiuu_device_id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      OR COALESCE(NEW.sale_payload->>'fiuu_enrollment_generation', '') !~ '^[0-9]{1,10}$'
      OR length(NEW.sale_payload->>'fiuu_enrollment_generation') > 10 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment is missing registered-device identity';
    END IF;

    BEGIN
      v_payload_device_id := (NEW.sale_payload->>'fiuu_device_id')::UUID;
      v_generation := (NEW.sale_payload->>'fiuu_enrollment_generation')::INTEGER;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING
          ERRCODE = 'check_violation',
          MESSAGE = 'Fiuu VT registered-device identity is invalid';
    END;

    SELECT device.id
    INTO v_device_id
    FROM public.pos_devices AS device
    JOIN public.branches AS branch
      ON branch.id = device.branch_id
      AND branch.organization_id = device.organization_id
    JOIN public.organizations AS tenant
      ON tenant.id = device.organization_id
    WHERE device.id = v_payload_device_id
      AND device.organization_id = NEW.organization_id
      AND device.branch_id = NEW.branch_id
      AND device.device_code = NEW.sale_payload->>'fiuu_device_code'
      AND device.enrollment_generation = v_generation
      AND device.status = 'ACTIVE'
      AND device.asset_verified_at IS NOT NULL
      AND device.asset_verified_by IS NOT NULL
      AND length(btrim(COALESCE(device.serial_number, ''))) BETWEEN 5 AND 64
      AND COALESCE(device.imei, '') ~ '^[0-9]{15}$'
      AND device.metadata->>'official_hardware_profile' IN (
        'SAMSUNG_TAB_S10_LITE_5G_128',
        'HONOR_PAD_X8B_LTE_256'
      )
      AND (TG_OP <> 'INSERT' OR branch.status::TEXT = 'ACTIVE')
      AND upper(btrim(branch.branch_code)) ~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
      AND upper(btrim(branch.branch_code)) = NEW.sale_payload->>'fiuu_branch_code'
      AND (TG_OP <> 'INSERT' OR tenant.status::TEXT = 'ACTIVE')
    FOR SHARE OF device, branch, tenant;

    IF v_device_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT payment requires this branch current verified official tablet';
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

CREATE OR REPLACE FUNCTION public.guard_pos_device_unresolved_fiuu_vt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_has_unresolved BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_online_payments AS payment
    WHERE payment.provider = 'fiuu_vt'
      AND payment.status IN ('PENDING', 'REPORTED')
      AND payment.organization_id = OLD.organization_id
      AND payment.branch_id = OLD.branch_id
      AND (
        payment.sale_payload->>'fiuu_device_id' = OLD.id::TEXT
        OR (
          NULLIF(payment.sale_payload->>'fiuu_device_id', '') IS NULL
          AND payment.sale_payload->>'fiuu_device_code' = OLD.device_code
        )
      )
  ) INTO v_has_unresolved;

  IF NOT v_has_unresolved THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'A tablet with unresolved Fiuu VT payments cannot be deleted';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.device_code IS DISTINCT FROM OLD.device_code
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash
    OR NEW.enrollment_code_hash IS DISTINCT FROM OLD.enrollment_code_hash
    OR NEW.enrollment_generation IS DISTINCT FROM OLD.enrollment_generation
    OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
    OR NEW.imei IS DISTINCT FROM OLD.imei
    OR NEW.asset_verified_at IS DISTINCT FROM OLD.asset_verified_at
    OR NEW.asset_verified_by IS DISTINCT FROM OLD.asset_verified_by
    OR NEW.metadata->>'official_hardware_profile'
      IS DISTINCT FROM OLD.metadata->>'official_hardware_profile' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Tablet identity cannot change while a Fiuu VT payment is unresolved';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_device_unresolved_fiuu_vt()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_device_unresolved_fiuu_vt
  ON public.pos_devices;
CREATE TRIGGER guard_pos_device_unresolved_fiuu_vt
BEFORE UPDATE OR DELETE ON public.pos_devices
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_device_unresolved_fiuu_vt();

DROP FUNCTION IF EXISTS public.request_br001_pos_device_reenrollment(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.request_pos_device_reenrollment(
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
  enrollment_generation INTEGER,
  enrollment_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_branch_code TEXT;
  v_branch_status TEXT;
  v_actor_role TEXT;
BEGIN
  IF p_device_id IS NULL
    OR p_organization_id IS NULL
    OR p_actor_id IS NULL
    OR COALESCE(p_enrollment_code_hash, '') !~ '^[0-9a-f]{64}$'
    OR p_enrollment_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = 'Maklumat pendaftaran semula tablet tidak sah.';
  END IF;

  SELECT actor.role::TEXT
  INTO v_actor_role
  FROM public.profiles AS actor
  JOIN public.organizations AS tenant
    ON tenant.id = actor.organization_id
    AND tenant.status::TEXT = 'ACTIVE'
  WHERE actor.id = p_actor_id
    AND actor.organization_id = p_organization_id
    AND actor.status::TEXT = 'ACTIVE';

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('SUPER_ADMIN', 'ADMIN') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Akses pentadbir diperlukan untuk daftar semula tablet.';
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

  SELECT upper(btrim(branch.branch_code)), branch.status::TEXT
  INTO v_branch_code, v_branch_status
  FROM public.branches AS branch
  WHERE branch.id = v_device.branch_id
    AND branch.organization_id = v_device.organization_id
  FOR SHARE;

  IF v_branch_code IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'no_data_found',
      MESSAGE = 'Cawangan tablet tidak dijumpai.';
  END IF;

  IF v_device.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Hanya tablet rasmi aktif boleh didaftarkan semula.';
  END IF;

  IF v_branch_status IS DISTINCT FROM 'ACTIVE'
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Pendaftaran semula VT hanya dibenarkan untuk cawangan aktif BR001-BR036.';
  END IF;

  IF v_device.asset_verified_at IS NULL
    OR v_device.asset_verified_by IS NULL
    OR length(btrim(COALESCE(v_device.serial_number, ''))) < 5
    OR COALESCE(v_device.imei, '') !~ '^[0-9]{15}$'
    OR COALESCE(v_device.metadata->>'official_hardware_profile', '') NOT IN (
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
    device.enrollment_generation,
    device.enrollment_expires_at
  INTO
    id,
    device_code,
    device_name,
    branch_id,
    status,
    enrollment_generation,
    enrollment_expires_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'serialization_failure',
      MESSAGE = 'Status tablet telah berubah. Muat semula dan cuba lagi.';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_device.organization_id,
    p_actor_id,
    'REENROLL_POS_DEVICE',
    'pos_device',
    v_device.id,
    jsonb_build_object(
      'status', v_device.status,
      'branch_code', v_branch_code,
      'enrollment_generation', v_device.enrollment_generation,
      'enrolled_at', v_device.enrolled_at,
      'enrolled_by', v_device.enrolled_by,
      'enrollment_used_at', v_device.enrollment_used_at
    ),
    jsonb_build_object(
      'status', 'PENDING',
      'branch_code', v_branch_code,
      'enrollment_generation', v_device.enrollment_generation,
      'reason', 'FIUU_VT_FLEET_REENROLL',
      'enrollment_expires_at', p_enrollment_expires_at
    )
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.request_pos_device_reenrollment(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_pos_device_reenrollment(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) TO service_role;

-- Compatibility wrapper for an in-flight BR001 Preview deployment. It keeps
-- the former signature and former BR001-only meaning while new application
-- versions call the fleet RPC above.
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
  v_branch_code TEXT;
BEGIN
  SELECT upper(btrim(branch.branch_code))
  INTO v_branch_code
  FROM public.pos_devices AS device
  JOIN public.branches AS branch
    ON branch.id = device.branch_id
    AND branch.organization_id = device.organization_id
  WHERE device.id = p_device_id
    AND device.organization_id = p_organization_id;

  IF v_branch_code IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Legacy tablet reenrollment is restricted to BR001.';
  END IF;

  RETURN QUERY
  SELECT
    rollout.id,
    rollout.device_code,
    rollout.device_name,
    rollout.branch_id,
    rollout.status,
    rollout.enrollment_expires_at
  FROM public.request_pos_device_reenrollment(
    p_device_id,
    p_organization_id,
    p_actor_id,
    p_enrollment_code_hash,
    p_enrollment_expires_at
  ) AS rollout;
END;
$$;

REVOKE ALL ON FUNCTION public.request_br001_pos_device_reenrollment(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_br001_pos_device_reenrollment(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_pos_device_enrollment(
  p_device_id UUID,
  p_organization_id UUID,
  p_actor_id UUID,
  p_enrollment_code_hash TEXT,
  p_secret_hash TEXT
)
RETURNS TABLE (
  id UUID,
  device_code TEXT,
  device_name TEXT,
  branch_id UUID,
  status TEXT,
  enrollment_generation INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_device public.pos_devices%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_branch_code TEXT;
  v_branch_status TEXT;
  v_branch_region_id UUID;
  v_new_generation INTEGER;
BEGIN
  IF p_device_id IS NULL
    OR p_organization_id IS NULL
    OR p_actor_id IS NULL
    OR COALESCE(p_enrollment_code_hash, '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(p_secret_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = 'Maklumat pengaktifan tablet tidak sah.';
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

  IF v_device.status IS DISTINCT FROM 'PENDING'
    OR v_device.enrollment_code_hash IS DISTINCT FROM p_enrollment_code_hash
    OR v_device.enrollment_expires_at IS NULL
    OR v_device.enrollment_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Kod pendaftaran tidak sah, telah digunakan atau telah tamat.';
  END IF;

  SELECT actor.*
  INTO v_actor
  FROM public.profiles AS actor
  JOIN public.organizations AS tenant
    ON tenant.id = actor.organization_id
    AND tenant.status::TEXT = 'ACTIVE'
  WHERE actor.id = p_actor_id
    AND actor.organization_id = p_organization_id
    AND actor.status::TEXT = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Akaun aktif organisasi diperlukan untuk daftar tablet.';
  END IF;

  SELECT upper(btrim(branch.branch_code)), branch.status::TEXT, branch.region_id
  INTO v_branch_code, v_branch_status, v_branch_region_id
  FROM public.branches AS branch
  WHERE branch.id = v_device.branch_id
    AND branch.organization_id = v_device.organization_id
  FOR SHARE;

  IF v_branch_code IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'no_data_found',
      MESSAGE = 'Cawangan tablet tidak dijumpai.';
  END IF;

  IF v_branch_status IS DISTINCT FROM 'ACTIVE'
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Tablet hanya boleh diaktifkan untuk cawangan aktif BR001-BR036.';
  END IF;

  IF v_actor.role::TEXT NOT IN (
      'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY'
    )
    AND v_actor.branch_id IS DISTINCT FROM v_device.branch_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.profile_branch_access AS access
      WHERE access.profile_id = v_actor.id
        AND access.branch_id = v_device.branch_id
    )
    AND NOT (
      v_actor.role::TEXT = 'AREA_MANAGER'
      AND v_actor.region_id IS NOT DISTINCT FROM v_branch_region_id
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Akaun ini tidak mempunyai akses kepada cawangan tablet.';
  END IF;

  IF v_device.asset_verified_at IS NULL
    OR v_device.asset_verified_by IS NULL
    OR length(btrim(COALESCE(v_device.serial_number, ''))) < 5
    OR COALESCE(v_device.imei, '') !~ '^[0-9]{15}$'
    OR COALESCE(v_device.metadata->>'official_hardware_profile', '') NOT IN (
      'SAMSUNG_TAB_S10_LITE_5G_128',
      'HONOR_PAD_X8B_LTE_256'
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'Aset tablet rasmi belum lengkap atau belum disahkan oleh HQ.';
  END IF;

  IF v_device.enrollment_generation = 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'numeric_value_out_of_range',
      MESSAGE = 'Generasi pendaftaran tablet telah mencapai had.';
  END IF;
  v_new_generation := v_device.enrollment_generation + 1;

  UPDATE public.pos_devices AS device
  SET status = 'ACTIVE',
      secret_hash = p_secret_hash,
      enrollment_code_hash = NULL,
      enrollment_used_at = clock_timestamp(),
      enrolled_at = clock_timestamp(),
      enrolled_by = p_actor_id,
      last_seen_at = clock_timestamp(),
      enrollment_generation = v_new_generation,
      updated_at = clock_timestamp()
  WHERE device.id = v_device.id
    AND device.organization_id = v_device.organization_id
    AND device.status = 'PENDING'
    AND device.enrollment_code_hash = p_enrollment_code_hash
  RETURNING
    device.id,
    device.device_code,
    device.device_name,
    device.branch_id,
    device.status,
    device.enrollment_generation
  INTO
    id,
    device_code,
    device_name,
    branch_id,
    status,
    enrollment_generation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'serialization_failure',
      MESSAGE = 'Kod pendaftaran telah digunakan pada peranti lain.';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_device.organization_id,
    p_actor_id,
    'ACTIVATE_POS_DEVICE',
    'pos_device',
    v_device.id,
    jsonb_build_object(
      'status', v_device.status,
      'branch_code', v_branch_code,
      'enrollment_generation', v_device.enrollment_generation
    ),
    jsonb_build_object(
      'status', 'ACTIVE',
      'branch_code', v_branch_code,
      'enrollment_generation', v_new_generation,
      'reason', 'REGISTERED_OFFICIAL_TABLET'
    )
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pos_device_enrollment(
  UUID, UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_pos_device_enrollment(
  UUID, UUID, UUID, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.request_pos_device_reenrollment(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) IS 'Rotates a verified official BR001-BR036 tablet only when no VT payment is unresolved.';

COMMENT ON FUNCTION public.activate_pos_device_enrollment(
  UUID, UUID, UUID, TEXT, TEXT
) IS 'Atomically activates a verified official branch tablet and increments its enrollment generation.';

ALTER TABLE public.pos_online_payments
  VALIDATE CONSTRAINT pos_online_payments_fiuu_vt_branch_payload;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.pos_online_payments'::REGCLASS
      AND t.tgname = 'guard_pos_fiuu_vt_branch_payment'
      AND t.tgenabled <> 'D'
      AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.pos_online_payments'::REGCLASS
      AND t.tgname = 'guard_fiuu_vt_payment_active_device'
      AND t.tgenabled <> 'D'
      AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.pos_devices'::REGCLASS
      AND t.tgname = 'guard_pos_device_unresolved_fiuu_vt'
      AND t.tgenabled <> 'D'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'object_not_in_prerequisite_state',
      MESSAGE = 'Fiuu VT fleet guards were not installed';
  END IF;
END;
$$;

COMMIT;
