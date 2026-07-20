-- Company vehicles issued to managers remain separate from operational driver assignments.
ALTER TABLE public.vehicles
 ADD COLUMN IF NOT EXISTS company_custodian_profile_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS company_assigned_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS company_usage_note TEXT;

CREATE INDEX IF NOT EXISTS idx_vehicles_company_custodian
 ON public.vehicles(company_custodian_profile_id)
 WHERE company_custodian_profile_id IS NOT NULL;

WITH assignments(employee_code, plate_key) AS (
 VALUES
  ('DIST009', 'AMC3919'),
  ('DIST001', 'JUX2224'),
  ('DIST007', 'AMC2224'),
  ('DIST010', 'VS4284')
), resolved AS (
 SELECT
  p.organization_id,
  p.id AS profile_id,
  a.plate_key
 FROM assignments a
 JOIN public.profiles p
  ON p.employee_code = a.employee_code
  AND p.status = 'ACTIVE'
)
UPDATE public.vehicles v
SET
 company_custodian_profile_id = r.profile_id,
 company_assigned_at = COALESCE(v.company_assigned_at, now()),
 company_usage_note = 'Kenderaan milik syarikat diberi kepada manager untuk kegunaan rasmi syarikat.',
 updated_at = now()
FROM resolved r
WHERE v.organization_id = r.organization_id
 AND regexp_replace(upper(COALESCE(v.plate_number, '')), '[^A-Z0-9]', '', 'g') = r.plate_key;
