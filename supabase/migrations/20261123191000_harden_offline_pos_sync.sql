-- Offline POS is a cash-only resilience path. Provider-backed QR must never
-- be reconstructed from mutable browser storage, and ordinary staff may only
-- post an offline sale while they still belong to the exact open shift.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.guard_offline_pos_transaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role public.user_role;
  v_actor_status public.entity_status;
  v_actor_org_id UUID;
BEGIN
  IF NEW.offline_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_method <> 'CASH'
    OR COALESCE(NEW.qr_amount, 0) <> 0 THEN
    RAISE EXCEPTION
      'Offline POS only accepts cash payments without a QR amount';
  END IF;

  SELECT role, status, organization_id
  INTO v_actor_role, v_actor_status, v_actor_org_id
  FROM public.profiles
  WHERE id = NEW.created_by;

  IF NOT FOUND
    OR v_actor_status <> 'ACTIVE'
    OR v_actor_org_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Offline POS actor is not active in this organization';
  END IF;

  IF v_actor_role::TEXT NOT IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
    AND NOT EXISTS (
      SELECT 1
      FROM public.pos_shift_staff_members AS member
      JOIN public.pos_shifts AS shift
        ON shift.id = member.shift_id
       AND shift.organization_id = member.organization_id
       AND shift.branch_id = member.branch_id
      WHERE member.organization_id = NEW.organization_id
        AND member.branch_id = NEW.branch_id
        AND member.shift_id = NEW.shift_id
        AND member.profile_id = NEW.created_by
        AND member.status = 'ACTIVE'
        AND shift.status = 'OPEN'
    ) THEN
    RAISE EXCEPTION
      'Offline POS actor is not an active member of this open shift';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_offline_pos_transaction_insert()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_offline_pos_transaction_insert
ON public.pos_transactions;

CREATE TRIGGER guard_offline_pos_transaction_insert
BEFORE INSERT ON public.pos_transactions
FOR EACH ROW
EXECUTE FUNCTION public.guard_offline_pos_transaction_insert();

COMMENT ON FUNCTION public.guard_offline_pos_transaction_insert() IS
  'Rejects non-cash offline POS postings and requires an active actor plus exact open-shift membership for non-administrative roles.';

-- Rollback:
-- DROP TRIGGER IF EXISTS guard_offline_pos_transaction_insert
--   ON public.pos_transactions;
-- DROP FUNCTION IF EXISTS public.guard_offline_pos_transaction_insert();
