CREATE TABLE IF NOT EXISTS agent_sales_staff (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 agent_account_id UUID NOT NULL REFERENCES sales_agent_accounts(id) ON DELETE CASCADE,
 outlet_id UUID REFERENCES agent_outlets(id) ON DELETE SET NULL,
 full_name TEXT NOT NULL,
 phone TEXT,
 email TEXT,
 role_title TEXT NOT NULL DEFAULT 'Staf Jualan',
 duty_scope TEXT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sales_staff_account
 ON agent_sales_staff(organization_id, agent_account_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_sales_staff_outlet
 ON agent_sales_staff(outlet_id);

ALTER TABLE agent_sales_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_sales_staff_select ON agent_sales_staff;
CREATE POLICY agent_sales_staff_select ON agent_sales_staff FOR SELECT USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY')
 OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
 )
);

DROP POLICY IF EXISTS agent_sales_staff_manage ON agent_sales_staff;
CREATE POLICY agent_sales_staff_manage ON agent_sales_staff FOR ALL USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
 OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
 )
) WITH CHECK (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
 OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
 )
);
