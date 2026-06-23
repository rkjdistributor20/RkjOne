-- Payslip upload staf + metadata laporan gaji syarikat
-- Migration 00074

CREATE TABLE staff_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  legal_entity_id UUID REFERENCES legal_entities(id) ON DELETE SET NULL,
  period_label TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INT,
  notes TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_payslips_profile ON staff_payslips(profile_id);
CREATE INDEX idx_staff_payslips_staff ON staff_payslips(staff_id);
CREATE INDEX idx_staff_payslips_org ON staff_payslips(organization_id);

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES legal_entities(id);

COMMENT ON COLUMN payroll_runs.report_type IS 'STANDARD | WEEKLY_FOREIGN | MONTHLY_LOCAL';

ALTER TABLE staff_payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_payslips_own ON staff_payslips
  FOR ALL USING (
    organization_id = public.organization_id()
    AND (
      profile_id = auth.uid()
      OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE')
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-payslips',
  'staff-payslips',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY staff_payslips_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-payslips'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE')
    )
  );

CREATE POLICY staff_payslips_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-payslips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY staff_payslips_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-payslips'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR')
    )
  );
