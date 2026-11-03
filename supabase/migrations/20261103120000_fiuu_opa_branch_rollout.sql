-- Prepare fail-closed, database-controlled Fiuu OPA rollout by branch.
--
-- This migration does not seed or activate any branch. Fiuu VT App-to-App and
-- cloudECR keep their existing BR001-only boundaries. Only provider = 'fiuu'
-- (OPA Dynamic DuitNow QR) is generalized below.

BEGIN;

-- Serialize against payment creation and fail before any schema change when an
-- OPA payment can still receive a callback. The rollout table starts empty, so
-- installing its ACTIVE checks while such a payment exists would strand it.
LOCK TABLE public.pos_online_payments IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_payment_id UUID;
  v_payment_status TEXT;
BEGIN
  SELECT payment.id, payment.status
  INTO v_payment_id, v_payment_status
  FROM public.pos_online_payments AS payment
  WHERE payment.provider = 'fiuu'
    AND (
      payment.status IN ('PENDING', 'REPORTED')
      OR (
        payment.status = 'EXPIRED'
        AND payment.expires_at IS NOT NULL
        AND payment.expires_at + INTERVAL '20 minutes' > now()
      )
    )
  ORDER BY payment.created_at, payment.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'object_not_in_prerequisite_state',
      MESSAGE = 'Cannot install Fiuu OPA rollout authorization while a payment is unresolved',
      DETAIL = format(
        'payment_id %s has status %s; drain callbacks/reconciliation in manual mode before replaying this migration',
        v_payment_id,
        v_payment_status
      );
  END IF;
END;
$$;

-- Supabase installs pgcrypto in the extensions schema. Fail explicitly rather
-- than relying on a mutable search_path or on a public compatibility wrapper.
DO $$
BEGIN
  IF pg_catalog.to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'undefined_function',
      MESSAGE = 'Required pgcrypto function extensions.digest(text,text) is missing';
  END IF;
END;
$$;

-- The pre-existing shift guard is part of the security boundary. Reject a
-- missing, disabled/replica, retargeted, or otherwise drifted trigger
-- before replacing the owned definition below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS relation_schema
      ON relation_schema.oid = relation.relnamespace
    JOIN pg_catalog.pg_proc AS trigger_function
      ON trigger_function.oid = trigger_row.tgfoid
    JOIN pg_catalog.pg_namespace AS function_schema
      ON function_schema.oid = trigger_function.pronamespace
    JOIN pg_catalog.pg_attribute AS status_column
      ON status_column.attrelid = relation.oid
     AND status_column.attname = 'status'
     AND NOT status_column.attisdropped
    WHERE trigger_row.tgname = 'guard_pos_shift_close_pending_payments'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled IN ('O', 'A')
      AND relation_schema.nspname = 'public'
      AND relation.relname = 'pos_shifts'
      AND function_schema.nspname = 'public'
      AND trigger_function.proname = 'guard_pos_shift_close_pending_payments'
      AND trigger_row.tgtype = 19
      AND trigger_row.tgattr::TEXT = status_column.attnum::TEXT
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_shift_close_pending_payments'
      AND NOT trigger_row.tgisinternal
      AND NOT (
        trigger_row.tgrelid = 'public.pos_shifts'::regclass
        AND trigger_row.tgfoid = 'public.guard_pos_shift_close_pending_payments()'::regprocedure
        AND trigger_row.tgenabled IN ('O', 'A')
        AND trigger_row.tgtype = 19
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Existing POS shift-close payment guard trigger is missing, disabled, or drifted';
  END IF;
END;
$$;

-- Exact-once receipt precondition. Run this before any schema change so a
-- pre-existing duplicate fails the migration clearly; no row is deleted or
-- merged. The migration transaction rolls back in full on any later failure.
DO $$
DECLARE
  v_duplicate_transaction_id UUID;
  v_duplicate_count BIGINT;
BEGIN
  SELECT receipt.transaction_id, count(*)
  INTO v_duplicate_transaction_id, v_duplicate_count
  FROM public.pos_receipts AS receipt
  WHERE receipt.transaction_id IS NOT NULL
  GROUP BY receipt.transaction_id
  HAVING count(*) > 1
  ORDER BY receipt.transaction_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'unique_violation',
      MESSAGE = 'Cannot enforce one POS receipt per transaction',
      DETAIL = format(
        'transaction_id %s currently has %s receipts; resolve by an approved audit process before replaying this migration',
        v_duplicate_transaction_id,
        v_duplicate_count
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_receipts_one_per_transaction
  ON public.pos_receipts(transaction_id)
  WHERE transaction_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_relation
    JOIN pg_catalog.pg_namespace AS index_schema
      ON index_schema.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_index AS index_row
      ON index_row.indexrelid = index_relation.oid
    JOIN pg_catalog.pg_class AS table_relation
      ON table_relation.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS table_schema
      ON table_schema.oid = table_relation.relnamespace
    JOIN pg_catalog.pg_attribute AS key_column
      ON key_column.attrelid = table_relation.oid
     AND key_column.attnum = index_row.indkey[0]
     AND NOT key_column.attisdropped
    WHERE index_schema.nspname = 'public'
      AND index_relation.relname = 'uq_pos_receipts_one_per_transaction'
      AND table_schema.nspname = 'public'
      AND table_relation.relname = 'pos_receipts'
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 1
      AND key_column.attname = 'transaction_id'
      AND regexp_replace(
        pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid),
        '\s+',
        ' ',
        'g'
      ) = '(transaction_id IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Existing POS receipt uniqueness index is missing or has drifted';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.pos_fiuu_opa_branch_rollouts (
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  configuration_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CONSTRAINT pos_fiuu_opa_branch_rollouts_status_check
      CHECK (status IN ('DRAFT', 'VERIFIED', 'ACTIVE', 'DRAINING', 'REVOKED')),
  verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  draining_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pos_fiuu_opa_branch_rollouts_pkey
    PRIMARY KEY (organization_id, branch_id, configuration_sha256),
  CONSTRAINT pos_fiuu_opa_branch_rollouts_organization_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT pos_fiuu_opa_branch_rollouts_branch_fkey
    FOREIGN KEY (branch_id)
    REFERENCES public.branches(id) ON DELETE RESTRICT,
  CONSTRAINT pos_fiuu_opa_branch_rollouts_configuration_fingerprint_check
    CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pos_fiuu_opa_branch_rollouts_lifecycle_check CHECK (
    (status = 'DRAFT'
      AND verified_at IS NULL
      AND activated_at IS NULL
      AND draining_at IS NULL
      AND revoked_at IS NULL)
    OR (status = 'VERIFIED'
      AND verified_at IS NOT NULL
      AND activated_at IS NULL
      AND draining_at IS NULL
      AND revoked_at IS NULL)
    OR (status = 'ACTIVE'
      AND verified_at IS NOT NULL
      AND activated_at IS NOT NULL
      AND draining_at IS NULL
      AND revoked_at IS NULL)
    OR (status = 'DRAINING'
      AND verified_at IS NOT NULL
      AND activated_at IS NOT NULL
      AND draining_at IS NOT NULL
      AND revoked_at IS NULL)
    OR (status = 'REVOKED'
      AND revoked_at IS NOT NULL)
  )
);

-- CREATE TABLE IF NOT EXISTS must never accept a similarly named but
-- incompatible object. Assert the complete owned shape and constraints before
-- granting access or installing any trigger/function that relies on it.
DO $$
DECLARE
  v_table_oid OID := pg_catalog.to_regclass('public.pos_fiuu_opa_branch_rollouts');
BEGIN
  IF v_table_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS relation_schema
      ON relation_schema.oid = relation.relnamespace
    WHERE relation.oid = v_table_oid
      AND relation_schema.nspname = 'public'
      AND relation.relname = 'pos_fiuu_opa_branch_rollouts'
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout relation is missing or has an incompatible kind';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute AS column_row
    WHERE column_row.attrelid = v_table_oid
      AND column_row.attnum > 0
      AND NOT column_row.attisdropped
  ) <> 10 OR EXISTS (
    WITH expected(column_name, data_type, is_not_null) AS (
      VALUES
        ('organization_id', 'uuid', true),
        ('branch_id', 'uuid', true),
        ('configuration_sha256', 'text', true),
        ('status', 'text', true),
        ('verified_at', 'timestamp with time zone', false),
        ('activated_at', 'timestamp with time zone', false),
        ('draining_at', 'timestamp with time zone', false),
        ('revoked_at', 'timestamp with time zone', false),
        ('created_at', 'timestamp with time zone', true),
        ('updated_at', 'timestamp with time zone', true)
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_attribute AS actual
      ON actual.attrelid = v_table_oid
     AND actual.attname = expected.column_name
     AND actual.attnum > 0
     AND NOT actual.attisdropped
    WHERE actual.attname IS NULL
      OR pg_catalog.format_type(actual.atttypid, actual.atttypmod)
        IS DISTINCT FROM expected.data_type
      OR actual.attnotnull IS DISTINCT FROM expected.is_not_null
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout table columns have drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS column_row
    LEFT JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = column_row.attrelid
     AND default_row.adnum = column_row.attnum
    WHERE column_row.attrelid = v_table_oid
      AND column_row.attnum > 0
      AND NOT column_row.attisdropped
      AND (
        (column_row.attname = 'status'
          AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
            IS DISTINCT FROM '''DRAFT''::text')
        OR (column_row.attname IN ('created_at', 'updated_at')
          AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
            IS DISTINCT FROM 'now()')
        OR (column_row.attname NOT IN ('status', 'created_at', 'updated_at')
          AND default_row.oid IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout table defaults have drifted';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
  ) <> 6 OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND (
        constraint_row.conname NOT IN (
          'pos_fiuu_opa_branch_rollouts_pkey',
          'pos_fiuu_opa_branch_rollouts_organization_fkey',
          'pos_fiuu_opa_branch_rollouts_branch_fkey',
          'pos_fiuu_opa_branch_rollouts_status_check',
          'pos_fiuu_opa_branch_rollouts_configuration_fingerprint_check',
          'pos_fiuu_opa_branch_rollouts_lifecycle_check'
        )
        OR NOT constraint_row.convalidated
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout table constraints have drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND constraint_row.conname = 'pos_fiuu_opa_branch_rollouts_pkey'
      AND constraint_row.contype = 'p'
      AND (
        SELECT array_agg(column_row.attname::TEXT ORDER BY key_row.ordinality)
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS column_row
          ON column_row.attrelid = constraint_row.conrelid
         AND column_row.attnum = key_row.attnum
      ) = ARRAY['organization_id', 'branch_id', 'configuration_sha256']::TEXT[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND constraint_row.conname = 'pos_fiuu_opa_branch_rollouts_organization_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.organizations'::regclass
      AND constraint_row.confdeltype = 'r'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND constraint_row.conname = 'pos_fiuu_opa_branch_rollouts_branch_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.branches'::regclass
      AND constraint_row.confdeltype = 'r'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND constraint_row.conname = 'pos_fiuu_opa_branch_rollouts_status_check'
      AND constraint_row.contype = 'c'
      AND pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
        ~ 'status.*DRAFT.*VERIFIED.*ACTIVE.*DRAINING.*REVOKED'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND constraint_row.conname = 'pos_fiuu_opa_branch_rollouts_configuration_fingerprint_check'
      AND constraint_row.contype = 'c'
      AND pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
        LIKE '%configuration_sha256%^[0-9a-f]{64}$%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = v_table_oid
      AND constraint_row.conname = 'pos_fiuu_opa_branch_rollouts_lifecycle_check'
      AND constraint_row.contype = 'c'
      AND pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
        ~ 'verified_at.*activated_at.*draining_at.*revoked_at'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout table constraint definitions have drifted';
  END IF;
END;
$$;

-- Preserve revoked configuration fingerprints for signed callback/replay validation while
-- allowing one new DRAFT generation after the previous generation is revoked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_fiuu_opa_branch_rollouts_current
  ON public.pos_fiuu_opa_branch_rollouts(organization_id, branch_id)
  WHERE status <> 'REVOKED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_relation
    JOIN pg_catalog.pg_namespace AS index_schema
      ON index_schema.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_index AS index_row
      ON index_row.indexrelid = index_relation.oid
    JOIN pg_catalog.pg_class AS table_relation
      ON table_relation.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS table_schema
      ON table_schema.oid = table_relation.relnamespace
    WHERE index_schema.nspname = 'public'
      AND index_relation.relname = 'uq_pos_fiuu_opa_branch_rollouts_current'
      AND table_schema.nspname = 'public'
      AND table_relation.relname = 'pos_fiuu_opa_branch_rollouts'
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 2
      AND (
        SELECT array_agg(column_row.attname::TEXT ORDER BY key_row.ordinality)
        FROM unnest(index_row.indkey) WITH ORDINALITY AS key_row(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS column_row
          ON column_row.attrelid = table_relation.oid
         AND column_row.attnum = key_row.attnum
        WHERE key_row.ordinality <= index_row.indnkeyatts
      ) = ARRAY['organization_id', 'branch_id']::TEXT[]
      AND regexp_replace(
        pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid),
        '\s+',
        ' ',
        'g'
      ) = '(status <> ''REVOKED''::text)'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Existing Fiuu OPA current-generation index is missing or has drifted';
  END IF;
END;
$$;

COMMENT ON TABLE public.pos_fiuu_opa_branch_rollouts IS
  'Fail-closed OPA rollout generations keyed by a non-secret full configuration fingerprint; contains no provider credential or secret.';

ALTER TABLE public.pos_fiuu_opa_branch_rollouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_fiuu_opa_branch_rollouts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.pos_fiuu_opa_branch_rollouts TO service_role;

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
    branch.status::TEXT
  INTO
    v_branch_organization_id,
    v_branch_code,
    v_branch_status
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id
  FOR SHARE;

  IF NOT FOUND
    OR v_branch_organization_id IS DISTINCT FROM NEW.organization_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout requires a matching canonical BR001-BR036 branch';
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_branch_rollout'
      AND NOT trigger_row.tgisinternal
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_branch_rollout'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgrelid = 'public.pos_fiuu_opa_branch_rollouts'::regclass
      AND trigger_row.tgfoid = 'public.guard_pos_fiuu_opa_branch_rollout()'::regprocedure
      AND trigger_row.tgenabled IN ('O', 'A')
      AND trigger_row.tgtype = 23
      AND btrim(trigger_row.tgattr::TEXT) = ''
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Existing Fiuu OPA rollout guard trigger is disabled or drifted';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS guard_pos_fiuu_opa_branch_rollout
  ON public.pos_fiuu_opa_branch_rollouts;

CREATE TRIGGER guard_pos_fiuu_opa_branch_rollout
BEFORE INSERT OR UPDATE ON public.pos_fiuu_opa_branch_rollouts
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_opa_branch_rollout();

CREATE OR REPLACE FUNCTION public.is_pos_fiuu_opa_branch_rollout_match(
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
  WHERE rollout.organization_id = p_organization_id
    AND rollout.branch_id = p_branch_id
    AND rollout.status IN ('ACTIVE', 'DRAINING', 'REVOKED')
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
    AND upper(btrim(branch.branch_code)) = p_branch_code
  FOR SHARE OF rollout, branch;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.is_pos_fiuu_opa_branch_rollout_match(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pos_fiuu_opa_branch_rollout_match(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

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
    AND branch.status::TEXT = 'ACTIVE'
    AND upper(btrim(branch.branch_code)) = p_branch_code
  FOR SHARE OF rollout, branch;

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

CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_opa_payment_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_branch_code TEXT;
  v_configuration_sha256 TEXT;
  v_rollout_binding_sha256 TEXT;
  v_requires_active BOOLEAN;
BEGIN
  v_requires_active := TG_OP = 'INSERT';

  IF TG_OP = 'UPDATE' AND OLD.provider = 'fiuu' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.sale_payload->>'branchId'
        IS DISTINCT FROM OLD.sale_payload->>'branchId'
      OR NEW.sale_payload->>'fiuu_branch_code'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_branch_code'
      OR NEW.sale_payload->>'fiuu_environment'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_environment'
      OR NEW.sale_payload->>'fiuu_application_code'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_application_code'
      OR NEW.sale_payload->>'fiuu_store_id'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_store_id'
      OR NEW.sale_payload->>'fiuu_terminal_id'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_terminal_id'
      OR NEW.sale_payload->>'fiuu_credential_version'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_credential_version'
      OR NEW.sale_payload->>'fiuu_configuration_sha256'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_configuration_sha256'
      OR NEW.sale_payload->>'fiuu_rollout_binding_sha256'
        IS DISTINCT FROM OLD.sale_payload->>'fiuu_rollout_binding_sha256' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu OPA payment rollout identity is immutable';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_requires_active := OLD.provider IS DISTINCT FROM 'fiuu';
  END IF;

  IF NEW.provider = 'fiuu' THEN
    NULL;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL
    OR NEW.branch_id IS NULL
    OR jsonb_typeof(NEW.sale_payload) IS DISTINCT FROM 'object'
    OR NEW.sale_payload->>'branchId' IS DISTINCT FROM NEW.branch_id::TEXT
    OR COALESCE(NEW.sale_payload->>'fiuu_branch_code', '')
      !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR COALESCE(NEW.sale_payload->>'fiuu_environment', '')
      NOT IN ('sandbox', 'production')
    OR NULLIF(btrim(NEW.sale_payload->>'fiuu_application_code'), '') IS NULL
    OR length(NEW.sale_payload->>'fiuu_application_code') > 32
    OR NEW.sale_payload->>'fiuu_application_code' ~ '[[:cntrl:]]'
    OR COALESCE(NEW.sale_payload->>'fiuu_store_id', '')
      !~ '^[A-Za-z0-9_-]{4,20}$'
    OR COALESCE(NEW.sale_payload->>'fiuu_terminal_id', '')
      !~ '^[A-Za-z0-9_-]{4,20}$'
    OR COALESCE(NEW.sale_payload->>'fiuu_credential_version', '')
      !~ '^[A-Za-z0-9._-]{1,32}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA payment rollout identity is invalid';
  END IF;

  v_configuration_sha256 := encode(
    extensions.digest(
      'fiuu-opa-config:v1'
        || pg_catalog.chr(31) || NEW.sale_payload->>'fiuu_environment'
        || pg_catalog.chr(31) || NEW.sale_payload->>'fiuu_application_code'
        || pg_catalog.chr(31) || NEW.sale_payload->>'fiuu_store_id'
        || pg_catalog.chr(31) || NEW.sale_payload->>'fiuu_terminal_id'
        || pg_catalog.chr(31) || NEW.sale_payload->>'fiuu_credential_version',
      'sha256'
    ),
    'hex'
  );

  IF NEW.sale_payload ? 'fiuu_configuration_sha256'
    AND NEW.sale_payload->>'fiuu_configuration_sha256'
      IS DISTINCT FROM v_configuration_sha256 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA payment configuration fingerprint is invalid';
  END IF;

  NEW.sale_payload := jsonb_set(
    NEW.sale_payload,
    '{fiuu_configuration_sha256}',
    to_jsonb(v_configuration_sha256),
    true
  );

  -- Persist a database-derived, non-secret binding of the complete intent
  -- identity. The binding includes the canonical full-configuration hash so
  -- neither a credential generation nor a terminal mapping can be substituted.
  v_rollout_binding_sha256 := encode(
    extensions.digest(
      'fiuu-opa-binding:v1'
        || pg_catalog.chr(31) || NEW.organization_id::TEXT
        || pg_catalog.chr(31) || NEW.branch_id::TEXT
        || pg_catalog.chr(31) || NEW.sale_payload->>'fiuu_branch_code'
        || pg_catalog.chr(31) || v_configuration_sha256,
      'sha256'
    ),
    'hex'
  );

  IF NEW.sale_payload ? 'fiuu_rollout_binding_sha256'
    AND NEW.sale_payload->>'fiuu_rollout_binding_sha256'
      IS DISTINCT FROM v_rollout_binding_sha256 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA payment rollout binding is invalid';
  END IF;

  NEW.sale_payload := jsonb_set(
    NEW.sale_payload,
    '{fiuu_rollout_binding_sha256}',
    to_jsonb(v_rollout_binding_sha256),
    true
  );

  SELECT upper(btrim(branch.branch_code))
  INTO v_branch_code
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id
    AND branch.organization_id = NEW.organization_id
  FOR SHARE;

  IF NOT FOUND
    OR v_branch_code IS DISTINCT FROM NEW.sale_payload->>'fiuu_branch_code' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA payment requires a matching canonical branch';
  END IF;

  IF v_requires_active THEN
    IF NOT public.is_pos_fiuu_opa_branch_active(
      NEW.organization_id,
      NEW.branch_id,
      v_branch_code,
      NEW.sale_payload->>'fiuu_environment',
      NEW.sale_payload->>'fiuu_application_code',
      NEW.sale_payload->>'fiuu_store_id',
      NEW.sale_payload->>'fiuu_terminal_id',
      NEW.sale_payload->>'fiuu_credential_version'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu OPA payment requires one matching ACTIVE rollout authorization';
    END IF;
  ELSIF NOT public.is_pos_fiuu_opa_branch_rollout_match(
    NEW.organization_id,
    NEW.branch_id,
    v_branch_code,
    NEW.sale_payload->>'fiuu_environment',
    NEW.sale_payload->>'fiuu_application_code',
    NEW.sale_payload->>'fiuu_store_id',
    NEW.sale_payload->>'fiuu_terminal_id',
    NEW.sale_payload->>'fiuu_credential_version'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA payment requires its matching rollout generation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_opa_payment_identity()
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_payment_identity'
      AND NOT trigger_row.tgisinternal
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_payment_identity'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgrelid = 'public.pos_online_payments'::regclass
      AND trigger_row.tgfoid = 'public.guard_pos_fiuu_opa_payment_identity()'::regprocedure
      AND trigger_row.tgenabled IN ('O', 'A')
      AND trigger_row.tgtype = 23
      AND (
        SELECT array_agg(column_row.attname::TEXT ORDER BY column_row.attname)
        FROM unnest(
          string_to_array(btrim(trigger_row.tgattr::TEXT), ' ')::SMALLINT[]
        ) AS trigger_column(attnum)
        JOIN pg_catalog.pg_attribute AS column_row
          ON column_row.attrelid = trigger_row.tgrelid
         AND column_row.attnum = trigger_column.attnum
      ) = ARRAY['branch_id', 'organization_id', 'provider', 'sale_payload']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Existing Fiuu OPA payment identity trigger is disabled or drifted';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS guard_pos_fiuu_opa_payment_identity
  ON public.pos_online_payments;

CREATE TRIGGER guard_pos_fiuu_opa_payment_identity
BEFORE INSERT OR UPDATE OF provider, organization_id, branch_id, sale_payload
ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_opa_payment_identity();

-- This migration contains no rollout INSERT or activation UPDATE. A first
-- install therefore remains empty/fail-closed, while replay preserves existing
-- DRAFT, VERIFIED, ACTIVE, DRAINING and REVOKED generations.

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_opa_inquiry(
  p_payment_id UUID,
  p_claim_token UUID,
  p_lease_seconds INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_shift_status TEXT;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt_no INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_payment_id IS NULL
    OR p_claim_token IS NULL
    OR p_lease_seconds < 20
    OR p_lease_seconds > 60 THEN
    RAISE EXCEPTION 'Invalid Fiuu OPA inquiry claim';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    shift.organization_id,
    shift.branch_id,
    shift.status::TEXT,
    upper(btrim(branch.branch_code))
  INTO
    v_shift_organization_id,
    v_shift_branch_id,
    v_shift_status,
    v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;

  IF NOT FOUND THEN
    UPDATE public.pos_online_payments AS payment
    SET fiuu_opa_reconcile_state = 'MANUAL_REVIEW',
        fiuu_opa_reconcile_next_at = NULL,
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE payment.id = p_payment_id
      AND payment.provider = 'fiuu'
      AND payment.sale_payload->>'fiuu_branch_code'
        ~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
      AND payment.sale_payload->>'branchId' = payment.branch_id::TEXT
      AND NULLIF(
        payment.sale_payload->>'fiuu_configuration_sha256',
        ''
      ) IS NOT NULL
      AND payment.sale_payload->>'fiuu_configuration_sha256' = encode(
        extensions.digest(
          'fiuu-opa-config:v1'
            || pg_catalog.chr(31) || payment.sale_payload->>'fiuu_environment'
            || pg_catalog.chr(31) || payment.sale_payload->>'fiuu_application_code'
            || pg_catalog.chr(31) || payment.sale_payload->>'fiuu_store_id'
            || pg_catalog.chr(31) || payment.sale_payload->>'fiuu_terminal_id'
            || pg_catalog.chr(31) || payment.sale_payload->>'fiuu_credential_version',
          'sha256'
        ),
        'hex'
      )
      AND public.is_pos_fiuu_opa_branch_rollout_match(
        payment.organization_id,
        payment.branch_id,
        payment.sale_payload->>'fiuu_branch_code',
        payment.sale_payload->>'fiuu_environment',
        payment.sale_payload->>'fiuu_application_code',
        payment.sale_payload->>'fiuu_store_id',
        payment.sale_payload->>'fiuu_terminal_id',
        payment.sale_payload->>'fiuu_credential_version'
      );
    RETURN NULL;
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.organization_id IS DISTINCT FROM v_shift_organization_id
    OR v_payment.branch_id IS DISTINCT FROM v_shift_branch_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT
    OR NULLIF(v_payment.sale_payload->>'fiuu_configuration_sha256', '') IS NULL
    OR v_payment.sale_payload->>'fiuu_configuration_sha256' IS DISTINCT FROM encode(
      extensions.digest(
        'fiuu-opa-config:v1'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_environment'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_application_code'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_store_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_terminal_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_credential_version',
        'sha256'
      ),
      'hex'
    )
    OR NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RETURN NULL;
  END IF;

  IF NULLIF(v_payment.sale_payload->>'fiuu_device_code', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_application_code', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_store_id', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_terminal_id', '') IS NULL
    OR NULLIF(v_payment.sale_payload->>'fiuu_credential_version', '') IS NULL
    OR v_shift_status IS DISTINCT FROM 'OPEN'
    OR v_payment.expires_at IS NULL THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'MANUAL_REVIEW',
        fiuu_opa_reconcile_next_at = NULL,
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
    RETURN NULL;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'PENDING' THEN
    RETURN NULL;
  END IF;

  IF v_payment.fiuu_opa_reconcile_state IN (
    'AWAITING_REVERSAL', 'MANUAL_REVIEW', 'SUCCEEDED', 'FAILED', 'REVERSED'
  ) THEN
    RETURN NULL;
  END IF;
  IF v_payment.fiuu_opa_reconcile_lease_expires_at IS NOT NULL
    AND v_payment.fiuu_opa_reconcile_lease_expires_at > v_now THEN
    RETURN NULL;
  END IF;
  IF v_payment.fiuu_opa_reconcile_next_at IS NOT NULL
    AND v_payment.fiuu_opa_reconcile_next_at > v_now THEN
    RETURN NULL;
  END IF;

  UPDATE public.pos_fiuu_opa_reconciliation_attempts
  SET state = 'UNKNOWN',
      failure_code = COALESCE(failure_code, 'LEASE_EXPIRED'),
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE payment_id = v_payment.id
    AND state = 'CLAIMED'
    AND lease_expires_at <= v_now;

  IF v_payment.fiuu_opa_reconcile_attempt_count = 0
    AND v_payment.expires_at > v_now THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'WAITING_FOR_EXPIRY',
        fiuu_opa_reconcile_next_at = v_payment.expires_at + INTERVAL '10 seconds',
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
    RETURN NULL;
  END IF;
  IF v_payment.fiuu_opa_reconcile_attempt_count >= 6 THEN
    UPDATE public.pos_online_payments
    SET fiuu_opa_reconcile_state = 'AWAITING_REVERSAL',
        fiuu_opa_reconcile_next_at = NULL,
        fiuu_opa_reconcile_claim_token = NULL,
        fiuu_opa_reconcile_lease_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_payment.id;
    RETURN NULL;
  END IF;

  v_attempt_no := v_payment.fiuu_opa_reconcile_attempt_count + 1;

  INSERT INTO public.pos_fiuu_opa_reconciliation_attempts (
    payment_id,
    claim_token,
    operation,
    attempt_no,
    request_reference_id,
    state,
    claimed_at,
    lease_expires_at
  ) VALUES (
    v_payment.id,
    p_claim_token,
    'INQUIRY',
    v_attempt_no,
    v_payment.id::TEXT,
    'CLAIMED',
    v_now,
    v_now + make_interval(secs => p_lease_seconds)
  );

  UPDATE public.pos_online_payments
  SET fiuu_opa_reconcile_state = 'INQUIRING',
      fiuu_opa_reconcile_started_at = COALESCE(fiuu_opa_reconcile_started_at, v_now),
      fiuu_opa_reconcile_next_at = NULL,
      fiuu_opa_reconcile_attempt_count = v_attempt_no,
      fiuu_opa_reconcile_claim_token = p_claim_token,
      fiuu_opa_reconcile_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      provider_status_checked_at = v_now,
      updated_at = v_now
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'organization_id', v_payment.organization_id,
    'branch_id', v_payment.branch_id,
    'claim_token', p_claim_token,
    'attempt_no', v_attempt_no,
    'branch_code', v_branch_code,
    'device_code', v_payment.sale_payload->>'fiuu_device_code',
    'application_code', v_payment.sale_payload->>'fiuu_application_code',
    'gateway_ref', NULLIF(v_payment.gateway_ref, ''),
    'amount_rm', v_payment.amount_rm,
    'expires_at', v_payment.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_opa_inquiry(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_opa_inquiry(UUID, UUID, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pos_fiuu_opa_inquiry(
  p_payment_id UUID,
  p_claim_token UUID,
  p_outcome TEXT,
  p_status_code TEXT DEFAULT NULL,
  p_provider_result JSONB DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_opa_reconciliation_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_next_state TEXT;
  v_next_at TIMESTAMPTZ;
  v_attempt_state TEXT;
  v_amount_text TEXT;
BEGIN
  IF p_payment_id IS NULL
    OR p_claim_token IS NULL
    OR p_outcome NOT IN ('PENDING', 'FAILED', 'UNKNOWN', 'INVALID', 'SUCCEEDED')
    OR (p_failure_code IS NOT NULL AND p_failure_code !~ '^[A-Z0-9_]{1,64}$') THEN
    RAISE EXCEPTION 'Invalid Fiuu OPA inquiry completion';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA payment not found';
  END IF;

  SELECT
    shift.organization_id,
    shift.branch_id,
    upper(btrim(branch.branch_code))
  INTO
    v_shift_organization_id,
    v_shift_branch_id,
    v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.organization_id IS DISTINCT FROM v_shift_organization_id
    OR v_payment.branch_id IS DISTINCT FROM v_shift_branch_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT
    OR NULLIF(v_payment.sale_payload->>'fiuu_configuration_sha256', '') IS NULL
    OR v_payment.sale_payload->>'fiuu_configuration_sha256' IS DISTINCT FROM encode(
      extensions.digest(
        'fiuu-opa-config:v1'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_environment'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_application_code'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_store_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_terminal_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_credential_version',
        'sha256'
      ),
      'hex'
    )
    OR NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RAISE EXCEPTION 'Fiuu OPA payment not eligible for inquiry completion';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_opa_reconciliation_attempts
  WHERE payment_id = p_payment_id
    AND claim_token = p_claim_token
    AND operation = 'INQUIRY'
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.state IS DISTINCT FROM 'CLAIMED' THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;
  IF v_payment.fiuu_opa_reconcile_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;

  IF v_payment.status NOT IN ('REPORTED', 'PAID')
    AND NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RAISE EXCEPTION 'Fiuu OPA rollout generation does not match inquiry completion';
  END IF;

  IF v_payment.status IN ('REPORTED', 'PAID') AND p_outcome <> 'SUCCEEDED' THEN
    v_attempt_state := 'SUPERSEDED';
    v_next_state := 'SUCCEEDED';
    v_next_at := NULL;
  ELSIF p_outcome = 'SUCCEEDED' THEN
    IF v_payment.status NOT IN ('REPORTED', 'PAID') THEN
      RAISE EXCEPTION 'Fiuu OPA success report has not been committed';
    END IF;
    v_attempt_state := 'SUCCEEDED';
    v_next_state := 'SUCCEEDED';
    v_next_at := NULL;
  ELSIF p_outcome IN ('PENDING', 'FAILED') THEN
    IF p_provider_result IS NULL
      OR jsonb_typeof(p_provider_result) IS DISTINCT FROM 'object'
      OR p_provider_result - ARRAY[
        'applicationCode',
        'referenceId',
        'molTransactionId',
        'amount',
        'currencyCode',
        'channelId',
        'statusCode',
        'signature',
        'signedResponseRaw'
      ] <> '{}'::JSONB
      OR p_provider_result->>'applicationCode'
        IS DISTINCT FROM v_payment.sale_payload->>'fiuu_application_code'
      OR lower(COALESCE(p_provider_result->>'referenceId', ''))
        IS DISTINCT FROM v_payment.id::TEXT
      OR NULLIF(p_provider_result->>'molTransactionId', '') IS NULL
      OR (
        NULLIF(v_payment.gateway_ref, '') IS NOT NULL
        AND p_provider_result->>'molTransactionId' IS DISTINCT FROM v_payment.gateway_ref
      )
      OR p_provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
      OR p_provider_result->>'channelId' IS DISTINCT FROM '24'
      OR p_provider_result->>'statusCode' IS DISTINCT FROM p_status_code
      OR COALESCE(p_provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$'
      OR jsonb_typeof(p_provider_result->'signedResponseRaw') IS DISTINCT FROM 'string'
      OR length(p_provider_result->>'signedResponseRaw') NOT BETWEEN 2 AND 65536 THEN
      RAISE EXCEPTION 'Fiuu OPA signed inquiry evidence is invalid';
    END IF;
    v_amount_text := COALESCE(p_provider_result->>'amount', '');
    IF v_amount_text !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
      OR v_amount_text::NUMERIC IS DISTINCT FROM v_payment.amount_rm THEN
      RAISE EXCEPTION 'Fiuu OPA signed inquiry evidence is invalid';
    END IF;
    IF p_outcome = 'PENDING' AND p_status_code NOT IN ('01', '11') THEN
      RAISE EXCEPTION 'Fiuu OPA pending inquiry status is invalid';
    END IF;
    IF p_outcome = 'FAILED' AND p_status_code IS DISTINCT FROM '99' THEN
      RAISE EXCEPTION 'Fiuu OPA failed inquiry status is invalid';
    END IF;
    IF NULLIF(v_payment.gateway_ref, '') IS NULL THEN
      UPDATE public.pos_online_payments
      SET gateway_ref = p_provider_result->>'molTransactionId',
          updated_at = v_now
      WHERE id = v_payment.id
        AND NULLIF(gateway_ref, '') IS NULL;
      v_payment.gateway_ref := p_provider_result->>'molTransactionId';
    END IF;
  END IF;

  IF v_attempt_state IS NULL THEN
    v_attempt_state := p_outcome;
    IF p_outcome = 'FAILED' THEN
      v_next_state := 'FAILED';
      v_next_at := NULL;
      UPDATE public.pos_online_payments
      SET status = 'FAILED',
          provider_result = p_provider_result,
          failed_at = v_now,
          provider_status_checked_at = v_now,
          updated_at = v_now
      WHERE id = v_payment.id
        AND status = 'PENDING';
    ELSIF p_outcome = 'INVALID' THEN
      v_next_state := 'MANUAL_REVIEW';
      v_next_at := NULL;
    ELSIF v_attempt.attempt_no >= 6 THEN
      v_next_state := 'AWAITING_REVERSAL';
      v_next_at := NULL;
    ELSE
      v_next_state := 'WAITING';
      v_next_at := v_now + INTERVAL '10 seconds';
    END IF;
  END IF;

  UPDATE public.pos_fiuu_opa_reconciliation_attempts
  SET state = v_attempt_state,
      completed_at = v_now,
      provider_status_code = p_status_code,
      provider_transaction_id = CASE
        WHEN p_provider_result IS NULL THEN NULL
        ELSE NULLIF(p_provider_result->>'molTransactionId', '')
      END,
      provider_result = p_provider_result,
      failure_code = p_failure_code,
      updated_at = v_now
  WHERE id = v_attempt.id;

  UPDATE public.pos_online_payments
  SET fiuu_opa_reconcile_state = v_next_state,
      fiuu_opa_reconcile_next_at = v_next_at,
      fiuu_opa_reconcile_claim_token = NULL,
      fiuu_opa_reconcile_lease_expires_at = NULL,
      provider_status_checked_at = v_now,
      updated_at = v_now
  WHERE id = v_payment.id
    AND fiuu_opa_reconcile_claim_token = p_claim_token;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'branch_code', v_branch_code,
    'attempt_no', v_attempt.attempt_no,
    'attempt_state', v_attempt_state,
    'reconcile_state', v_next_state,
    'next_at', v_next_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pos_fiuu_opa_inquiry(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_fiuu_opa_inquiry(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.report_pos_fiuu_payment(
  p_payment_id UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT,
  p_status_code TEXT,
  p_provider_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_shift_status TEXT;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_gateway_ref TEXT := btrim(COALESCE(p_gateway_ref, ''));
  v_provider_amount_text TEXT;
  v_provider_amount NUMERIC;
  v_expiry_grace CONSTANT INTERVAL := INTERVAL '65 minutes';
  v_legacy_expired_grace CONSTANT INTERVAL := INTERVAL '20 minutes';
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Fiuu POS payment reference is required';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  SELECT shift.organization_id, shift.branch_id, shift.status::TEXT,
         upper(btrim(branch.branch_code))
  INTO v_shift_organization_id, v_shift_branch_id, v_shift_status,
       v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.organization_id IS DISTINCT FROM v_shift_organization_id
    OR v_payment.branch_id IS DISTINCT FROM v_shift_branch_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT
    OR NULLIF(v_payment.sale_payload->>'fiuu_configuration_sha256', '') IS NULL
    OR v_payment.sale_payload->>'fiuu_configuration_sha256' IS DISTINCT FROM encode(
      extensions.digest(
        'fiuu-opa-config:v1'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_environment'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_application_code'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_store_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_terminal_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_credential_version',
        'sha256'
      ),
      'hex'
    )
    OR NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  IF v_gateway_ref = ''
    OR length(v_gateway_ref) > 40
    OR v_gateway_ref ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Fiuu transaction reference mismatch';
  END IF;
  IF (v_payment.status IN ('REPORTED', 'PAID')
      AND NULLIF(v_payment.gateway_ref, '') IS NULL)
    OR (NULLIF(v_payment.gateway_ref, '') IS NOT NULL
      AND v_gateway_ref IS DISTINCT FROM v_payment.gateway_ref) THEN
    RAISE EXCEPTION 'Fiuu transaction reference mismatch';
  END IF;
  IF p_amount IS NULL
    OR p_amount <= 0
    OR p_amount <> v_payment.amount_rm THEN
    RAISE EXCEPTION 'Fiuu POS payment amount mismatch';
  END IF;
  IF p_currency IS DISTINCT FROM 'MYR' THEN
    RAISE EXCEPTION 'Fiuu POS payment currency mismatch';
  END IF;
  IF p_channel_id IS DISTINCT FROM '24' THEN
    RAISE EXCEPTION 'Fiuu POS payment channel mismatch';
  END IF;
  IF p_status_code IS DISTINCT FROM '00' THEN
    RAISE EXCEPTION 'Fiuu POS payment status mismatch';
  END IF;

  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) IS DISTINCT FROM 'object'
    OR p_provider_result - ARRAY[
      'applicationCode',
      'referenceId',
      'molTransactionId',
      'amount',
      'currencyCode',
      'channelId',
      'statusCode',
      'signature'
    ] <> '{}'::JSONB
    OR NULLIF(btrim(COALESCE(p_provider_result->>'applicationCode', '')), '') IS NULL
    OR length(p_provider_result->>'applicationCode') > 32
    OR p_provider_result->>'applicationCode' ~ '[[:cntrl:]]'
    OR p_provider_result->>'applicationCode'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_application_code'
    OR lower(COALESCE(p_provider_result->>'referenceId', ''))
      IS DISTINCT FROM p_payment_id::TEXT
    OR p_provider_result->>'molTransactionId' IS DISTINCT FROM v_gateway_ref
    OR p_provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
    OR p_provider_result->>'channelId' IS DISTINCT FROM '24'
    OR p_provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR COALESCE(p_provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu signed payment evidence is invalid';
  END IF;

  v_provider_amount_text := COALESCE(p_provider_result->>'amount', '');
  IF v_provider_amount_text !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$' THEN
    RAISE EXCEPTION 'Fiuu signed payment evidence is invalid';
  END IF;
  v_provider_amount := v_provider_amount_text::NUMERIC;
  IF v_provider_amount IS DISTINCT FROM v_payment.amount_rm THEN
    RAISE EXCEPTION 'Fiuu signed payment evidence is invalid';
  END IF;

  -- Existing PAID/REPORTED results remain replayable after a safe rollout
  -- revocation, but only when the durable result exactly matches the newly
  -- validated signed response. The original rollout generation must still match.
  IF v_payment.status IN ('PAID', 'REPORTED') THEN
    IF v_payment.provider_transaction_id IS DISTINCT FROM v_gateway_ref
      OR v_payment.provider_sale_reported_at IS NULL
      OR jsonb_typeof(v_payment.provider_result) IS DISTINCT FROM 'object'
      OR lower(COALESCE(v_payment.provider_result->>'referenceId', ''))
        IS DISTINCT FROM p_payment_id::TEXT
      OR v_payment.provider_result->>'applicationCode'
        IS DISTINCT FROM v_payment.sale_payload->>'fiuu_application_code'
      OR v_payment.provider_result->>'molTransactionId' IS DISTINCT FROM v_gateway_ref
      OR v_payment.provider_result->>'amount' IS DISTINCT FROM p_provider_result->>'amount'
      OR v_payment.provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
      OR v_payment.provider_result->>'channelId' IS DISTINCT FROM '24'
      OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00'
      OR lower(COALESCE(v_payment.provider_result->>'signature', ''))
        IS DISTINCT FROM lower(p_provider_result->>'signature')
      OR (v_payment.status = 'PAID' AND v_payment.transaction_id IS NULL) THEN
      RAISE EXCEPTION 'Fiuu reported payment evidence mismatch';
    END IF;

    IF v_payment.status = 'PAID' THEN
      RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'branch_code', v_branch_code,
        'status', 'PAID',
        'transaction_id', v_payment.transaction_id,
        'idempotent_replay', true
      );
    END IF;

    IF v_payment.status = 'REPORTED' THEN
      UPDATE public.pos_online_payments
      SET provider_status_checked_at = now(),
          updated_at = now()
      WHERE id = v_payment.id
        AND status = 'REPORTED';

      RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'branch_code', v_branch_code,
        'status', 'REPORTED',
        'provider_transaction_id', v_payment.provider_transaction_id,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  IF v_payment.status NOT IN ('PENDING', 'EXPIRED') THEN
    RAISE EXCEPTION 'Fiuu POS payment cannot accept a success report';
  END IF;

  IF NOT public.is_pos_fiuu_opa_branch_rollout_match(
    v_payment.organization_id,
    v_payment.branch_id,
    v_branch_code,
    v_payment.sale_payload->>'fiuu_environment',
    v_payment.sale_payload->>'fiuu_application_code',
    v_payment.sale_payload->>'fiuu_store_id',
    v_payment.sale_payload->>'fiuu_terminal_id',
    v_payment.sale_payload->>'fiuu_credential_version'
  ) THEN
    RAISE EXCEPTION 'Fiuu OPA rollout generation does not match a success report';
  END IF;

  IF v_shift_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Fiuu POS payment requires a matching open shift';
  END IF;
  IF v_payment.status = 'EXPIRED'
    AND v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + v_legacy_expired_grace THEN
    RAISE EXCEPTION 'Fiuu POS payment success arrived outside expiry grace';
  END IF;
  IF v_payment.status <> 'EXPIRED'
    AND v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + v_expiry_grace THEN
    RAISE EXCEPTION 'Fiuu POS payment success arrived outside expiry grace';
  END IF;

  UPDATE public.pos_online_payments
  SET status = 'REPORTED',
      provider_transaction_id = v_gateway_ref,
      provider_result = p_provider_result,
      provider_sale_reported_at = now(),
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      gateway_ref = v_gateway_ref,
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id
    AND status IN ('PENDING', 'EXPIRED');

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'branch_code', v_branch_code,
    'status', 'REPORTED',
    'provider_transaction_id', v_gateway_ref,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_payment(
  p_payment_id UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_shift_status TEXT;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_result JSONB;
  v_existing_receipt JSONB;
  v_gateway_ref TEXT := btrim(COALESCE(p_gateway_ref, ''));
  v_provider_amount_text TEXT;
  v_provider_amount NUMERIC;
  v_pricing_item JSONB;
  v_snapshot_quantity INTEGER;
  v_snapshot_unit_price NUMERIC;
  v_snapshot_line_total NUMERIC;
  v_snapshot_subtotal NUMERIC := 0;
  v_snapshot_total NUMERIC;
  v_current_price NUMERIC;
  v_payload_subtotal NUMERIC;
  v_payload_total NUMERIC;
  v_payload_qr NUMERIC;
  v_payload_cash NUMERIC;
  v_payload_discount NUMERIC;
  v_locked_product_count INTEGER;
BEGIN
  -- Preserve the established shift-first lock order used by close_pos_shift.
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;

  SELECT shift.organization_id, shift.branch_id, shift.status::TEXT,
         upper(btrim(branch.branch_code))
  INTO v_shift_organization_id, v_shift_branch_id, v_shift_status,
       v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.organization_id IS DISTINCT FROM v_shift_organization_id
    OR v_payment.branch_id IS DISTINCT FROM v_shift_branch_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT
    OR NULLIF(v_payment.sale_payload->>'fiuu_configuration_sha256', '') IS NULL
    OR v_payment.sale_payload->>'fiuu_configuration_sha256' IS DISTINCT FROM encode(
      extensions.digest(
        'fiuu-opa-config:v1'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_environment'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_application_code'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_store_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_terminal_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_credential_version',
        'sha256'
      ),
      'hex'
    )
    OR NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RAISE EXCEPTION 'Fiuu POS payment not found';
  END IF;
  IF v_gateway_ref = ''
    OR v_gateway_ref IS DISTINCT FROM v_payment.gateway_ref
    OR p_amount IS NULL
    OR p_amount <> v_payment.amount_rm
    OR p_currency IS DISTINCT FROM 'MYR'
    OR p_channel_id IS DISTINCT FROM '24' THEN
    RAISE EXCEPTION 'Fiuu POS payment details mismatch';
  END IF;

  -- Validate the stored signed result before either replaying a PAID receipt or
  -- starting the one-way REPORTED -> PAID fulfillment transition. A revoked
  -- rollout may replay an already materialized result, but cannot create one.
  IF v_payment.status NOT IN ('REPORTED', 'PAID')
    OR v_payment.provider_transaction_id IS DISTINCT FROM v_gateway_ref
    OR v_payment.provider_sale_reported_at IS NULL
    OR jsonb_typeof(v_payment.provider_result) IS DISTINCT FROM 'object'
    OR lower(COALESCE(v_payment.provider_result->>'referenceId', ''))
      IS DISTINCT FROM v_payment.id::TEXT
    OR v_payment.provider_result->>'applicationCode'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_application_code'
    OR v_payment.provider_result->>'molTransactionId' IS DISTINCT FROM v_gateway_ref
    OR v_payment.provider_result->>'currencyCode' IS DISTINCT FROM 'MYR'
    OR v_payment.provider_result->>'channelId' IS DISTINCT FROM '24'
    OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR COALESCE(v_payment.provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable signed success report';
  END IF;

  v_provider_amount_text := COALESCE(v_payment.provider_result->>'amount', '');
  IF v_provider_amount_text !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$' THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable signed success report';
  END IF;
  v_provider_amount := v_provider_amount_text::NUMERIC;
  IF v_provider_amount IS DISTINCT FROM v_payment.amount_rm THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable signed success report';
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    SELECT receipt_data INTO v_existing_receipt
    FROM public.pos_receipts
    WHERE transaction_id = v_payment.transaction_id;
    RETURN COALESCE(
      v_existing_receipt,
      jsonb_build_object('transaction_id', v_payment.transaction_id)
    );
  ELSIF v_payment.status = 'PAID' THEN
    RAISE EXCEPTION 'Fiuu POS payment has no durable fulfillment result';
  END IF;

  IF NOT public.is_pos_fiuu_opa_branch_rollout_match(
    v_payment.organization_id,
    v_payment.branch_id,
    v_branch_code,
    v_payment.sale_payload->>'fiuu_environment',
    v_payment.sale_payload->>'fiuu_application_code',
    v_payment.sale_payload->>'fiuu_store_id',
    v_payment.sale_payload->>'fiuu_terminal_id',
    v_payment.sale_payload->>'fiuu_credential_version'
  ) THEN
    RAISE EXCEPTION 'Fiuu OPA rollout generation does not match fulfillment';
  END IF;

  -- No new receipt or stock mutation may start unless the matching shift is
  -- still open. The PAID replay above intentionally remains available later.
  IF v_shift_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Fiuu POS shift is not open';
  END IF;

  -- The customer has already paid the stored amount. Lock and compare every
  -- catalogue row against the server-side snapshot before issuing a receipt;
  -- a later price change leaves the payment REPORTED for Finance resolution.
  IF jsonb_typeof(v_payment.sale_payload->'pricing_snapshot') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_payment.sale_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is missing';
  END IF;
  IF jsonb_array_length(v_payment.sale_payload->'pricing_snapshot')
    <> jsonb_array_length(v_payment.sale_payload->'items') THEN
    RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is incomplete';
  END IF;

  FOR v_pricing_item IN
    SELECT * FROM jsonb_array_elements(v_payment.sale_payload->'pricing_snapshot')
  LOOP
    BEGIN
      v_snapshot_quantity := (v_pricing_item->>'quantity')::INTEGER;
      v_snapshot_unit_price := (v_pricing_item->>'unit_price')::NUMERIC;
      v_snapshot_line_total := (v_pricing_item->>'line_total')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is invalid';
    END;

    IF COALESCE(v_pricing_item->>'product_id', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR v_snapshot_quantity IS NULL
      OR v_snapshot_unit_price IS NULL
      OR v_snapshot_line_total IS NULL
      OR v_snapshot_quantity <= 0
      OR v_snapshot_unit_price < 0
      OR round(v_snapshot_line_total, 2)
        <> round(v_snapshot_unit_price * v_snapshot_quantity, 2)
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_payment.sale_payload->'items') AS source_item
        WHERE source_item->>'product_id' = v_pricing_item->>'product_id'
          AND (source_item->>'quantity')::INTEGER = v_snapshot_quantity
      ) THEN
      RAISE EXCEPTION 'Fiuu OPA sale pricing snapshot is invalid';
    END IF;

    v_snapshot_subtotal := v_snapshot_subtotal
      + (v_snapshot_unit_price * v_snapshot_quantity);
  END LOOP;

  PERFORM product.id
  FROM public.products AS product
  JOIN (
    SELECT DISTINCT (snapshot_item->>'product_id')::UUID AS product_id
    FROM jsonb_array_elements(
      v_payment.sale_payload->'pricing_snapshot'
    ) AS snapshot_item
  ) AS snapshot ON snapshot.product_id = product.id
  WHERE product.organization_id = v_payment.organization_id
    AND product.status = 'ACTIVE'
  ORDER BY product.id
  FOR UPDATE OF product;
  GET DIAGNOSTICS v_locked_product_count = ROW_COUNT;

  IF v_locked_product_count
    <> jsonb_array_length(v_payment.sale_payload->'pricing_snapshot') THEN
    RAISE EXCEPTION 'Fiuu OPA sale contains duplicate or unavailable products';
  END IF;

  FOR v_pricing_item IN
    SELECT * FROM jsonb_array_elements(v_payment.sale_payload->'pricing_snapshot')
  LOOP
    v_snapshot_unit_price := (v_pricing_item->>'unit_price')::NUMERIC;
    SELECT price INTO v_current_price
    FROM public.products
    WHERE id = (v_pricing_item->>'product_id')::UUID
      AND organization_id = v_payment.organization_id
      AND status = 'ACTIVE';
    IF NOT FOUND OR round(v_current_price, 2) <> round(v_snapshot_unit_price, 2) THEN
      RAISE EXCEPTION 'Fiuu OPA product price changed after payment started';
    END IF;
  END LOOP;

  BEGIN
    v_payload_subtotal := (v_payment.sale_payload->>'subtotal')::NUMERIC;
    v_payload_total := (v_payment.sale_payload->>'total')::NUMERIC;
    v_payload_qr := (v_payment.sale_payload->>'qr_amount')::NUMERIC;
    v_payload_cash := COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0);
    v_payload_discount := COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Fiuu OPA sale totals snapshot is invalid';
  END;
  IF v_payload_subtotal IS NULL OR v_payload_total IS NULL OR v_payload_qr IS NULL THEN
    RAISE EXCEPTION 'Fiuu OPA sale totals snapshot is missing';
  END IF;

  v_snapshot_total := v_snapshot_subtotal - v_payload_discount;
  IF round(v_snapshot_subtotal, 2) <> round(v_payload_subtotal, 2)
    OR round(v_snapshot_total, 2) <> round(v_payload_total, 2)
    OR v_payload_qr <> v_payment.amount_rm
    OR round(v_payload_cash + v_payload_qr, 2) <> round(v_snapshot_total, 2) THEN
    RAISE EXCEPTION 'Fiuu OPA charged amount does not match pricing snapshot';
  END IF;

  v_result := public.process_pos_sale_internal(
    v_payment.created_by,
    v_payment.shift_id,
    v_payment.branch_id,
    v_payment.sale_payload->'items',
    (v_payment.sale_payload->>'payment_method')::payment_method,
    COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0),
    COALESCE((v_payment.sale_payload->>'qr_amount')::NUMERIC, 0),
    COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0),
    NULLIF(v_payment.sale_payload->>'offline_id', ''),
    NULLIF(v_payment.sale_payload->>'receipt_email', ''),
    NULLIF(v_payment.sale_payload->>'receipt_phone', '')
  );

  UPDATE public.pos_online_payments
  SET status = 'PAID',
      transaction_id = (v_result->>'transaction_id')::UUID,
      provider_status_checked_at = now(),
      provider_confirmed_at = COALESCE(provider_confirmed_at, now()),
      paid_at = now(),
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id
    AND status = 'REPORTED';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_payment(
  UUID, TEXT, NUMERIC, TEXT, TEXT
) TO service_role;

-- This wrapper remains atomic: the matching rollout-generation authorization
-- in report_pos_fiuu_payment runs before signed evidence can be persisted.
CREATE OR REPLACE FUNCTION public.report_pos_fiuu_payment_with_evidence(
  p_payment_id UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT,
  p_status_code TEXT,
  p_provider_result JSONB,
  p_signed_response_raw TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_signed_response_raw IS NULL
    OR octet_length(p_signed_response_raw) NOT BETWEEN 2 AND 65536 THEN
    RAISE EXCEPTION 'Fiuu signed callback evidence is invalid';
  END IF;

  v_result := public.report_pos_fiuu_payment(
    p_payment_id,
    p_gateway_ref,
    p_amount,
    p_currency,
    p_channel_id,
    p_status_code,
    p_provider_result
  );

  INSERT INTO public.pos_fiuu_opa_signed_evidence (
    payment_id,
    source,
    provider_transaction_id,
    status_code,
    signed_response_raw
  ) VALUES (
    p_payment_id,
    'CALLBACK',
    p_gateway_ref,
    p_status_code,
    p_signed_response_raw
  )
  ON CONFLICT (payment_id, source, provider_transaction_id, status_code)
  DO UPDATE SET last_seen_at = now();

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_payment_with_evidence(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_payment_with_evidence(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.report_pos_fiuu_opa_inquiry_success(
  p_payment_id UUID,
  p_claim_token UUID,
  p_gateway_ref TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_channel_id TEXT,
  p_status_code TEXT,
  p_provider_result JSONB,
  p_audit_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_organization_id UUID;
  v_shift_branch_id UUID;
  v_branch_code TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_opa_reconciliation_attempts%ROWTYPE;
  v_result JSONB;
  v_raw TEXT;
BEGIN
  IF p_payment_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is required';
  END IF;
  IF p_audit_result IS NULL
    OR jsonb_typeof(p_audit_result) IS DISTINCT FROM 'object'
    OR p_audit_result - 'signedResponseRaw' IS DISTINCT FROM p_provider_result THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry audit evidence is invalid';
  END IF;
  v_raw := p_audit_result->>'signedResponseRaw';
  IF v_raw IS NULL OR octet_length(v_raw) NOT BETWEEN 2 AND 65536 THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry audit evidence is invalid';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA payment not found';
  END IF;

  SELECT
    shift.organization_id,
    shift.branch_id,
    upper(btrim(branch.branch_code))
  INTO
    v_shift_organization_id,
    v_shift_branch_id,
    v_branch_code
  FROM public.pos_shifts AS shift
  JOIN public.branches AS branch
    ON branch.id = shift.branch_id
   AND branch.organization_id = shift.organization_id
  WHERE shift.id = v_shift_id
  FOR UPDATE OF shift;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_payment.provider IS DISTINCT FROM 'fiuu'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.organization_id IS DISTINCT FROM v_shift_organization_id
    OR v_payment.branch_id IS DISTINCT FROM v_shift_branch_id
    OR v_branch_code !~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$'
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code
    OR v_payment.sale_payload->>'branchId' IS DISTINCT FROM v_payment.branch_id::TEXT
    OR NULLIF(v_payment.sale_payload->>'fiuu_configuration_sha256', '') IS NULL
    OR v_payment.sale_payload->>'fiuu_configuration_sha256' IS DISTINCT FROM encode(
      extensions.digest(
        'fiuu-opa-config:v1'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_environment'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_application_code'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_store_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_terminal_id'
          || pg_catalog.chr(31) || v_payment.sale_payload->>'fiuu_credential_version',
        'sha256'
      ),
      'hex'
    )
    OR NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RAISE EXCEPTION 'Fiuu OPA payment not eligible for inquiry success';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_opa_reconciliation_attempts
  WHERE payment_id = p_payment_id
    AND claim_token = p_claim_token
    AND operation = 'INQUIRY'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;
  IF v_attempt.state = 'SUCCEEDED' THEN
    IF v_payment.status NOT IN ('REPORTED', 'PAID')
      OR v_payment.gateway_ref IS DISTINCT FROM p_gateway_ref
      OR v_payment.provider_transaction_id IS DISTINCT FROM p_gateway_ref THEN
      RAISE EXCEPTION 'Fiuu OPA inquiry replay mismatch';
    END IF;
    RETURN public.report_pos_fiuu_payment(
      p_payment_id,
      p_gateway_ref,
      p_amount,
      p_currency,
      p_channel_id,
      p_status_code,
      p_provider_result
    );
  END IF;
  IF v_attempt.state IS DISTINCT FROM 'CLAIMED'
    OR v_payment.fiuu_opa_reconcile_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry claim is stale';
  END IF;

  IF v_payment.status NOT IN ('REPORTED', 'PAID')
    AND NOT public.is_pos_fiuu_opa_branch_rollout_match(
      v_payment.organization_id,
      v_payment.branch_id,
      v_branch_code,
      v_payment.sale_payload->>'fiuu_environment',
      v_payment.sale_payload->>'fiuu_application_code',
      v_payment.sale_payload->>'fiuu_store_id',
      v_payment.sale_payload->>'fiuu_terminal_id',
      v_payment.sale_payload->>'fiuu_credential_version'
    ) THEN
    RAISE EXCEPTION 'Fiuu OPA rollout generation does not match inquiry success';
  END IF;

  IF NULLIF(v_payment.gateway_ref, '') IS NULL THEN
    UPDATE public.pos_online_payments
    SET gateway_ref = p_gateway_ref,
        updated_at = now()
    WHERE id = p_payment_id
      AND NULLIF(gateway_ref, '') IS NULL;
  ELSIF v_payment.gateway_ref IS DISTINCT FROM p_gateway_ref THEN
    RAISE EXCEPTION 'Fiuu OPA inquiry transaction reference mismatch';
  END IF;

  v_result := public.report_pos_fiuu_payment(
    p_payment_id,
    p_gateway_ref,
    p_amount,
    p_currency,
    p_channel_id,
    p_status_code,
    p_provider_result
  );

  INSERT INTO public.pos_fiuu_opa_signed_evidence (
    payment_id,
    source,
    claim_token,
    provider_transaction_id,
    status_code,
    signed_response_raw
  ) VALUES (
    p_payment_id,
    'INQUIRY',
    p_claim_token,
    p_gateway_ref,
    p_status_code,
    v_raw
  )
  ON CONFLICT (payment_id, source, provider_transaction_id, status_code)
  DO UPDATE SET last_seen_at = now();

  PERFORM public.complete_pos_fiuu_opa_inquiry(
    p_payment_id,
    p_claim_token,
    'SUCCEEDED',
    p_status_code,
    p_audit_result,
    NULL
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_opa_inquiry_success(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_opa_inquiry_success(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, JSONB
) TO service_role;

-- Preserve the unresolved-payment shift-close guard for every OPA branch and
-- retain the existing bounded behavior for VT App-to-App and cloudECR.
CREATE OR REPLACE FUNCTION public.guard_pos_shift_close_pending_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'OPEN' AND NEW.status = 'CLOSED' THEN
    PERFORM payment.id
    FROM public.pos_online_payments AS payment
    WHERE payment.organization_id = OLD.organization_id
      AND payment.branch_id = OLD.branch_id
      AND payment.shift_id = OLD.id
      AND (
        payment.status = 'REPORTED'
        OR (
          payment.provider = 'fiuu'
          AND (
            payment.status IN ('PENDING', 'REPORTED')
            OR (
              payment.status = 'EXPIRED'
              AND payment.expires_at IS NOT NULL
              AND payment.expires_at + INTERVAL '20 minutes' > now()
            )
          )
        )
        OR (
          payment.provider <> 'fiuu'
          AND payment.status = 'PENDING'
          AND COALESCE(payment.expires_at, 'infinity'::timestamptz) > now()
        )
        OR (
          payment.provider IN ('fiuu_vt', 'fiuu_cloudecr')
          AND payment.status IN ('PENDING', 'EXPIRED')
          AND payment.expires_at IS NOT NULL
          AND payment.expires_at + INTERVAL '20 minutes' > now()
        )
      )
    ORDER BY payment.id
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'POS shift cannot close while a Fiuu payment remains unresolved';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_shift_close_pending_payments
  ON public.pos_shifts;

CREATE TRIGGER guard_pos_shift_close_pending_payments
BEFORE UPDATE OF status ON public.pos_shifts
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_shift_close_pending_payments();

-- Do not silently repair trigger drift: every owned trigger must finish as the
-- sole trigger that fires on origin, with the exact target, function, event
-- timing and UPDATE OF column set expected here.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_branch_rollout'
      AND NOT trigger_row.tgisinternal
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_branch_rollout'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgrelid = 'public.pos_fiuu_opa_branch_rollouts'::regclass
      AND trigger_row.tgfoid = 'public.guard_pos_fiuu_opa_branch_rollout()'::regprocedure
      AND trigger_row.tgenabled IN ('O', 'A')
      AND trigger_row.tgtype = 23
      AND trigger_row.tgattr::TEXT = ''
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA rollout guard trigger is missing, disabled or drifted';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_payment_identity'
      AND NOT trigger_row.tgisinternal
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_payment_identity'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgrelid = 'public.pos_online_payments'::regclass
      AND trigger_row.tgfoid = 'public.guard_pos_fiuu_opa_payment_identity()'::regprocedure
      AND trigger_row.tgenabled IN ('O', 'A')
      AND trigger_row.tgtype = 23
      AND (
        SELECT array_agg(column_row.attname::TEXT ORDER BY column_row.attname)
        FROM unnest(
          string_to_array(NULLIF(trigger_row.tgattr::TEXT, ''), ' ')::SMALLINT[]
        ) AS trigger_column(attnum)
        JOIN pg_catalog.pg_attribute AS column_row
          ON column_row.attrelid = trigger_row.tgrelid
         AND column_row.attnum = trigger_column.attnum
      ) = ARRAY['branch_id', 'organization_id', 'provider', 'sale_payload']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu OPA payment identity trigger is missing, disabled or drifted';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'guard_pos_shift_close_pending_payments'
      AND NOT trigger_row.tgisinternal
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS relation_schema
      ON relation_schema.oid = relation.relnamespace
    JOIN pg_catalog.pg_proc AS trigger_function
      ON trigger_function.oid = trigger_row.tgfoid
    JOIN pg_catalog.pg_namespace AS function_schema
      ON function_schema.oid = trigger_function.pronamespace
    JOIN pg_catalog.pg_attribute AS status_column
      ON status_column.attrelid = relation.oid
     AND status_column.attname = 'status'
     AND NOT status_column.attisdropped
    WHERE trigger_row.tgname = 'guard_pos_shift_close_pending_payments'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled IN ('O', 'A')
      AND relation_schema.nspname = 'public'
      AND relation.relname = 'pos_shifts'
      AND function_schema.nspname = 'public'
      AND trigger_function.proname = 'guard_pos_shift_close_pending_payments'
      AND trigger_row.tgtype = 19
      AND trigger_row.tgattr::TEXT = status_column.attnum::TEXT
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'POS shift-close payment guard trigger is missing, disabled or drifted';
  END IF;
END;
$$;

-- Runtime health checks must fail closed unless the complete rollout-control
-- boundary is present. This RPC deliberately checks exact function signatures
-- and trigger attachments instead of treating a table-only probe as readiness.
CREATE OR REPLACE FUNCTION public.is_pos_fiuu_opa_rollout_control_ready()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS relation_schema
        ON relation_schema.oid = relation.relnamespace
      WHERE relation_schema.nspname = 'public'
        AND relation.relname = 'pos_fiuu_opa_branch_rollouts'
        AND relation.relkind IN ('r', 'p')
        AND relation.oid = pg_catalog.to_regclass(
          'public.pos_fiuu_opa_branch_rollouts'
        )
    )
    AND pg_catalog.to_regprocedure(
      'public.is_pos_fiuu_opa_branch_active(uuid,uuid,text,text,text,text,text,text)'
    ) IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'public.is_pos_fiuu_opa_branch_rollout_match(uuid,uuid,text,text,text,text,text,text)'
    ) IS NOT NULL
    AND (
      SELECT count(*) = 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_branch_rollout'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled IN ('O', 'A')
        AND trigger_row.tgrelid = pg_catalog.to_regclass(
          'public.pos_fiuu_opa_branch_rollouts'
        )
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'public.guard_pos_fiuu_opa_branch_rollout()'
        )
        AND trigger_row.tgtype = 23
        AND trigger_row.tgattr::TEXT = ''
    )
    AND (
      SELECT count(*) = 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname = 'guard_pos_fiuu_opa_payment_identity'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled IN ('O', 'A')
        AND trigger_row.tgrelid = pg_catalog.to_regclass(
          'public.pos_online_payments'
        )
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'public.guard_pos_fiuu_opa_payment_identity()'
        )
        AND trigger_row.tgtype = 23
        AND (
          SELECT array_agg(column_row.attname::TEXT ORDER BY column_row.attname)
          FROM unnest(
            string_to_array(NULLIF(trigger_row.tgattr::TEXT, ''), ' ')::SMALLINT[]
          ) AS trigger_column(attnum)
          JOIN pg_catalog.pg_attribute AS column_row
            ON column_row.attrelid = trigger_row.tgrelid
           AND column_row.attnum = trigger_column.attnum
        ) = ARRAY['branch_id', 'organization_id', 'provider', 'sale_payload']::TEXT[]
    )
    AND (
      SELECT count(*) = 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname = 'guard_pos_shift_close_pending_payments'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled IN ('O', 'A')
        AND trigger_row.tgrelid = pg_catalog.to_regclass('public.pos_shifts')
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'public.guard_pos_shift_close_pending_payments()'
        )
        AND trigger_row.tgtype = 19
        AND trigger_row.tgattr::TEXT = (
          SELECT status_column.attnum::TEXT
          FROM pg_catalog.pg_attribute AS status_column
          WHERE status_column.attrelid = trigger_row.tgrelid
            AND status_column.attname = 'status'
            AND NOT status_column.attisdropped
        )
    );
$$;

REVOKE ALL ON FUNCTION public.is_pos_fiuu_opa_rollout_control_ready()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pos_fiuu_opa_rollout_control_ready()
  TO service_role;

COMMENT ON FUNCTION public.is_pos_fiuu_opa_rollout_control_ready() IS
  'Fail-closed readiness probe for the Fiuu OPA rollout table, generation gates and required enabled triggers.';

COMMIT;
