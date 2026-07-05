-- RKJ One: HRMIS employee self-service
-- Migration 00110

CREATE TABLE IF NOT EXISTS hr_service_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES legal_entities(id) ON DELETE SET NULL,
 branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
 profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
 request_number TEXT NOT NULL,
 request_type TEXT NOT NULL CHECK (
 request_type IN (
 'LEAVE',
 'PROFILE_UPDATE',
 'DOCUMENT',
 'PAYROLL',
 'TRANSFER',
 'ATTENDANCE',
 'UNIFORM_EQUIPMENT',
 'HR_HELP'
 )
 ),
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 start_date DATE,
 end_date DATE,
 priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
 status IN ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED')
 ),
 reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
 reviewed_at TIMESTAMPTZ,
 reviewer_note TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_hr_service_requests_org_status
 ON hr_service_requests(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_service_requests_profile
 ON hr_service_requests(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_service_requests_staff
 ON hr_service_requests(staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_service_requests_company
 ON hr_service_requests(legal_entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_service_requests_branch
 ON hr_service_requests(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_service_requests_type
 ON hr_service_requests(request_type, created_at DESC);

ALTER TABLE hr_service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_service_requests_select ON hr_service_requests;
CREATE POLICY hr_service_requests_select ON hr_service_requests
FOR SELECT USING (
 organization_id = public.organization_id()
 AND (
 profile_id = auth.uid()
 OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER')
 OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
 )
);

DROP POLICY IF EXISTS hr_service_requests_insert_own ON hr_service_requests;
CREATE POLICY hr_service_requests_insert_own ON hr_service_requests
FOR INSERT WITH CHECK (
 organization_id = public.organization_id()
 AND profile_id = auth.uid()
);

DROP POLICY IF EXISTS hr_service_requests_update ON hr_service_requests;
CREATE POLICY hr_service_requests_update ON hr_service_requests
FOR UPDATE USING (
 organization_id = public.organization_id()
 AND (
 (profile_id = auth.uid() AND status IN ('SUBMITTED', 'IN_REVIEW'))
 OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER')
 OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
 )
) WITH CHECK (
 organization_id = public.organization_id()
);

DROP TRIGGER IF EXISTS set_updated_at ON hr_service_requests;
CREATE TRIGGER set_updated_at
 BEFORE UPDATE ON hr_service_requests
 FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON hr_service_requests TO authenticated;

COMMENT ON TABLE hr_service_requests IS
'Employee HRMIS self-service requests for local staff across RKJ legal entities.';
COMMENT ON COLUMN hr_service_requests.request_type IS
'LEAVE, PROFILE_UPDATE, DOCUMENT, PAYROLL, TRANSFER, ATTENDANCE, UNIFORM_EQUIPMENT, HR_HELP';
