-- Fail closed for inactive profiles, bind branch access to the profile's
-- organization, and keep completed POS financial rows immutable to direct
-- authenticated Data API writes. Mutations continue through reviewed RPCs.

CREATE OR REPLACE FUNCTION public.organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT organization_id
 FROM public.profiles
 WHERE id = auth.uid()
   AND status = 'ACTIVE'
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT role
 FROM public.profiles
 WHERE id = auth.uid()
   AND status = 'ACTIVE'
$$;

CREATE OR REPLACE FUNCTION public.user_region_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT region_id
 FROM public.profiles
 WHERE id = auth.uid()
   AND status = 'ACTIVE'
$$;

CREATE OR REPLACE FUNCTION public.user_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT branch_id
 FROM public.profiles
 WHERE id = auth.uid()
   AND status = 'ACTIVE'
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE id = auth.uid()
    AND status = 'ACTIVE'
    AND role IN ('SUPER_ADMIN', 'ADMIN')
 )
$$;

CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT EXISTS (
  SELECT 1
  FROM public.profiles p
  JOIN public.branches b
    ON b.id = p_branch_id
   AND b.organization_id = p.organization_id
  WHERE p.id = auth.uid()
    AND p.status = 'ACTIVE'
    AND (
     p.role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY')
     OR p.branch_id = b.id
     OR EXISTS (
      SELECT 1
      FROM public.profile_branch_access pba
      WHERE pba.profile_id = p.id
        AND pba.branch_id = b.id
     )
     OR (p.role = 'AREA_MANAGER' AND b.region_id = p.region_id)
    )
 )
$$;

DROP POLICY IF EXISTS pos_transactions_branch ON public.pos_transactions;
CREATE POLICY pos_transactions_branch_select
 ON public.pos_transactions
 FOR SELECT
 USING (
  organization_id = public.organization_id()
  AND public.has_branch_access(branch_id)
 );

DROP POLICY IF EXISTS pos_tx_items_via_tx ON public.pos_transaction_items;
CREATE POLICY pos_tx_items_via_tx_select
 ON public.pos_transaction_items
 FOR SELECT
 USING (
  EXISTS (
   SELECT 1
   FROM public.pos_transactions t
   WHERE t.id = transaction_id
     AND t.organization_id = public.organization_id()
     AND public.has_branch_access(t.branch_id)
  )
 );

DROP POLICY IF EXISTS pos_payments_via_tx ON public.pos_payments;
CREATE POLICY pos_payments_via_tx_select
 ON public.pos_payments
 FOR SELECT
 USING (
  EXISTS (
   SELECT 1
   FROM public.pos_transactions t
   WHERE t.id = transaction_id
     AND t.organization_id = public.organization_id()
     AND public.has_branch_access(t.branch_id)
  )
 );

DROP POLICY IF EXISTS pos_receipts_via_tx ON public.pos_receipts;
CREATE POLICY pos_receipts_via_tx_select
 ON public.pos_receipts
 FOR SELECT
 USING (
  EXISTS (
   SELECT 1
   FROM public.pos_transactions t
   WHERE t.id = transaction_id
     AND t.organization_id = public.organization_id()
     AND public.has_branch_access(t.branch_id)
  )
 );

REVOKE INSERT, UPDATE, DELETE
 ON public.pos_transactions,
    public.pos_transaction_items,
    public.pos_payments,
    public.pos_receipts
 FROM authenticated;

GRANT SELECT
 ON public.pos_transactions,
    public.pos_transaction_items,
    public.pos_payments,
    public.pos_receipts
 TO authenticated;
