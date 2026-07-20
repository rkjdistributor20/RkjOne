-- Company vehicle governance: custody, business use, cost, compliance and incidents.
ALTER TABLE public.vehicles
 ADD COLUMN IF NOT EXISTS vehicle_category TEXT NOT NULL DEFAULT 'DELIVERY'
  CHECK (vehicle_category IN ('MANAGER', 'DELIVERY', 'FACTORY', 'REPLACEMENT')),
 ADD COLUMN IF NOT EXISTS road_tax_expiry DATE,
 ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
 ADD COLUMN IF NOT EXISTS inspection_expiry DATE,
 ADD COLUMN IF NOT EXISTS permit_expiry DATE,
 ADD COLUMN IF NOT EXISTS compliance_notes TEXT;

UPDATE public.vehicles
SET vehicle_category = 'MANAGER', updated_at = now()
WHERE company_custodian_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_category
 ON public.vehicles(organization_id, vehicle_category, status);

CREATE TABLE IF NOT EXISTS public.company_vehicle_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
 custodian_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 acknowledged_at TIMESTAMPTZ,
 returned_at TIMESTAMPTZ,
 start_odometer_km NUMERIC(12,2) CHECK (start_odometer_km IS NULL OR start_odometer_km >= 0),
 end_odometer_km NUMERIC(12,2) CHECK (end_odometer_km IS NULL OR end_odometer_km >= 0),
 condition_notes TEXT,
 image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETURNED', 'CANCELLED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_vehicle_active_assignment
 ON public.company_vehicle_assignments(vehicle_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_company_vehicle_assignment_custodian
 ON public.company_vehicle_assignments(organization_id, custodian_profile_id, status);

CREATE TABLE IF NOT EXISTS public.company_vehicle_usage_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
 profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 purpose TEXT NOT NULL,
 usage_type TEXT NOT NULL DEFAULT 'COMPANY' CHECK (usage_type IN ('COMPANY', 'EMERGENCY', 'OTHER')),
 destination TEXT,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ended_at TIMESTAMPTZ,
 start_odometer_km NUMERIC(12,2) CHECK (start_odometer_km IS NULL OR start_odometer_km >= 0),
 end_odometer_km NUMERIC(12,2) CHECK (end_odometer_km IS NULL OR end_odometer_km >= 0),
 start_latitude NUMERIC(10,7),
 start_longitude NUMERIC(10,7),
 end_latitude NUMERIC(10,7),
 end_longitude NUMERIC(10,7),
 notes TEXT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (end_odometer_km IS NULL OR start_odometer_km IS NULL OR end_odometer_km >= start_odometer_km)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_vehicle_active_usage
 ON public.company_vehicle_usage_logs(vehicle_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_company_vehicle_usage_period
 ON public.company_vehicle_usage_logs(organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.company_vehicle_expenses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
 usage_log_id UUID REFERENCES public.company_vehicle_usage_logs(id) ON DELETE SET NULL,
 submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 expense_type TEXT NOT NULL CHECK (expense_type IN ('FUEL', 'TOLL', 'PARKING', 'MAINTENANCE', 'REPAIR', 'OTHER')),
 amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
 expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
 fuel_litres NUMERIC(10,2) CHECK (fuel_litres IS NULL OR fuel_litres > 0),
 odometer_km NUMERIC(12,2) CHECK (odometer_km IS NULL OR odometer_km >= 0),
 receipt_url TEXT,
 notes TEXT,
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
 reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_vehicle_expenses_period
 ON public.company_vehicle_expenses(organization_id, expense_date DESC, status);

CREATE TABLE IF NOT EXISTS public.company_vehicle_incidents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
 reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 incident_type TEXT NOT NULL CHECK (incident_type IN ('ACCIDENT', 'BREAKDOWN', 'DAMAGE', 'SUMMONS', 'THEFT', 'OTHER')),
 severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
 incident_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 latitude NUMERIC(10,7),
 longitude NUMERIC(10,7),
 location TEXT,
 description TEXT NOT NULL,
 image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
 police_report_no TEXT,
 insurer_reference TEXT,
 workshop TEXT,
 estimated_cost NUMERIC(12,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
 actual_cost NUMERIC(12,2) CHECK (actual_cost IS NULL OR actual_cost >= 0),
 downtime_start TIMESTAMPTZ,
 downtime_end TIMESTAMPTZ,
 replacement_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'IN_REPAIR', 'RESOLVED', 'CLOSED')),
 resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_vehicle_incidents_open
 ON public.company_vehicle_incidents(organization_id, status, incident_at DESC);

CREATE TABLE IF NOT EXISTS public.company_vehicle_documents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
 document_type TEXT NOT NULL CHECK (document_type IN ('ROAD_TAX', 'INSURANCE', 'INSPECTION', 'PERMIT', 'REGISTRATION', 'OTHER')),
 document_name TEXT NOT NULL,
 document_url TEXT,
 issued_at DATE,
 expires_at DATE,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'RENEWED', 'ARCHIVED')),
 uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_vehicle_documents_expiry
 ON public.company_vehicle_documents(organization_id, expires_at, status);

DO $$
DECLARE
 table_name TEXT;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
  'company_vehicle_assignments', 'company_vehicle_usage_logs',
  'company_vehicle_expenses', 'company_vehicle_incidents', 'company_vehicle_documents'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', table_name);
  EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at()', table_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
 END LOOP;
END $$;

-- Existing custodians become the first auditable handover records.
INSERT INTO public.company_vehicle_assignments (
 organization_id, vehicle_id, custodian_profile_id, assigned_at, condition_notes, status
)
SELECT v.organization_id, v.id, v.company_custodian_profile_id,
 COALESCE(v.company_assigned_at, now()), v.company_usage_note, 'ACTIVE'
FROM public.vehicles v
WHERE v.company_custodian_profile_id IS NOT NULL
ON CONFLICT (vehicle_id) WHERE status = 'ACTIVE' DO NOTHING;

-- Managers can see governance records; custodians see only their own vehicle records.
CREATE POLICY company_vehicle_assignments_read ON public.company_vehicle_assignments
 FOR SELECT USING (
  organization_id = public.organization_id()
  AND (public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'MAINTENANCE_MANAGER')
   OR custodian_profile_id = auth.uid())
 );
CREATE POLICY company_vehicle_usage_read ON public.company_vehicle_usage_logs
 FOR SELECT USING (
  organization_id = public.organization_id()
  AND (public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER')
   OR profile_id = auth.uid())
 );
CREATE POLICY company_vehicle_expenses_read ON public.company_vehicle_expenses
 FOR SELECT USING (
  organization_id = public.organization_id()
  AND (public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'FINANCE', 'MAINTENANCE_MANAGER')
   OR submitted_by = auth.uid())
 );
CREATE POLICY company_vehicle_incidents_read ON public.company_vehicle_incidents
 FOR SELECT USING (
  organization_id = public.organization_id()
  AND (public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'MAINTENANCE_MANAGER')
   OR reported_by = auth.uid())
 );
CREATE POLICY company_vehicle_documents_read ON public.company_vehicle_documents
 FOR SELECT USING (
  organization_id = public.organization_id()
  AND (public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'MAINTENANCE_MANAGER')
   OR EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.company_custodian_profile_id = auth.uid()
   ))
 );
