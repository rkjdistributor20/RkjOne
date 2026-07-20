-- Learn accurate delivery coordinates from stationary driver drop events.

ALTER TABLE public.fleet_geofences
 ADD COLUMN IF NOT EXISTS location_source TEXT NOT NULL DEFAULT 'MANUAL'
  CHECK (location_source IN ('MANUAL', 'BRANCH_IMPORT', 'WAZE_NAME', 'CARTRACK_DROP', 'DEVICE_POD')),
 ADD COLUMN IF NOT EXISTS observation_count INTEGER NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
 ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(4, 3) NOT NULL DEFAULT 1 CHECK (confidence_score BETWEEN 0 AND 1),
 ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS last_observed_at TIMESTAMPTZ;

UPDATE public.fleet_geofences
SET verified_at = COALESCE(verified_at, created_at),
    location_source = CASE WHEN created_by IS NULL THEN 'BRANCH_IMPORT' ELSE 'MANUAL' END,
    confidence_score = GREATEST(confidence_score, 0.8)
WHERE verified_at IS NULL AND observation_count = 0;

CREATE TABLE IF NOT EXISTS public.fleet_location_observations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
 geofence_id UUID REFERENCES public.fleet_geofences(id) ON DELETE SET NULL,
 vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
 driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
 route_stop_id UUID REFERENCES public.hq_delivery_route_stops(id) ON DELETE SET NULL,
 delivery_leg_id UUID REFERENCES public.delivery_legs(id) ON DELETE SET NULL,
 proof_of_delivery_id UUID REFERENCES public.proof_of_delivery(id) ON DELETE SET NULL,
 source TEXT NOT NULL CHECK (source IN ('CARTRACK_DROP', 'DEVICE_POD')),
 latitude DECIMAL(10, 7) NOT NULL,
 longitude DECIMAL(10, 7) NOT NULL,
 speed_kph DECIMAL(8, 2),
 gps_event_at TIMESTAMPTZ,
 distance_to_center_m DECIMAL(10, 2),
 status TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE', 'APPLIED', 'REJECTED')),
 rejection_reason TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_location_observations_branch_time
 ON public.fleet_location_observations(organization_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_location_observations_vehicle_time
 ON public.fleet_location_observations(vehicle_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_location_observation_route_stop
 ON public.fleet_location_observations(route_stop_id, source)
 WHERE route_stop_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_location_observation_pod
 ON public.fleet_location_observations(proof_of_delivery_id, source)
 WHERE proof_of_delivery_id IS NOT NULL;

ALTER TABLE public.fleet_location_observations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.fleet_location_observations TO authenticated;

DROP POLICY IF EXISTS fleet_location_observations_select ON public.fleet_location_observations;
CREATE POLICY fleet_location_observations_select ON public.fleet_location_observations
 FOR SELECT TO authenticated USING (
  organization_id = public.organization_id()
  AND (
   public.is_admin()
   OR public.user_role() IN ('OPERATION_MANAGER', 'AREA_MANAGER')
   OR driver_id IN (
    SELECT d.id FROM public.drivers d
    WHERE d.organization_id = public.organization_id()
      AND d.profile_id = auth.uid()
   )
  )
 );

COMMENT ON TABLE public.fleet_location_observations IS
 'Stationary Cartrack or POD coordinates used to learn the real stock drop point for Waze navigation.';
COMMENT ON COLUMN public.fleet_geofences.confidence_score IS
 'Location confidence from 0 to 1. Three consistent stationary drop observations verify a learned location.';
