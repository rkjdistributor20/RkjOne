-- Fail closed when an RKJ organization is not active, without seeding or
-- changing any Fiuu OPA rollout row. Existing issued payment intents continue
-- to use the configuration-generation matcher from the base migration.

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.organizations') IS NULL
    OR pg_catalog.to_regclass('public.branches') IS NULL
    OR pg_catalog.to_regclass('public.pos_fiuu_opa_branch_rollouts') IS NULL
    OR pg_catalog.to_regprocedure(
      'public.guard_pos_fiuu_opa_branch_rollout()'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.is_pos_fiuu_opa_branch_active(uuid,uuid,text,text,text,text,text,text)'
    ) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA organization-gate prerequisites are missing';
  END IF;

END;
$$;

CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_opa_branch_rollout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_branch_organization_id UUID;
  v_branch_code TEXT;
  v_branch_status TEXT;
  v_organization_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'New Fiuu OPA rollout rows must start in DRAFT';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu OPA rollout organization, branch and creation time are immutable';
    END IF;

    IF NEW.configuration_sha256 IS DISTINCT FROM OLD.configuration_sha256
      AND NOT (OLD.status = 'DRAFT' AND NEW.status = 'DRAFT') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu OPA configuration fingerprint may only be corrected while DRAFT';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status
      AND (
        NEW.verified_at IS DISTINCT FROM OLD.verified_at
        OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
        OR NEW.draining_at IS DISTINCT FROM OLD.draining_at
        OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu OPA rollout lifecycle timestamps are server-managed';
    END IF;

    IF OLD.status = 'REVOKED' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Revoked Fiuu OPA rollout rows are immutable';
    END IF;

    IF NOT (
      NEW.status IS NOT DISTINCT FROM OLD.status
      OR (OLD.status = 'DRAFT' AND NEW.status IN ('VERIFIED', 'REVOKED'))
      OR (OLD.status = 'VERIFIED' AND NEW.status IN ('ACTIVE', 'REVOKED'))
      OR (OLD.status = 'ACTIVE' AND NEW.status = 'DRAINING')
      OR (OLD.status = 'DRAINING' AND NEW.status = 'REVOKED')
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Invalid Fiuu OPA rollout status transition';
    END IF;

    IF OLD.status = 'DRAINING'
      AND NEW.status = 'REVOKED'
      AND EXISTS (
        SELECT 1
        FROM public.pos_online_payments AS payment
        WHERE payment.organization_id = OLD.organization_id
          AND payment.branch_id = OLD.branch_id
          AND payment.provider = 'fiuu'
          AND payment.sale_payload->>'fiuu_configuration_sha256'
            IS NOT DISTINCT FROM OLD.configuration_sha256
          AND (
            payment.status IN ('PENDING', 'REPORTED')
            OR (
              payment.status = 'EXPIRED'
              AND payment.expires_at IS NOT NULL
              AND payment.expires_at + INTERVAL '20 minutes' > now()
            )
          )
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Draining Fiuu OPA rollout cannot be revoked while a payment is unresolved';
    END IF;
  END IF;

  SELECT
    branch.organization_id,
    upper(btrim(branch.branch_code)),
    branch.status::TEXT,
    organization.status::TEXT
  INTO
    v_branch_organization_id,
    v_branch_code,
    v_branch_status,
    v_organization_status
  FROM public.branches AS branch
  JOIN public.organizations AS organization
    ON organization.id = branch.organization_id
  WHERE branch.id = NEW.branch_id
  FOR SHARE OF branch, organization;

  IF NOT FOUND
    OR v_branch_organization_id IS DISTINCT FROM NEW.organization_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout requires a matching canonical BR001-BR036 branch';
  END IF;

  IF NEW.status = 'ACTIVE'
    AND v_organization_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout requires an active RKJ organization';
  END IF;

  IF NEW.status = 'ACTIVE' AND v_branch_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout requires an active RKJ branch';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'VERIFIED' THEN
      NEW.verified_at := now();
      NEW.activated_at := NULL;
      NEW.draining_at := NULL;
      NEW.revoked_at := NULL;
    ELSIF NEW.status = 'ACTIVE' THEN
      NEW.verified_at := OLD.verified_at;
      NEW.activated_at := now();
      NEW.draining_at := NULL;
      NEW.revoked_at := NULL;
    ELSIF NEW.status = 'DRAINING' THEN
      NEW.verified_at := OLD.verified_at;
      NEW.activated_at := OLD.activated_at;
      NEW.draining_at := now();
      NEW.revoked_at := NULL;
    ELSIF NEW.status = 'REVOKED' THEN
      NEW.verified_at := OLD.verified_at;
      NEW.activated_at := OLD.activated_at;
      NEW.draining_at := OLD.draining_at;
      NEW.revoked_at := now();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_opa_branch_rollout()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_pos_fiuu_opa_branch_active(
  p_organization_id UUID,
  p_branch_id UUID,
  p_branch_code TEXT,
  p_environment TEXT,
  p_application_code TEXT,
  p_store_id TEXT,
  p_terminal_id TEXT,
  p_credential_version TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_organization_id IS NULL
    OR p_branch_id IS NULL
    OR p_branch_code IS NULL
    OR p_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR p_environment IS NULL
    OR p_environment NOT IN ('sandbox', 'production')
    OR NULLIF(btrim(p_application_code), '') IS NULL
    OR length(p_application_code) > 32
    OR p_application_code ~ '[[:cntrl:]]'
    OR p_store_id IS NULL
    OR p_store_id !~ '^[A-Za-z0-9_-]{4,20}$'
    OR p_terminal_id IS NULL
    OR p_terminal_id !~ '^[A-Za-z0-9_-]{4,20}$'
    OR p_credential_version IS NULL
    OR p_credential_version !~ '^[A-Za-z0-9._-]{1,32}$' THEN
    RETURN false;
  END IF;

  PERFORM rollout.branch_id
  FROM public.pos_fiuu_opa_branch_rollouts AS rollout
  JOIN public.branches AS branch
    ON branch.id = rollout.branch_id
   AND branch.organization_id = rollout.organization_id
  JOIN public.organizations AS organization
    ON organization.id = rollout.organization_id
  WHERE rollout.organization_id = p_organization_id
    AND rollout.branch_id = p_branch_id
    AND rollout.status = 'ACTIVE'
    AND rollout.configuration_sha256 = encode(
      extensions.digest(
        'fiuu-opa-config:v1'
          || pg_catalog.chr(31) || p_environment
          || pg_catalog.chr(31) || p_application_code
          || pg_catalog.chr(31) || p_store_id
          || pg_catalog.chr(31) || p_terminal_id
          || pg_catalog.chr(31) || p_credential_version,
        'sha256'
      ),
      'hex'
    )
    AND organization.status::TEXT = 'ACTIVE'
    AND branch.status::TEXT = 'ACTIVE'
    AND upper(btrim(branch.branch_code)) = p_branch_code
  FOR SHARE OF rollout, branch, organization;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.is_pos_fiuu_opa_branch_active(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pos_fiuu_opa_branch_active(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.is_pos_fiuu_opa_branch_active(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'Fail-closed new-payment gate requiring an ACTIVE rollout generation, branch and organization.';
