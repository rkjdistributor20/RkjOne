-- RKJ One: formal driver-to-vehicle responsibility and acknowledgement.

ALTER TABLE public.driver_vehicle_assignments
 ADD COLUMN IF NOT EXISTS assignment_role TEXT NOT NULL DEFAULT 'RELIEF',
 ADD COLUMN IF NOT EXISTS responsibility_notes TEXT,
 ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.driver_vehicle_assignments dva
SET assignment_role = CASE
 WHEN v.default_driver_id = dva.driver_id THEN 'PRIMARY'
 ELSE 'RELIEF'
END
FROM public.vehicles v
WHERE v.id = dva.vehicle_id
 AND dva.is_active = true;

UPDATE public.driver_vehicle_assignments
SET responsibility_notes = COALESCE(
 responsibility_notes,
 'Periksa kenderaan sebelum bergerak; gunakan untuk tugasan rasmi; rekod GPS/status, minyak, tol, POD dan kerosakan; pulangkan bersih dan selamat.'
)
WHERE is_active = true;

WITH ranked AS (
 SELECT id,
  row_number() OVER (
   PARTITION BY organization_id, driver_id, vehicle_id
   ORDER BY assigned_at DESC, created_at DESC, id DESC
  ) AS row_no
 FROM public.driver_vehicle_assignments
 WHERE is_active = true
)
UPDATE public.driver_vehicle_assignments dva
SET is_active = false,
 unassigned_at = COALESCE(dva.unassigned_at, now())
FROM ranked
WHERE ranked.id = dva.id
 AND ranked.row_no > 1;

ALTER TABLE public.driver_vehicle_assignments
 DROP CONSTRAINT IF EXISTS driver_vehicle_assignments_role_check;

ALTER TABLE public.driver_vehicle_assignments
 ADD CONSTRAINT driver_vehicle_assignments_role_check
 CHECK (assignment_role IN ('PRIMARY', 'RELIEF', 'ASSISTANT'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_vehicle_active_pair
 ON public.driver_vehicle_assignments(organization_id, driver_id, vehicle_id)
 WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_active_primary_driver
 ON public.driver_vehicle_assignments(organization_id, vehicle_id)
 WHERE is_active = true AND assignment_role = 'PRIMARY';

CREATE INDEX IF NOT EXISTS idx_driver_vehicle_acknowledgement
 ON public.driver_vehicle_assignments(organization_id, acknowledged_at)
 WHERE is_active = true;

COMMENT ON COLUMN public.driver_vehicle_assignments.assignment_role IS
 'PRIMARY = penjaga operasi utama, RELIEF = driver ganti, ASSISTANT = pembantu yang dibenarkan.';
COMMENT ON COLUMN public.driver_vehicle_assignments.acknowledged_at IS
 'Masa driver mengesahkan penerimaan tanggungjawab terhadap kenderaan.';
