-- POS payment rows are financial audit records. Authenticated users may read
-- records within their existing organization/branch scope, but all writes must
-- pass through server routes that validate the actor before using service_role.

DROP POLICY IF EXISTS pos_online_payments_branch
  ON public.pos_online_payments;
DROP POLICY IF EXISTS pos_online_payments_select
  ON public.pos_online_payments;

CREATE POLICY pos_online_payments_select
  ON public.pos_online_payments
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.organization_id()
    AND (
      public.user_role() IN (
        'SUPER_ADMIN',
        'ADMIN',
        'FINANCE',
        'OPERATION_MANAGER',
        'AREA_MANAGER'
      )
      OR public.has_branch_access(branch_id)
    )
  );

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.pos_online_payments
  FROM authenticated;
