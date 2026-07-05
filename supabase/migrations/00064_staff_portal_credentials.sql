-- Staf portal credentials — hanya Admin HQ & Pengurus Kawasan (via API + RLS)
-- Migration 00064

CREATE TABLE staff_portal_credentials (
 staff_id UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 login_email TEXT NOT NULL,
 portal_password TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_staff_portal_creds_org ON staff_portal_credentials(organization_id);

ALTER TABLE staff_portal_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_portal_creds_personnel ON staff_portal_credentials
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.can_manage_personnel()
 AND EXISTS (
 SELECT 1 FROM staff s
 WHERE s.id = staff_id
 AND (
 public.can_admin_settings()
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND s.branch_id IS NOT NULL
 AND public.has_branch_access(s.branch_id)
 )
 )
 )
 )
 WITH CHECK (
 organization_id = public.organization_id()
 AND public.can_manage_personnel()
 AND EXISTS (
 SELECT 1 FROM staff s
 WHERE s.id = staff_id
 AND (
 public.can_admin_settings()
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND s.branch_id IS NOT NULL
 AND public.has_branch_access(s.branch_id)
 )
 )
 )
 );

-- Service role / API layer handles auth user creation; no direct client insert to auth
