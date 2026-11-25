-- Opt-in by exact branch UUID only after the closed-shift posting path and UAT
-- are ready. This migration does not enable any production branch.
SET lock_timeout = '5s';

CREATE TABLE public.pos_fiuu_vt_shift_close_rollout (
  branch_id UUID PRIMARY KEY REFERENCES public.branches(id),
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.pos_fiuu_vt_shift_close_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_fiuu_vt_shift_close_rollout FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.pos_fiuu_vt_shift_close_rollout TO service_role;

CREATE TABLE public.pos_fiuu_vt_shift_closures (
  shift_id UUID PRIMARY KEY REFERENCES public.pos_shifts(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  review_payment_ids UUID[] NOT NULL,
  close_snapshot JSONB NOT NULL
);
ALTER TABLE public.pos_fiuu_vt_shift_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_fiuu_vt_shift_closures FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pos_fiuu_vt_shift_closures TO service_role;

CREATE OR REPLACE FUNCTION public.guard_pos_shift_close_pending_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_review_ids UUID[];
  v_review_amount NUMERIC;
BEGIN
  IF OLD.status <> 'OPEN' OR NEW.status <> 'CLOSED' THEN
    RETURN NEW;
  END IF;

  v_allowed := NEW.actual_work_ended_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pos_fiuu_vt_shift_closures closure
    WHERE closure.shift_id = OLD.id AND closure.branch_id = OLD.branch_id
      AND closure.organization_id = OLD.organization_id
      AND closure.close_snapshot->>'close_intent_xid' = txid_current()::TEXT
  );

  -- Only explicitly released VT payments or already quarantined payments may
  -- move with the original shift into background reconciliation. A QR with
  -- a cash component still requires supervision before closing the drawer.
  IF v_allowed THEN
    SELECT COALESCE(array_agg(payment.id ORDER BY payment.id), ARRAY[]::UUID[]),
           COALESCE(sum(payment.amount_rm), 0)
    INTO v_review_ids, v_review_amount
    FROM public.pos_online_payments AS payment
    WHERE payment.organization_id = OLD.organization_id
      AND payment.branch_id = OLD.branch_id
      AND payment.shift_id = OLD.id
      AND payment.provider = 'fiuu_vt'
      AND payment.sale_payload->>'payment_method' = 'QR'
      AND payment.sale_payload->>'cash_amount' IN ('0', '0.0', '0.00')
      AND payment.transaction_id IS NULL
      AND payment.paid_at IS NULL
      AND (
        (payment.status IN ('PENDING', 'REPORTED') AND payment.fiuu_vt_cashier_released_at IS NOT NULL)
        OR (payment.status = 'QUARANTINED' AND payment.fiuu_vt_review_required)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.pos_fiuu_vt_attempts AS attempt
        WHERE attempt.payment_id = payment.id
          AND attempt.op_type = 'SALE'
          AND attempt.state IN ('PREPARED', 'LAUNCHED')
          AND attempt.expires_at > clock_timestamp()
      );
  ELSE
    v_review_ids := ARRAY[]::UUID[];
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_online_payments AS payment
    WHERE payment.organization_id = OLD.organization_id
      AND payment.branch_id = OLD.branch_id
      AND payment.shift_id = OLD.id
      AND NOT (payment.id = ANY(v_review_ids))
      AND (
        payment.status = 'REPORTED'
        OR (payment.provider = 'fiuu' AND payment.status = 'PENDING')
        OR (payment.status = 'PENDING'
            AND COALESCE(payment.expires_at, 'infinity'::TIMESTAMPTZ) > now())
        OR (payment.provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')
            AND payment.status IN ('PENDING', 'EXPIRED')
            AND payment.expires_at + INTERVAL '20 minutes' > now())
        OR (payment.provider = 'fiuu_vt'
            AND payment.status = 'QUARANTINED'
            AND payment.fiuu_vt_review_required)
        -- On the new flow, TTL alone is not proof that an unreleased
        -- app-to-app checkout was detached, or that mixed tender is safe.
        OR (v_allowed AND payment.provider = 'fiuu_vt' AND payment.status = 'PENDING')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation',
      MESSAGE = 'POS shift cannot close while a Fiuu payment remains unresolved';
  END IF;

  IF v_allowed THEN
    UPDATE public.pos_fiuu_vt_shift_closures
    SET review_payment_ids = v_review_ids,
      close_snapshot = jsonb_build_object(
        'closed_at', NEW.closed_at, 'closed_by', NEW.closed_by,
        'actual_work_ended_at', NEW.actual_work_ended_at,
        'opening_cash', OLD.opening_cash, 'closing_cash', NEW.closing_cash,
        'expected_cash', NEW.expected_cash, 'cash_variance', NEW.cash_variance,
        'confirmed_cash_sales', OLD.total_cash, 'confirmed_qr_rm', OLD.total_qr,
        'confirmed_sales_rm', OLD.total_sales, 'transaction_count', OLD.transaction_count,
        'qr_review_count', cardinality(v_review_ids), 'qr_review_attempt_total_rm', v_review_amount,
        'staff', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'member_id', member.id, 'staff_id', member.staff_id,
            'profile_id', member.profile_id, 'started_at', member.started_at,
            'ended_at', member.ended_at, 'role', member.role_in_shift
          ) ORDER BY member.started_at, member.id)
          FROM public.pos_shift_staff_members member
          WHERE member.shift_id = OLD.id AND member.status = 'ENDED'
        ), '[]'::JSONB)
      )
    WHERE shift_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_pos_shift_close_pending_payments()
  FROM PUBLIC, anon, authenticated;

-- One transaction for cash, staff and real end time. The existing closer
-- still enforces actor authorization, takes the shift lock and runs the
-- close trigger (the race-safe source of truth for pending payments).
CREATE OR REPLACE FUNCTION public.close_pos_shift_with_qr_review(
  p_shift_id UUID,
  p_actor_id UUID,
  p_device_id UUID,
  p_enrollment_generation INTEGER,
  p_closing_cash NUMERIC,
  p_actual_work_ended_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_shift public.pos_shifts%ROWTYPE;
  v_snapshot JSONB;
  v_result JSONB;
  v_previous_subject TEXT := current_setting('request.jwt.claim.sub', true);
  v_rollout BOOLEAN;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = p_actor_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active profile not found'; END IF;

  SELECT * INTO v_shift FROM public.pos_shifts
  WHERE id = p_shift_id AND status = 'OPEN' AND organization_id = v_actor.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open shift not found'; END IF;

  -- The API authenticates the browser's device cookie before invoking this
  -- service-only RPC. Re-check its enrollment under a database lock.
  PERFORM id FROM public.pos_devices
  WHERE id = p_device_id AND status = 'ACTIVE' AND branch_id = v_shift.branch_id
    AND organization_id = v_shift.organization_id AND enrollment_generation = p_enrollment_generation
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tablet POS rasmi diperlukan'; END IF;

  -- Preserve the existing closer's auth.uid() checks without making the new
  -- close operation reachable using an ordinary authenticated RPC token.
  PERFORM set_config('request.jwt.claim.sub', v_actor.id::TEXT, true);
  IF NOT public.has_branch_access(v_shift.branch_id) THEN
    RAISE EXCEPTION 'Open shift not found or no branch access';
  END IF;
  IF p_actual_work_ended_at IS NULL
    OR NOT isfinite(p_actual_work_ended_at)
    OR p_actual_work_ended_at < COALESCE(v_shift.payroll_started_at, v_shift.business_started_at, v_shift.opened_at)
    OR p_actual_work_ended_at > clock_timestamp() + INTERVAL '5 minutes'
    OR EXISTS (
      SELECT 1 FROM public.pos_shift_staff_members
      WHERE shift_id = p_shift_id AND status = 'ACTIVE' AND started_at > p_actual_work_ended_at
    ) THEN
    RAISE EXCEPTION 'Waktu tamat bekerja sebenar tidak sah';
  END IF;
  IF abs(p_closing_cash - v_shift.opening_cash - v_shift.total_cash) >= 0.01
    AND length(btrim(COALESCE(p_notes, ''))) < 5 THEN
    RAISE EXCEPTION 'Sila isi nota sebab beza tunai sebelum tutup syif';
  END IF;

  IF v_actor.role::TEXT <> 'SUPER_ADMIN' AND (
    NOT EXISTS (
      SELECT 1 FROM public.pos_shift_stock_check_logs
      WHERE shift_id = p_shift_id AND check_type = 'CLOSE_SHIFT'
    ) OR EXISTS (
      SELECT 1 FROM public.pos_staff_presence_logs
      WHERE shift_id = p_shift_id AND status = 'OUT'
    ) OR EXISTS (
      SELECT 1 FROM public.pos_shift_staff_members
      WHERE shift_id = p_shift_id AND status = 'ACTIVE' AND profile_id IS DISTINCT FROM v_actor.id
    )
  ) THEN
    RAISE EXCEPTION 'Selesaikan kiraan stok dan rekod staf sebelum tutup syif';
  END IF;

  UPDATE public.pos_shift_staff_members
  SET status = 'ENDED', ended_at = p_actual_work_ended_at, ended_by = v_actor.id
  WHERE shift_id = p_shift_id AND status = 'ACTIVE';

  UPDATE public.pos_shifts SET actual_work_ended_at = p_actual_work_ended_at
  WHERE id = p_shift_id;

  -- Only this service path can reserve a close intent, and the trigger
  -- consumes it in the same DB transaction. The legacy close RPC continues
  -- to enforce the strict payment guard even on opted-in branches.
  PERFORM branch_id FROM public.pos_fiuu_vt_shift_close_rollout
  WHERE branch_id = v_shift.branch_id FOR SHARE;
  v_rollout := FOUND;
  IF v_rollout THEN
    INSERT INTO public.pos_fiuu_vt_shift_closures (
      shift_id, organization_id, branch_id, review_payment_ids, close_snapshot
    ) VALUES (
      v_shift.id, v_shift.organization_id, v_shift.branch_id, ARRAY[]::UUID[],
      jsonb_build_object('close_intent_xid', txid_current()::TEXT)
    );
  END IF;
  v_result := public.close_pos_shift(p_shift_id, p_closing_cash, p_notes);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_subject, ''), true);
  SELECT close_snapshot INTO v_snapshot FROM public.pos_fiuu_vt_shift_closures
  WHERE shift_id = p_shift_id;
  IF v_rollout AND COALESCE(v_snapshot ? 'closed_at', false) = false THEN
    RAISE EXCEPTION 'POS closing snapshot was not recorded';
  END IF;
  RETURN v_result || jsonb_build_object(
    'actual_work_ended_at', p_actual_work_ended_at,
    'confirmed_qr_rm', v_shift.total_qr,
    'qr_review_count', COALESCE((v_snapshot->>'qr_review_count')::INTEGER, 0),
    'qr_review_attempt_total_rm', COALESCE((v_snapshot->>'qr_review_attempt_total_rm')::NUMERIC, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.close_pos_shift_with_qr_review(UUID, UUID, UUID, INTEGER, NUMERIC, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_pos_shift_with_qr_review(UUID, UUID, UUID, INTEGER, NUMERIC, TIMESTAMPTZ, TEXT)
  TO service_role;
