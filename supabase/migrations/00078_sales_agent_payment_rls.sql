-- RLS: ejen boleh cipta/kemas kini pembayaran & langganan POS

CREATE POLICY agent_payments_insert ON agent_online_payments FOR INSERT WITH CHECK (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
    OR (
      agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
      AND created_by = auth.uid()
    )
  )
);

CREATE POLICY agent_payments_update ON agent_online_payments FOR UPDATE USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
    OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
  )
);

CREATE POLICY agent_outlet_subs_select ON agent_outlet_subscriptions FOR SELECT USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'FINANCE')
    OR outlet_id IN (
      SELECT o.id FROM agent_outlets o
      JOIN sales_agent_accounts a ON a.id = o.agent_account_id
      WHERE a.profile_id = auth.uid()
    )
  )
);

CREATE POLICY agent_outlet_subs_insert ON agent_outlet_subscriptions FOR INSERT WITH CHECK (
  organization_id = public.organization_id()
  AND outlet_id IN (
    SELECT o.id FROM agent_outlets o
    JOIN sales_agent_accounts a ON a.id = o.agent_account_id
    WHERE a.profile_id = auth.uid()
  )
);

CREATE POLICY agent_outlet_subs_update ON agent_outlet_subscriptions FOR UPDATE USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
    OR outlet_id IN (
      SELECT o.id FROM agent_outlets o
      JOIN sales_agent_accounts a ON a.id = o.agent_account_id
      WHERE a.profile_id = auth.uid()
    )
  )
);
