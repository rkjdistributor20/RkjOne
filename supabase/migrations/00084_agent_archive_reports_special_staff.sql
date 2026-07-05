-- Agent archive/reporting and Ejen Khas staff assignments

ALTER TABLE sales_agent_accounts
 ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id),
 ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_agent_accounts_archive
 ON sales_agent_accounts(organization_id, archived_at, status);

CREATE TABLE IF NOT EXISTS agent_account_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES legal_entities(id),
 agent_account_id UUID REFERENCES sales_agent_accounts(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'ARCHIVED', 'REACTIVATED', 'SUSPENDED')),
 company_name TEXT NOT NULL,
 contact_person TEXT,
 contact_email TEXT,
 registration_no TEXT,
 price_group_id UUID REFERENCES agent_price_groups(id),
 price_group_name TEXT,
 reason TEXT,
 event_payload JSONB NOT NULL DEFAULT '{}',
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_account_events_org_created
 ON agent_account_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_account_events_agent
 ON agent_account_events(agent_account_id, created_at DESC);

INSERT INTO agent_account_events (
 organization_id,
 legal_entity_id,
 agent_account_id,
 event_type,
 company_name,
 contact_person,
 contact_email,
 registration_no,
 price_group_id,
 price_group_name,
 reason,
 event_payload,
 created_by,
 created_at
)
SELECT
 a.organization_id,
 a.legal_entity_id,
 a.id,
 'CREATED',
 a.company_name,
 a.contact_person,
 a.contact_email,
 a.registration_no,
 a.assigned_price_group_id,
 g.name,
 'Backfill rekod ejen sedia ada untuk laporan syarikat',
 jsonb_build_object('source', 'migration_00084', 'status', a.status),
 a.approved_by,
 COALESCE(a.approved_at, a.created_at)
FROM sales_agent_accounts a
LEFT JOIN agent_price_groups g ON g.id = a.assigned_price_group_id
WHERE NOT EXISTS (
 SELECT 1 FROM agent_account_events e
 WHERE e.agent_account_id = a.id AND e.event_type = 'CREATED'
);

CREATE TABLE IF NOT EXISTS agent_special_staff_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 agent_account_id UUID NOT NULL REFERENCES sales_agent_accounts(id) ON DELETE CASCADE,
 staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
 legal_entity_id UUID REFERENCES legal_entities(id),
 role_title TEXT NOT NULL DEFAULT 'Agent Khas Syarikat',
 assignment_note TEXT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
 assigned_by UUID REFERENCES profiles(id),
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ended_by UUID REFERENCES profiles(id),
 ended_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (agent_account_id, staff_id, status)
);

CREATE INDEX IF NOT EXISTS idx_agent_special_staff_org_status
 ON agent_special_staff_assignments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_special_staff_profile
 ON agent_special_staff_assignments(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_special_staff_staff
 ON agent_special_staff_assignments(staff_id, status);

ALTER TABLE agent_account_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_special_staff_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_account_events_read ON agent_account_events;
CREATE POLICY agent_account_events_read ON agent_account_events FOR SELECT USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE')
);

DROP POLICY IF EXISTS agent_account_events_admin ON agent_account_events;
CREATE POLICY agent_account_events_admin ON agent_account_events FOR ALL USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
) WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
);

DROP POLICY IF EXISTS agent_special_staff_assignments_read ON agent_special_staff_assignments;
CREATE POLICY agent_special_staff_assignments_read ON agent_special_staff_assignments FOR SELECT USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR')
 OR profile_id = auth.uid()
 )
);

DROP POLICY IF EXISTS agent_special_staff_assignments_admin ON agent_special_staff_assignments;
CREATE POLICY agent_special_staff_assignments_admin ON agent_special_staff_assignments FOR ALL USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
) WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
);

COMMENT ON TABLE agent_account_events IS 'Laporan keluar masuk dan perubahan akaun ejen RKJ Distributor untuk audit syarikat.';
COMMENT ON TABLE agent_special_staff_assignments IS 'Pautan staf Manufacturing/Distributor yang ditugaskan sebagai Agent Khas syarikat.';