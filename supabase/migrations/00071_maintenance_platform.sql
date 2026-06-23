-- Platform Maintenance RKJ One
-- Hanif: Manager Maintenance bawah RKJ Distributor
-- Migration 00071

CREATE TABLE IF NOT EXISTS maintenance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id),
  reported_by UUID REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  report_type TEXT NOT NULL DEFAULT 'MAINTENANCE'
    CHECK (report_type IN ('MAINTENANCE', 'STAFF_SHORTAGE', 'EMERGENCY')),
  category TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK (category IN ('GENERAL', 'ELECTRICAL', 'PLUMBING', 'EQUIPMENT', 'SIGNAGE', 'CLEANLINESS', 'SAFETY', 'STAFFING')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'REVIEWING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS', 'RESOLVED', 'CANCELLED')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  substitute_required BOOLEAN NOT NULL DEFAULT false,
  substitute_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (substitute_status IN ('NOT_REQUIRED', 'REQUESTED', 'HANIF_ASSIGNED', 'COVERED', 'CANCELLED')),
  preferred_visit_date DATE,
  contact_name TEXT,
  contact_phone TEXT,
  manager_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, report_number)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_reports_org_status
  ON maintenance_reports(organization_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_reports_branch
  ON maintenance_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_reports_assigned
  ON maintenance_reports(assigned_to);

CREATE OR REPLACE FUNCTION public.next_maintenance_report_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(report_number, 'MR-([0-9]+)$'))[1]::INT), 0) + 1
  INTO v_next
  FROM maintenance_reports
  WHERE organization_id = p_org_id;

  RETURN 'MR-' || LPAD(v_next::TEXT, 5, '0');
END;
$$;

ALTER TABLE maintenance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY maintenance_reports_select ON maintenance_reports
  FOR SELECT USING (
    organization_id = public.organization_id()
    AND (
      public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER')
      OR reported_by = auth.uid()
      OR branch_id = public.user_branch_id()
      OR branch_id IN (
        SELECT b.id
        FROM branches b
        WHERE b.region_id = public.user_region_id()
      )
    )
  );

CREATE POLICY maintenance_reports_insert ON maintenance_reports
  FOR INSERT WITH CHECK (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER', 'AREA_MANAGER', 'STAFF')
  );

CREATE POLICY maintenance_reports_update ON maintenance_reports
  FOR UPDATE USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER')
  );

INSERT INTO role_permissions (organization_id, role, module, permission)
SELECT o.id, v.role::user_role, v.module, v.permission::permission_level
FROM organizations o
CROSS JOIN (VALUES
  ('SUPER_ADMIN', 'maintenance', 'FULL'),
  ('ADMIN', 'maintenance', 'FULL'),
  ('OPERATION_MANAGER', 'maintenance', 'FULL'),
  ('MAINTENANCE_MANAGER', 'maintenance', 'FULL'),
  ('AREA_MANAGER', 'maintenance', 'FULL_OWN'),
  ('STAFF', 'maintenance', 'OWN')
) AS v(role, module, permission)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, role, module) DO UPDATE SET
  permission = EXCLUDED.permission,
  updated_at = now();

UPDATE legal_entities le
SET
  scope = 'Pengedaran - fleet - Pengurus Kawasan - HQ Distributor - Maintenance semua cawangan',
  updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id
  AND o.code = 'RKJ'
  AND le.code = 'RKJ_DIST';

UPDATE profiles p
SET
  role = 'MAINTENANCE_MANAGER',
  legal_entity_id = le.id,
  branch_id = NULL,
  region_id = NULL,
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'position', 'Manager Maintenance',
    'maintenance_scope', 'Terima report maintenance semua cawangan Roti Kaya Junus daripada staf dan Area Manager',
    'relief_staff_scope', 'Staf ganti apabila berlaku musibah atau kekurangan staf di mana-mana cawangan'
  ),
  updated_at = now()
FROM organizations o
JOIN legal_entities le ON le.organization_id = o.id AND le.code = 'RKJ_DIST'
WHERE p.organization_id = o.id
  AND o.code = 'RKJ'
  AND (
    p.employee_code = 'DIST007'
    OR LOWER(p.email) = 'anipskjp93@gmail.com'
    OR p.full_name ILIKE 'MUHAMMAD HANIF BIN FAKRUL ADABI'
  );

UPDATE staff s
SET
  legal_entity_id = le.id,
  branch_id = NULL,
  region_id = NULL,
  remarks = 'Manager Maintenance - terima report maintenance semua cawangan; staf ganti jika cawangan kekurangan staf',
  updated_at = now()
FROM organizations o
JOIN legal_entities le ON le.organization_id = o.id AND le.code = 'RKJ_DIST'
WHERE s.organization_id = o.id
  AND o.code = 'RKJ'
  AND (
    s.staff_code = 'DIST007'
    OR s.full_name ILIKE 'MUHAMMAD HANIF BIN FAKRUL ADABI'
  );

COMMENT ON TABLE maintenance_reports IS
  'Laporan maintenance cawangan dan permintaan staf ganti; diurus Manager Maintenance RKJ Distributor';

