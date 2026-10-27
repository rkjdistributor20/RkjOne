-- Keep the unsigned Fiuu VT App-to-App pilot physically and logically scoped
-- to BR001. Environment allowlists are not an authorization boundary, so the
-- database independently validates both the authoritative branch row and the
-- immutable branch identity captured in the payment intent.

ALTER TABLE public.pos_online_payments
  DROP CONSTRAINT IF EXISTS pos_online_payments_fiuu_vt_br001_payload;
ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_fiuu_vt_br001_payload
  CHECK (
    provider <> 'fiuu_vt'
    OR sale_payload->>'fiuu_branch_code' = 'BR001'
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_vt_br001_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_branch_code TEXT;
BEGIN
  IF NEW.provider = 'fiuu_vt' THEN
    SELECT upper(btrim(branch.branch_code))
    INTO v_branch_code
    FROM public.branches AS branch
    WHERE branch.id = NEW.branch_id
      AND branch.organization_id = NEW.organization_id;

    IF v_branch_code IS DISTINCT FROM 'BR001'
      OR NEW.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Fiuu VT pilot payment is restricted to BR001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pos_fiuu_vt_br001_payment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pos_fiuu_vt_br001_payment
  ON public.pos_online_payments;
CREATE TRIGGER guard_pos_fiuu_vt_br001_payment
BEFORE INSERT OR UPDATE ON public.pos_online_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_pos_fiuu_vt_br001_payment();
