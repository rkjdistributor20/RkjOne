-- Prevent a POS shift from closing while an associated payment can still
-- complete, and serialize new pending payments against shift closure.

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
      AND payment.status = 'PENDING'
      AND COALESCE(payment.expires_at, 'infinity'::timestamptz) > now()
    ORDER BY payment.id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'POS shift cannot close while an unexpired payment is pending';
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

CREATE OR REPLACE FUNCTION public.guard_pending_payment_open_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'PENDING'
    AND COALESCE(NEW.expires_at, 'infinity'::timestamptz) > now() THEN
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
        MESSAGE = 'A pending POS payment requires a matching open shift';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_payment_open_shift()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pending_payment_open_shift
  ON public.pos_online_payments;

CREATE TRIGGER guard_pending_payment_open_shift
BEFORE INSERT ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_payment_open_shift();
