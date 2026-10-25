-- BR001-only Fiuu VT+ / cloudECR pilot.
-- This migration prepares database invariants only. Runtime activation still
-- requires the explicit BR001 environment allowlist and a completed UAT.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS provider_reconcile_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_reconcile_claimed_at TIMESTAMPTZ;

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_reconcile_reference_id_format;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_reconcile_reference_id_format
  CHECK (
    provider_reconcile_reference_id IS NULL
    OR provider_reconcile_reference_id ~ '^[A-Za-z0-9_-]{4,20}$'
  );

-- Do not treat environment variables alone as proof that BR001 points to the
-- intended Fiuu settlement account. The pilot remains closed until Operations
-- records and independently verifies the exact cloudECR endpoint plus the MID
-- and TID returned by Fiuu. No real identifiers are seeded by this migration.
CREATE TABLE IF NOT EXISTS public.pos_fiuu_cloudecr_br001_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL
    REFERENCES public.branches(id) ON DELETE CASCADE,
  pos_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  terminal_sn TEXT NOT NULL,
  provider_mid TEXT NOT NULL,
  provider_tid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pos_fiuu_cloudecr_br001_mapping_pos_id_format CHECK (
    pos_id = btrim(pos_id)
    AND length(pos_id) BETWEEN 1 AND 24
    AND pos_id !~ '[[:cntrl:]]'
  ),
  CONSTRAINT pos_fiuu_cloudecr_br001_mapping_device_id_format CHECK (
    device_id = btrim(device_id)
    AND length(device_id) BETWEEN 1 AND 100
    AND device_id !~ '[[:cntrl:]]'
  ),
  CONSTRAINT pos_fiuu_cloudecr_br001_mapping_terminal_sn_format CHECK (
    terminal_sn = btrim(terminal_sn)
    AND length(terminal_sn) BETWEEN 1 AND 40
    AND terminal_sn !~ '[[:cntrl:]]'
  ),
  CONSTRAINT pos_fiuu_cloudecr_br001_mapping_mid_format CHECK (
    provider_mid = btrim(provider_mid)
    AND length(provider_mid) BETWEEN 1 AND 100
    AND provider_mid !~ '[[:cntrl:]]'
  ),
  CONSTRAINT pos_fiuu_cloudecr_br001_mapping_tid_format CHECK (
    provider_tid = btrim(provider_tid)
    AND length(provider_tid) BETWEEN 1 AND 100
    AND provider_tid !~ '[[:cntrl:]]'
  ),
  CONSTRAINT pos_fiuu_cloudecr_br001_mapping_active_verified CHECK (
    status <> 'ACTIVE' OR verified_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiuu_cloudecr_br001_one_active_branch
  ON public.pos_fiuu_cloudecr_br001_mappings(organization_id, branch_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiuu_cloudecr_br001_one_active_endpoint
  ON public.pos_fiuu_cloudecr_br001_mappings(
    organization_id,
    pos_id,
    device_id,
    terminal_sn
  )
  WHERE status = 'ACTIVE';

ALTER TABLE public.pos_fiuu_cloudecr_br001_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_fiuu_cloudecr_br001_mappings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.pos_fiuu_cloudecr_br001_mappings TO service_role;

CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_cloudecr_br001_mapping_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_branch_organization_id UUID;
  v_branch_code TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'REVOKED' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Revoked Fiuu cloudECR BR001 mapping is immutable';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'ACTIVE'
    AND NEW.status NOT IN ('ACTIVE', 'REVOKED') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Active Fiuu cloudECR BR001 mapping can only be revoked';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'ACTIVE'
    AND NEW.status = 'ACTIVE'
    AND (
      NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.pos_id IS DISTINCT FROM OLD.pos_id
      OR NEW.device_id IS DISTINCT FROM OLD.device_id
      OR NEW.terminal_sn IS DISTINCT FROM OLD.terminal_sn
      OR NEW.provider_mid IS DISTINCT FROM OLD.provider_mid
      OR NEW.provider_tid IS DISTINCT FROM OLD.provider_tid
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Active Fiuu cloudECR BR001 mapping is immutable; revoke and replace it';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'ACTIVE'
    AND (
      NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.pos_id IS DISTINCT FROM OLD.pos_id
      OR NEW.device_id IS DISTINCT FROM OLD.device_id
      OR NEW.terminal_sn IS DISTINCT FROM OLD.terminal_sn
      OR NEW.provider_mid IS DISTINCT FROM OLD.provider_mid
      OR NEW.provider_tid IS DISTINCT FROM OLD.provider_tid
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
    )
    AND EXISTS (
      SELECT 1
      FROM public.pos_online_payments AS payment
      WHERE payment.organization_id = OLD.organization_id
        AND payment.branch_id = OLD.branch_id
        AND payment.provider = 'fiuu_cloudecr'
        AND payment.status IN ('PENDING', 'REPORTED')
        AND payment.sale_payload->>'fiuu_cloudecr_pos_id' = OLD.pos_id
        AND payment.sale_payload->>'fiuu_cloudecr_device_id' = OLD.device_id
        AND payment.sale_payload->>'fiuu_cloudecr_terminal_sn' = OLD.terminal_sn
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu cloudECR BR001 mapping cannot change while a payment is unresolved';
  END IF;

  SELECT branch.organization_id, branch.branch_code
  INTO v_branch_organization_id, v_branch_code
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id;

  IF NOT FOUND
    OR v_branch_organization_id IS DISTINCT FROM NEW.organization_id
    OR upper(btrim(v_branch_code)) IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu cloudECR pilot mapping is restricted to BR001';
  END IF;

  IF NEW.status = 'ACTIVE' AND NEW.verified_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu cloudECR BR001 mapping must be verified before activation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_cloudecr_br001_mapping_scope()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_fiuu_cloudecr_br001_mapping_scope
  ON public.pos_fiuu_cloudecr_br001_mappings;
CREATE TRIGGER guard_pos_fiuu_cloudecr_br001_mapping_scope
BEFORE INSERT OR UPDATE
ON public.pos_fiuu_cloudecr_br001_mappings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_cloudecr_br001_mapping_scope();

CREATE OR REPLACE FUNCTION public.require_pos_fiuu_cloudecr_br001_mapping(
  p_organization_id UUID,
  p_branch_id UUID,
  p_pos_id TEXT,
  p_device_id TEXT,
  p_terminal_sn TEXT,
  p_provider_mid TEXT DEFAULT NULL,
  p_provider_tid TEXT DEFAULT NULL,
  p_require_provider_ids BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mapping_id UUID;
BEGIN
  IF p_require_provider_ids IS NULL
    OR p_organization_id IS NULL
    OR p_branch_id IS NULL
    OR NULLIF(btrim(COALESCE(p_pos_id, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_device_id, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_terminal_sn, '')), '') IS NULL
    OR (
      p_require_provider_ids
      AND (
        NULLIF(btrim(COALESCE(p_provider_mid, '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(p_provider_tid, '')), '') IS NULL
      )
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Verified Fiuu cloudECR BR001 MID/TID mapping is required';
  END IF;

  SELECT mapping.id INTO v_mapping_id
  FROM public.pos_fiuu_cloudecr_br001_mappings AS mapping
  JOIN public.branches AS branch
    ON branch.id = mapping.branch_id
   AND branch.organization_id = mapping.organization_id
  WHERE mapping.organization_id = p_organization_id
    AND mapping.branch_id = p_branch_id
    AND mapping.status = 'ACTIVE'
    AND mapping.verified_at IS NOT NULL
    AND upper(btrim(branch.branch_code)) = 'BR001'
    AND mapping.pos_id = p_pos_id
    AND mapping.device_id = p_device_id
    AND mapping.terminal_sn = p_terminal_sn
    AND (
      NOT COALESCE(p_require_provider_ids, false)
      OR (
        mapping.provider_mid = p_provider_mid
        AND mapping.provider_tid = p_provider_tid
      )
    );

  IF v_mapping_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Verified Fiuu cloudECR BR001 MID/TID mapping does not match';
  END IF;

  RETURN v_mapping_id;
END;
$$;

REVOKE ALL ON FUNCTION public.require_pos_fiuu_cloudecr_br001_mapping(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_pos_fiuu_cloudecr_br001_mapping(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_cloudecr_br001_payment_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.provider = 'fiuu_cloudecr' THEN
    IF NEW.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu cloudECR pilot payment is restricted to BR001';
    END IF;

    PERFORM public.require_pos_fiuu_cloudecr_br001_mapping(
      NEW.organization_id,
      NEW.branch_id,
      NEW.sale_payload->>'fiuu_cloudecr_pos_id',
      NEW.sale_payload->>'fiuu_cloudecr_device_id',
      NEW.sale_payload->>'fiuu_cloudecr_terminal_sn',
      NULL,
      NULL,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_cloudecr_br001_payment_mapping()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_fiuu_cloudecr_br001_payment_mapping
  ON public.pos_online_payments;
CREATE TRIGGER guard_pos_fiuu_cloudecr_br001_payment_mapping
BEFORE INSERT OR UPDATE OF provider, organization_id, branch_id, sale_payload
ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_cloudecr_br001_payment_mapping();

-- A successful provider charge can remain REPORTED when local receipt/stock
-- fulfilment fails. Recovery is explicit, auditable and idempotent: the same
-- recovery key always returns its first terminal result, while a deliberate
-- retry must use a new key after the underlying data issue is corrected.
CREATE TABLE IF NOT EXISTS public.pos_fiuu_cloudecr_recovery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL
    REFERENCES public.pos_online_payments(id) ON DELETE RESTRICT,
  recovery_key TEXT NOT NULL,
  expected_provider_transaction_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
  transaction_id UUID REFERENCES public.pos_transactions(id) ON DELETE RESTRICT,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT pos_fiuu_cloudecr_recovery_key_format CHECK (
    recovery_key ~ '^[A-Za-z0-9_-]{8,64}$'
  ),
  CONSTRAINT pos_fiuu_cloudecr_recovery_provider_transaction_format CHECK (
    expected_provider_transaction_id ~ '^[0-9]{1,10}$'
  ),
  CONSTRAINT pos_fiuu_cloudecr_recovery_reason_format CHECK (
    reason = btrim(reason)
    AND length(reason) BETWEEN 8 AND 500
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT pos_fiuu_cloudecr_recovery_terminal_state CHECK (
    (
      status = 'IN_PROGRESS'
      AND transaction_id IS NULL
      AND failure_code IS NULL
      AND failure_message IS NULL
      AND completed_at IS NULL
    )
    OR (
      status = 'SUCCEEDED'
      AND transaction_id IS NOT NULL
      AND failure_code IS NULL
      AND failure_message IS NULL
      AND completed_at IS NOT NULL
    )
    OR (
      status = 'FAILED'
      AND transaction_id IS NULL
      AND failure_code IS NOT NULL
      AND failure_message IS NOT NULL
      AND completed_at IS NOT NULL
    )
  ),
  UNIQUE (payment_id, recovery_key)
);

CREATE INDEX IF NOT EXISTS idx_fiuu_cloudecr_recovery_payment_created
  ON public.pos_fiuu_cloudecr_recovery_attempts(payment_id, created_at DESC);

ALTER TABLE public.pos_fiuu_cloudecr_recovery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_fiuu_cloudecr_recovery_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pos_fiuu_cloudecr_recovery_attempts TO service_role;

DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_actor_shift;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_actor_shift
  ON public.pos_online_payments(organization_id, branch_id, shift_id, created_by)
  WHERE provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
    AND status IN ('PENDING', 'REPORTED');

DROP INDEX IF EXISTS public.idx_pos_online_payments_one_pending_fiuu_device;
CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_device
  ON public.pos_online_payments(
    organization_id,
    branch_id,
    shift_id,
    (sale_payload->>'fiuu_device_code')
  )
  WHERE provider IN ('fiuu_vt', 'fiuu_cloudecr')
    AND status IN ('PENDING', 'REPORTED')
    AND NULLIF(sale_payload->>'fiuu_device_code', '') IS NOT NULL;

-- cloudECR getLast is terminal-scoped. Never allow two unresolved SALEs to the
-- same POS/device/terminal tuple, even when they originate from different RKJ
-- tablets, cashiers or shifts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_online_payments_one_active_cloudecr_terminal
  ON public.pos_online_payments(
    organization_id,
    (sale_payload->>'fiuu_cloudecr_pos_id'),
    (sale_payload->>'fiuu_cloudecr_device_id'),
    (sale_payload->>'fiuu_cloudecr_terminal_sn')
  )
  WHERE provider = 'fiuu_cloudecr'
    AND status IN ('PENDING', 'REPORTED')
    AND NULLIF(sale_payload->>'fiuu_cloudecr_pos_id', '') IS NOT NULL
    AND NULLIF(sale_payload->>'fiuu_cloudecr_device_id', '') IS NOT NULL
    AND NULLIF(sale_payload->>'fiuu_cloudecr_terminal_sn', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_cloudecr_reconciliation(
  p_payment_id UUID,
  p_query_reference_id TEXT,
  p_min_interval_seconds INTEGER DEFAULT 180
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claimed_id UUID;
BEGIN
  IF p_query_reference_id IS NULL
    OR p_query_reference_id !~ '^[A-Za-z0-9_-]{4,20}$'
    OR p_min_interval_seconds < 120
    OR p_min_interval_seconds > 300 THEN
    RAISE EXCEPTION 'Invalid Fiuu cloudECR reconciliation claim';
  END IF;

  UPDATE public.pos_online_payments
  SET provider_reconcile_reference_id = p_query_reference_id,
      provider_reconcile_claimed_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
    AND provider = 'fiuu_cloudecr'
    AND status = 'PENDING'
    AND sale_payload->>'fiuu_branch_code' = 'BR001'
    AND provider_order_id IS NOT NULL
    AND expires_at IS NOT NULL
    AND expires_at + INTERVAL '20 minutes' > now()
    AND (
      provider_reconcile_claimed_at IS NULL
      OR provider_reconcile_claimed_at <= now() - make_interval(secs => p_min_interval_seconds)
    )
  RETURNING id INTO v_claimed_id;

  RETURN v_claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pos_fiuu_cloudecr_reconciliation(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_cloudecr_reconciliation(UUID, TEXT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.report_pos_fiuu_cloudecr_payment(
  p_payment_id UUID,
  p_provider_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_provider_transaction_id TEXT;
  v_trans_type TEXT;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;

  -- Follow the shift-first lock order used by shift closure and other Fiuu
  -- fulfillment functions so a successful payment cannot race closing.
  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
    AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS shift is not open';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_cloudecr' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;
  IF v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION 'Fiuu cloudECR pilot is restricted to BR001';
  END IF;

  v_provider_transaction_id := p_provider_result->'transData'->>'transId';
  IF v_payment.status = 'PAID'
    AND v_payment.provider_transaction_id = v_provider_transaction_id THEN
    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'provider_transaction_id', v_payment.provider_transaction_id
    );
  END IF;

  IF v_payment.status NOT IN ('PENDING', 'REPORTED') THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment is not fulfillable';
  END IF;
  IF v_payment.status = 'REPORTED'
    AND v_payment.provider_transaction_id
      IS DISTINCT FROM v_provider_transaction_id THEN
    RAISE EXCEPTION 'Fiuu cloudECR transaction reference mismatch';
  END IF;
  IF v_payment.status = 'PENDING'
    AND v_payment.expires_at IS NOT NULL
    AND now() > v_payment.expires_at + INTERVAL '20 minutes' THEN
    RAISE EXCEPTION 'Fiuu cloudECR success arrived outside expiry grace';
  END IF;

  v_trans_type := p_provider_result->>'transType';
  IF p_provider_result IS NULL
    OR jsonb_typeof(p_provider_result) <> 'object'
    OR jsonb_typeof(p_provider_result->'transData') <> 'object'
    OR COALESCE(v_trans_type, '') NOT IN ('sale', 'getLast')
    OR p_provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR p_provider_result->>'responseCode' IS DISTINCT FROM '00'
    OR COALESCE(p_provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$'
    OR (
      v_trans_type = 'sale'
      AND p_provider_result->>'referenceId' IS DISTINCT FROM v_payment.provider_order_id
    )
    OR (
      v_trans_type = 'getLast'
      AND (
        v_payment.provider_reconcile_reference_id IS NULL
        OR p_provider_result->>'referenceId'
          IS DISTINCT FROM v_payment.provider_reconcile_reference_id
      )
    )
    OR p_provider_result->>'posId' IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_pos_id'
    OR p_provider_result->>'deviceId' IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_device_id'
    OR p_provider_result->>'terminalSn'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_terminal_sn'
    OR (
      v_trans_type = 'sale'
      AND NULLIF(p_provider_result->'transData'->>'metadata', '') IS NOT NULL
      AND p_provider_result->'transData'->>'metadata'
        IS DISTINCT FROM v_payment.provider_order_id
    )
    OR (
      v_trans_type = 'getLast'
      AND p_provider_result->'transData'->>'metadata'
        IS DISTINCT FROM v_payment.provider_order_id
    )
    OR COALESCE(v_provider_transaction_id, '') !~ '^[0-9]{1,10}$'
    OR p_provider_result->'transData'->>'paymentChannel' IS DISTINCT FROM 'duitNowQr'
    OR p_provider_result->'transData'->>'currency' IS DISTINCT FROM 'MYR'
    OR NULLIF(btrim(COALESCE(p_provider_result->'transData'->>'mid', '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_provider_result->'transData'->>'tid', '')), '') IS NULL
    OR COALESCE(p_provider_result->'transData'->>'transAmt', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((p_provider_result->'transData'->>'transAmt')::NUMERIC, 2)
      <> round(v_payment.amount_rm, 2) THEN
    RAISE EXCEPTION 'Fiuu cloudECR response is not fulfillable';
  END IF;

  PERFORM public.require_pos_fiuu_cloudecr_br001_mapping(
    v_payment.organization_id,
    v_payment.branch_id,
    v_payment.sale_payload->>'fiuu_cloudecr_pos_id',
    v_payment.sale_payload->>'fiuu_cloudecr_device_id',
    v_payment.sale_payload->>'fiuu_cloudecr_terminal_sn',
    p_provider_result->'transData'->>'mid',
    p_provider_result->'transData'->>'tid',
    true
  );

  IF v_payment.status = 'REPORTED' THEN
    UPDATE public.pos_online_payments
    SET provider_result = p_provider_result,
        provider_status_checked_at = now(),
        updated_at = now()
    WHERE id = v_payment.id
      AND status = 'REPORTED'
      AND provider_transaction_id = v_provider_transaction_id;

    RETURN jsonb_build_object(
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'provider_transaction_id', v_payment.provider_transaction_id
    );
  END IF;

  UPDATE public.pos_online_payments
  SET status = 'REPORTED',
      provider_transaction_id = v_provider_transaction_id,
      provider_result = p_provider_result,
      provider_sale_reported_at = now(),
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      provider_confirmed_by = v_payment.created_by,
      gateway_ref = v_provider_transaction_id,
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'REPORTED',
    'provider_transaction_id', v_provider_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_pos_fiuu_cloudecr_payment(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_pos_fiuu_cloudecr_payment(UUID, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.fulfill_pos_fiuu_cloudecr_payment(UUID, JSONB);
CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_cloudecr_payment(
  p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_payment public.pos_online_payments%ROWTYPE;
  v_result JSONB;
  v_existing_receipt JSONB;
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
  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;

  PERFORM id
  FROM public.pos_shifts
  WHERE id = v_shift_id
    AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS shift is not open';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.provider <> 'fiuu_cloudecr' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;
  IF v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION 'Fiuu cloudECR pilot is restricted to BR001';
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    SELECT receipt_data INTO v_existing_receipt
    FROM public.pos_receipts
    WHERE transaction_id = v_payment.transaction_id;
    RETURN COALESCE(
      v_existing_receipt,
      jsonb_build_object('transaction_id', v_payment.transaction_id)
    );
  END IF;

  IF v_payment.status <> 'REPORTED'
    OR v_payment.provider_transaction_id IS NULL
    OR COALESCE(v_payment.provider_result->>'transType', '') NOT IN ('sale', 'getLast')
    OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'responseCode' IS DISTINCT FROM '00'
    OR jsonb_typeof(v_payment.provider_result->'transData') IS DISTINCT FROM 'object'
    OR v_payment.provider_result->'transData'->>'transId'
      IS DISTINCT FROM v_payment.provider_transaction_id
    OR v_payment.provider_result->>'posId'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_pos_id'
    OR v_payment.provider_result->>'deviceId'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_device_id'
    OR v_payment.provider_result->>'terminalSn'
      IS DISTINCT FROM v_payment.sale_payload->>'fiuu_cloudecr_terminal_sn'
    OR (
      v_payment.provider_result->>'transType' = 'sale'
      AND v_payment.provider_result->>'referenceId'
        IS DISTINCT FROM v_payment.provider_order_id
    )
    OR (
      v_payment.provider_result->>'transType' = 'getLast'
      AND (
        v_payment.provider_reconcile_reference_id IS NULL
        OR v_payment.provider_result->>'referenceId'
          IS DISTINCT FROM v_payment.provider_reconcile_reference_id
      )
    )
    OR v_payment.provider_result->'transData'->>'paymentChannel'
      IS DISTINCT FROM 'duitNowQr'
    OR v_payment.provider_result->'transData'->>'currency' IS DISTINCT FROM 'MYR'
    OR NULLIF(btrim(COALESCE(v_payment.provider_result->'transData'->>'mid', '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(v_payment.provider_result->'transData'->>'tid', '')), '') IS NULL
    OR COALESCE(v_payment.provider_result->'transData'->>'transAmt', '')
      !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR round((v_payment.provider_result->'transData'->>'transAmt')::NUMERIC, 2)
      <> round(v_payment.amount_rm, 2)
    OR COALESCE(v_payment.provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment is not fulfillable';
  END IF;

  PERFORM public.require_pos_fiuu_cloudecr_br001_mapping(
    v_payment.organization_id,
    v_payment.branch_id,
    v_payment.sale_payload->>'fiuu_cloudecr_pos_id',
    v_payment.sale_payload->>'fiuu_cloudecr_device_id',
    v_payment.sale_payload->>'fiuu_cloudecr_terminal_sn',
    v_payment.provider_result->'transData'->>'mid',
    v_payment.provider_result->'transData'->>'tid',
    true
  );

  -- The customer has already approved the charged amount. Refuse to issue a
  -- different receipt if the catalogue changes before fulfilment. An affected
  -- payment remains REPORTED for Finance/manual resolution instead of silently
  -- changing its price or issuing duplicate stock movements.
  IF jsonb_typeof(v_payment.sale_payload->'pricing_snapshot') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_payment.sale_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is missing';
  END IF;
  IF jsonb_array_length(v_payment.sale_payload->'pricing_snapshot')
    <> jsonb_array_length(v_payment.sale_payload->'items') THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is incomplete';
  END IF;

  FOR v_pricing_item IN
    SELECT * FROM jsonb_array_elements(v_payment.sale_payload->'pricing_snapshot')
  LOOP
    BEGIN
      v_snapshot_quantity := (v_pricing_item->>'quantity')::INTEGER;
      v_snapshot_unit_price := (v_pricing_item->>'unit_price')::NUMERIC;
      v_snapshot_line_total := (v_pricing_item->>'line_total')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is invalid';
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
      RAISE EXCEPTION 'Fiuu cloudECR sale pricing snapshot is invalid';
    END IF;

    v_snapshot_subtotal := v_snapshot_subtotal
      + (v_snapshot_unit_price * v_snapshot_quantity);
  END LOOP;

  -- Hold every referenced catalogue row in deterministic order until
  -- process_pos_sale_internal has created the receipt. This prevents a price
  -- update between snapshot validation and the processor's own price reads.
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
    RAISE EXCEPTION 'Fiuu cloudECR sale contains duplicate or unavailable products';
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
      RAISE EXCEPTION 'Fiuu cloudECR product price changed after payment started';
    END IF;
  END LOOP;

  BEGIN
    v_payload_subtotal := (v_payment.sale_payload->>'subtotal')::NUMERIC;
    v_payload_total := (v_payment.sale_payload->>'total')::NUMERIC;
    v_payload_qr := (v_payment.sale_payload->>'qr_amount')::NUMERIC;
    v_payload_cash := COALESCE((v_payment.sale_payload->>'cash_amount')::NUMERIC, 0);
    v_payload_discount := COALESCE((v_payment.sale_payload->>'discount')::NUMERIC, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale totals snapshot is invalid';
  END;
  IF v_payload_subtotal IS NULL OR v_payload_total IS NULL OR v_payload_qr IS NULL THEN
    RAISE EXCEPTION 'Fiuu cloudECR sale totals snapshot is missing';
  END IF;

  v_snapshot_total := v_snapshot_subtotal - v_payload_discount;
  IF round(v_snapshot_subtotal, 2) <> round(v_payload_subtotal, 2)
    OR round(v_snapshot_total, 2)
      <> round(v_payload_total, 2)
    OR round(v_payload_qr, 2) <> round(v_payment.amount_rm, 2)
    OR round(v_payload_cash + v_payload_qr, 2) <> round(v_snapshot_total, 2) THEN
    RAISE EXCEPTION 'Fiuu cloudECR charged amount does not match pricing snapshot';
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
      provider_status_checked_at = now(),
      provider_confirmed_at = now(),
      provider_confirmed_by = v_payment.created_by,
      gateway_ref = v_payment.provider_transaction_id,
      transaction_id = (v_result->>'transaction_id')::UUID,
      paid_at = now(),
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pos_fiuu_cloudecr_payment(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pos_fiuu_cloudecr_payment(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recover_pos_fiuu_cloudecr_fulfillment(
  p_payment_id UUID,
  p_recovery_key TEXT,
  p_expected_provider_transaction_id TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shift_id UUID;
  v_shift_status TEXT;
  v_payment public.pos_online_payments%ROWTYPE;
  v_attempt public.pos_fiuu_cloudecr_recovery_attempts%ROWTYPE;
  v_attempt_id UUID;
  v_result JSONB;
  v_transaction_id UUID;
  v_error_state TEXT;
  v_error_message TEXT;
BEGIN
  IF p_payment_id IS NULL
    OR COALESCE(p_recovery_key, '') !~ '^[A-Za-z0-9_-]{8,64}$'
    OR COALESCE(p_expected_provider_transaction_id, '') !~ '^[0-9]{1,10}$'
    OR p_reason IS NULL
    OR p_reason IS DISTINCT FROM btrim(p_reason)
    OR length(p_reason) NOT BETWEEN 8 AND 500
    OR p_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = 'Invalid Fiuu cloudECR fulfilment recovery request';
  END IF;

  SELECT shift_id INTO v_shift_id
  FROM public.pos_online_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS payment not found';
  END IF;

  -- Preserve the shift-first lock order used by reporting, normal fulfilment
  -- and shift closure. An already-PAID idempotent replay remains readable even
  -- after shift closure; only a fresh REPORTED recovery requires OPEN.
  SELECT status::TEXT INTO v_shift_status
  FROM public.pos_shifts
  WHERE id = v_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiuu cloudECR POS shift not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.pos_online_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.provider <> 'fiuu_cloudecr'
    OR v_payment.shift_id IS DISTINCT FROM v_shift_id
    OR v_payment.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
    RAISE EXCEPTION 'Fiuu cloudECR BR001 POS payment not found';
  END IF;

  SELECT * INTO v_attempt
  FROM public.pos_fiuu_cloudecr_recovery_attempts
  WHERE payment_id = p_payment_id
    AND recovery_key = p_recovery_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.expected_provider_transaction_id
      IS DISTINCT FROM p_expected_provider_transaction_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'invalid_parameter_value',
        MESSAGE = 'Fiuu cloudECR recovery key identity mismatch';
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
      'recovery_id', v_attempt.id,
      'payment_id', v_attempt.payment_id,
      'status', v_attempt.status,
      'transaction_id', v_attempt.transaction_id,
      'failure_code', v_attempt.failure_code,
      'idempotent_replay', true
    ));
  END IF;

  IF v_payment.provider_transaction_id
      IS DISTINCT FROM p_expected_provider_transaction_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Fiuu cloudECR recovery transaction reference mismatch';
  END IF;

  IF v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL THEN
    INSERT INTO public.pos_fiuu_cloudecr_recovery_attempts (
      payment_id,
      recovery_key,
      expected_provider_transaction_id,
      reason,
      status,
      transaction_id,
      completed_at
    ) VALUES (
      v_payment.id,
      p_recovery_key,
      p_expected_provider_transaction_id,
      p_reason,
      'SUCCEEDED',
      v_payment.transaction_id,
      now()
    )
    RETURNING id INTO v_attempt_id;

    RETURN jsonb_build_object(
      'recovery_id', v_attempt_id,
      'payment_id', v_payment.id,
      'status', 'SUCCEEDED',
      'transaction_id', v_payment.transaction_id,
      'idempotent_replay', true
    );
  END IF;

  IF v_payment.status <> 'REPORTED'
    OR v_payment.provider_transaction_id IS NULL
    OR v_payment.provider_result->>'statusCode' IS DISTINCT FROM '00'
    OR v_payment.provider_result->>'responseCode' IS DISTINCT FROM '00'
    OR jsonb_typeof(v_payment.provider_result->'transData') IS DISTINCT FROM 'object'
    OR v_payment.provider_result->'transData'->>'transId'
      IS DISTINCT FROM v_payment.provider_transaction_id
    OR NULLIF(btrim(COALESCE(v_payment.provider_result->'transData'->>'mid', '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(v_payment.provider_result->'transData'->>'tid', '')), '') IS NULL
    OR COALESCE(v_payment.provider_result->>'signature', '') !~ '^[A-Fa-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fiuu cloudECR BR001 payment is not recoverable';
  END IF;

  PERFORM public.require_pos_fiuu_cloudecr_br001_mapping(
    v_payment.organization_id,
    v_payment.branch_id,
    v_payment.sale_payload->>'fiuu_cloudecr_pos_id',
    v_payment.sale_payload->>'fiuu_cloudecr_device_id',
    v_payment.sale_payload->>'fiuu_cloudecr_terminal_sn',
    v_payment.provider_result->'transData'->>'mid',
    v_payment.provider_result->'transData'->>'tid',
    true
  );

  INSERT INTO public.pos_fiuu_cloudecr_recovery_attempts (
    payment_id,
    recovery_key,
    expected_provider_transaction_id,
    reason
  ) VALUES (
    v_payment.id,
    p_recovery_key,
    p_expected_provider_transaction_id,
    p_reason
  )
  RETURNING id INTO v_attempt_id;

  BEGIN
    IF v_shift_status IS DISTINCT FROM 'OPEN' THEN
      RAISE EXCEPTION 'Fiuu cloudECR BR001 shift is not open for recovery';
    END IF;

    v_result := public.fulfill_pos_fiuu_cloudecr_payment(v_payment.id);
    v_transaction_id := (v_result->>'transaction_id')::UUID;
    IF v_transaction_id IS NULL THEN
      RAISE EXCEPTION 'Fiuu cloudECR recovery did not produce a transaction';
    END IF;

    UPDATE public.pos_fiuu_cloudecr_recovery_attempts
    SET status = 'SUCCEEDED',
        transaction_id = v_transaction_id,
        completed_at = now()
    WHERE id = v_attempt_id;

    RETURN jsonb_build_object(
      'recovery_id', v_attempt_id,
      'payment_id', v_payment.id,
      'status', 'SUCCEEDED',
      'transaction_id', v_transaction_id,
      'idempotent_replay', false
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_error_state = RETURNED_SQLSTATE,
      v_error_message = MESSAGE_TEXT;

    UPDATE public.pos_fiuu_cloudecr_recovery_attempts
    SET status = 'FAILED',
        failure_code = COALESCE(v_error_state, 'P0001'),
        failure_message = left(
          COALESCE(v_error_message, 'Fiuu cloudECR fulfilment recovery failed'),
          500
        ),
        completed_at = now()
    WHERE id = v_attempt_id;

    RETURN jsonb_build_object(
      'recovery_id', v_attempt_id,
      'payment_id', v_payment.id,
      'status', 'FAILED',
      'failure_code', COALESCE(v_error_state, 'P0001'),
      'idempotent_replay', false
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_pos_fiuu_cloudecr_fulfillment(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_pos_fiuu_cloudecr_fulfillment(
  UUID, TEXT, TEXT, TEXT
) TO service_role;

-- Keep the shift open while a cloudECR response may still be reconciled.
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
          payment.status = 'PENDING'
          AND COALESCE(payment.expires_at, 'infinity'::timestamptz) > now()
        )
        OR (
          payment.provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
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
        MESSAGE = 'POS shift cannot close while a Fiuu payment remains within expiry grace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;
