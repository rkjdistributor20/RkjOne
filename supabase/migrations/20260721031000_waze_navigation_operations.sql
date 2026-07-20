-- RKJ One: governed Waze navigation with Cartrack/geofence audit.

ALTER TABLE public.fleet_driver_sessions
 ADD COLUMN IF NOT EXISTS current_route_stop_id UUID REFERENCES public.hq_delivery_route_stops(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS route_preferences JSONB NOT NULL DEFAULT '{"avoid_tolls":false,"avoid_ferries":true,"avoid_freeways":false,"avoid_dangerous_turns":true,"avoid_trails":"avoid_all"}'::jsonb,
 ADD COLUMN IF NOT EXISTS safe_driving_mode BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS last_navigation_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.fleet_navigation_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 session_id UUID REFERENCES public.fleet_driver_sessions(id) ON DELETE SET NULL,
 driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
 vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
 route_plan_id UUID REFERENCES public.hq_delivery_route_plans(id) ON DELETE SET NULL,
 route_stop_id UUID REFERENCES public.hq_delivery_route_stops(id) ON DELETE SET NULL,
 geofence_id UUID REFERENCES public.fleet_geofences(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL CHECK (event_type IN (
  'LAUNCHED', 'SHARED', 'FALLBACK_COPIED', 'ARRIVED', 'COMPLETED', 'BLOCKED', 'ISSUE_REPORTED'
 )),
 navigation_provider TEXT NOT NULL DEFAULT 'WAZE' CHECK (navigation_provider IN ('WAZE', 'CARTRACK', 'MANUAL')),
 destination_name TEXT NOT NULL,
 destination_latitude DECIMAL(10, 7),
 destination_longitude DECIMAL(10, 7),
 origin_latitude DECIMAL(10, 7),
 origin_longitude DECIMAL(10, 7),
 waze_url TEXT,
 used_coordinate_fallback BOOLEAN NOT NULL DEFAULT false,
 reason TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_navigation_events_org_time
 ON public.fleet_navigation_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_navigation_events_driver_time
 ON public.fleet_navigation_events(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_navigation_events_stop
 ON public.fleet_navigation_events(route_stop_id, event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_navigation_arrival
 ON public.fleet_navigation_events(session_id, route_stop_id, event_type)
 WHERE event_type = 'ARRIVED' AND session_id IS NOT NULL AND route_stop_id IS NOT NULL;

ALTER TABLE public.fleet_navigation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_navigation_events_org_select ON public.fleet_navigation_events;
CREATE POLICY fleet_navigation_events_org_select ON public.fleet_navigation_events
 FOR SELECT USING (
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

COMMENT ON TABLE public.fleet_navigation_events IS
 'Audit launches and operational navigation outcomes. Waze guides the driver; RKJ One and Cartrack remain the system of record.';
COMMENT ON COLUMN public.fleet_navigation_events.used_coordinate_fallback IS
 'True when navigation used a destination name because verified coordinates were unavailable.';
