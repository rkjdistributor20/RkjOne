-- Payslip auto-distribution from HR + metadata cadangan AI
-- Migration 00075

ALTER TABLE staff_payslips
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'UPLOAD',
  ADD COLUMN IF NOT EXISTS payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_line_item_id UUID REFERENCES payroll_line_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gross_pay NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS net_pay NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES profiles(id);

COMMENT ON COLUMN staff_payslips.source IS 'UPLOAD | SYSTEM';

CREATE INDEX IF NOT EXISTS idx_staff_payslips_run ON staff_payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_staff_payslips_source ON staff_payslips(source);

-- HR boleh muat naik slip ke folder staf
CREATE POLICY staff_payslips_storage_hr_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-payslips'
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE')
  );

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/html'
]
WHERE id = 'staff-payslips';
