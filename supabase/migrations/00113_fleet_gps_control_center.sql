-- RKJ One: Fleet GPS control center, geofences, alerts, driver sessions and maintenance.

CREATE TABLE IF NOT EXISTS fleet_geofences (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
 inventory_location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
 name TEXT NOT NULL,
 geofence_type TEXT NOT NULL DEFAULT 'OTHER'
  CHECK (geofence_type IN ('FACTORY', 'HQ', 'BRANCH', 'AGENT_PICKUP', 'HUB', 'OTHER')),
 latitude DECIMAL(10, 7) NOT NULL,
 longitude DECIMAL(10, 7) NOT NULL,
 radius_m INTEGER NOT NULL DEFAULT 250 CHECK (radius_m BETWEEN 50 AND 5000),
 is_active BOOLEAN NOT NULL DEFAULT true,
 notify_arrival BOOLEAN NOT NULL DEFAULT true,
 notify_departure BOOLEAN NOT NULL DEFAULT true,
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS fleet_gps_snapshots (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 registration TEXT,
 latitude DECIMAL(10, 7),
 longitude DECIMAL(10, 7),
 speed_kph DECIMAL(8, 2),
 odometer_km DECIMAL(14, 2),
 fuel_level DECIMAL(6, 2),
 ignition BOOLEAN,
 heading DECIMAL(8, 2),
 driver_name TEXT,
 location_description TEXT,
 raw_status TEXT,
 event_at TIMESTAMPTZ NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (vehicle_id, event_at)
);

CREATE TABLE IF NOT EXISTS fleet_gps_alerts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
 driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
 geofence_id UUID REFERENCES fleet_geofences(id) ON DELETE SET NULL,
 delivery_order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
 alert_type TEXT NOT NULL
  CHECK (alert_type IN ('SPEEDING', 'IDLE', 'OFFLINE', 'LOW_FUEL', 'GEOFENCE_ARRIVAL', 'GEOFENCE_DEPARTURE', 'ROUTE_DEVIATION', 'MAINTENANCE_DUE', 'UNAUTHORISED_USE')),
 severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 dedupe_key TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}',
 acknowledged_by UUID REFERENCES profiles(id),
 acknowledged_at TIMESTAMPTZ,
 resolved_by UUID REFERENCES profiles(id),
 resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS fleet_driver_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ended_at TIMESTAMPTZ,
 start_odometer_km DECIMAL(14, 2),
 end_odometer_km DECIMAL(14, 2),
 start_latitude DECIMAL(10, 7),
 start_longitude DECIMAL(10, 7),
 end_latitude DECIMAL(10, 7),
 end_longitude DECIMAL(10, 7),
 checklist JSONB NOT NULL DEFAULT '{}',
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_driver_active_session
 ON fleet_driver_sessions(driver_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS fleet_maintenance_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
 service_name TEXT NOT NULL,
 interval_km INTEGER CHECK (interval_km IS NULL OR interval_km > 0),
 interval_days INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
 last_service_date DATE,
 last_service_odometer_km DECIMAL(14, 2),
 next_service_date DATE,
 next_service_odometer_km DECIMAL(14, 2),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DUE', 'OVERDUE', 'COMPLETED', 'CANCELLED')),
 notes TEXT,
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (vehicle_id, service_name)
);

ALTER TABLE proof_of_delivery
 ADD COLUMN IF NOT EXISTS geofence_id UUID REFERENCES fleet_geofences(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS distance_from_destination_m DECIMAL(10, 2),
 ADD COLUMN IF NOT EXISTS gps_verification_status TEXT NOT NULL DEFAULT 'NOT_CHECKED'
  CHECK (gps_verification_status IN ('NOT_CHECKED', 'WITHIN_GEOFENCE', 'OUTSIDE_GEOFENCE', 'GPS_UNAVAILABLE', 'MANAGER_OVERRIDE'));

CREATE INDEX IF NOT EXISTS idx_fleet_geofences_org_active ON fleet_geofences(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fleet_snapshots_vehicle_event ON fleet_gps_snapshots(vehicle_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_snapshots_org_event ON fleet_gps_snapshots(organization_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_alerts_org_status ON fleet_gps_alerts(organization_id, status, severity, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_sessions_org_status ON fleet_driver_sessions(organization_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_due ON fleet_maintenance_plans(organization_id, status, next_service_date);

ALTER TABLE fleet_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_gps_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_gps_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_driver_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_maintenance_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_geofences_org_select ON fleet_geofences;
CREATE POLICY fleet_geofences_org_select ON fleet_geofences
 FOR SELECT USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS fleet_snapshots_org_select ON fleet_gps_snapshots;
CREATE POLICY fleet_snapshots_org_select ON fleet_gps_snapshots
 FOR SELECT USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS fleet_alerts_org_select ON fleet_gps_alerts;
CREATE POLICY fleet_alerts_org_select ON fleet_gps_alerts
 FOR SELECT USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS fleet_sessions_org_select ON fleet_driver_sessions;
CREATE POLICY fleet_sessions_org_select ON fleet_driver_sessions
 FOR SELECT USING (
  organization_id = public.organization_id()
  AND (
   public.is_admin()
   OR public.user_role() IN ('OPERATION_MANAGER', 'AREA_MANAGER')
   OR profile_id = auth.uid()
  )
 );

DROP POLICY IF EXISTS fleet_maintenance_org_select ON fleet_maintenance_plans;
CREATE POLICY fleet_maintenance_org_select ON fleet_maintenance_plans
 FOR SELECT USING (organization_id = public.organization_id());

-- Existing branch coordinates become the initial operational geofences.
INSERT INTO fleet_geofences (
 organization_id, branch_id, name, geofence_type, latitude, longitude, radius_m
)
SELECT
 b.organization_id,
 b.id,
 CONCAT(b.branch_code, ' - ', b.branch_name),
 'BRANCH',
 b.latitude,
 b.longitude,
 250
FROM branches b
WHERE b.latitude IS NOT NULL AND b.longitude IS NOT NULL
ON CONFLICT (organization_id, name) DO UPDATE SET
 branch_id = EXCLUDED.branch_id,
 latitude = EXCLUDED.latitude,
 longitude = EXCLUDED.longitude,
 is_active = true,
 updated_at = now();

-- A practical default service plan; managers can refine intervals per vehicle later.
INSERT INTO fleet_maintenance_plans (
 organization_id, vehicle_id, service_name, interval_km, interval_days, next_service_odometer_km, notes
)
SELECT
 v.organization_id,
 v.id,
 'Servis berkala',
 10000,
 180,
 NULL,
 'Pelan awal. Tetapkan bacaan servis terakhir untuk ramalan yang lebih tepat.'
FROM vehicles v
WHERE v.status = 'ACTIVE'
ON CONFLICT (vehicle_id, service_name) DO NOTHING;
