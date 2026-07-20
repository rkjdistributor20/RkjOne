import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getCartrackFleetGpsStatus } from '@/lib/fleet/cartrack';
import { analyseLiveGps, distanceKm } from '@/lib/fleet/gps-analytics';
import type {
 FleetControlAlert,
 FleetControlCenterResponse,
 FleetGpsVehicleStatus,
} from '@/lib/fleet/types';

const MANAGEMENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);
const ACTIVE_DELIVERY_STATUSES = ['DRAFT', 'PENDING', 'IN_TRANSIT'];

type VehicleRow = {
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string | null;
};

type StoredAlertRow = Omit<FleetControlAlert, 'plate_number'> & {
 vehicle?: { plate_number: string | null } | null;
};

function buildRecommendations(response: Omit<FleetControlCenterResponse, 'recommendations'>) {
 const recommendations: FleetControlCenterResponse['recommendations'] = [];
 if (response.kpis.critical_alerts > 0) {
  recommendations.push({
   id: 'critical-alerts', priority: 'SEGERA', title: 'Semak amaran kritikal',
   detail: `${response.kpis.critical_alerts} amaran memerlukan tindakan OM atau Owner sekarang.`, action_tab: 'overview',
  });
 }
 if (response.kpis.offline > 0) {
  recommendations.push({
   id: 'offline-gps', priority: 'HARI_INI', title: 'Pulihkan GPS tidak aktif',
   detail: `${response.kpis.offline} kenderaan tidak menghantar lokasi terkini.`, action_tab: 'vehicles',
  });
 }
 if (response.kpis.maintenance_due > 0) {
  recommendations.push({
   id: 'maintenance', priority: 'HARI_INI', title: 'Rancang penyelenggaraan',
   detail: `${response.kpis.maintenance_due} servis hampir sampai atau telah overdue.`, action_tab: 'vehicles',
  });
 }
 if (response.kpis.geofence_coverage < response.kpis.total_vehicles && response.geofences.length === 0) {
  recommendations.push({
   id: 'geofence', priority: 'RANCANG', title: 'Lengkapkan koordinat cawangan',
   detail: 'Lokasi tanpa koordinat tidak boleh mengesahkan ketibaan atau POD secara automatik.', action_tab: 'deliveries',
  });
 }
 if (recommendations.length === 0) {
  recommendations.push({
   id: 'healthy', priority: 'RANCANG', title: 'Operasi fleet terkawal',
   detail: 'Tiada pengecualian kritikal. Teruskan pemantauan ETA, POD dan servis berkala.', action_tab: 'overview',
  });
 }
 return recommendations.slice(0, 5);
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const isManagement = MANAGEMENT_ROLES.has(profile.role);
 if (!isManagement && profile.role !== 'DRIVER') {
  return NextResponse.json({ error: 'Tiada akses ke Fleet Control Center.' }, { status: 403 });
 }

 const supabase = await createClient();
 let vehicleIds: string[] | null = null;
 let myDriverIds: string[] = [];
 let myDriverRows: Array<{ id: string; full_name: string }> = [];

 if (profile.role === 'DRIVER') {
  const { data: drivers } = await supabase
   .from('drivers')
   .select('id, full_name')
   .eq('organization_id', profile.organization_id)
   .eq('profile_id', profile.id)
   .eq('status', 'ACTIVE');
  myDriverRows = (drivers ?? []) as Array<{ id: string; full_name: string }>;
  myDriverIds = myDriverRows.map((driver) => driver.id);
  if (myDriverIds.length === 0) vehicleIds = [];
  else {
   const { data: assignments } = await supabase
    .from('driver_vehicle_assignments')
    .select('vehicle_id')
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true)
    .in('driver_id', myDriverIds);
   vehicleIds = [...new Set(((assignments ?? []) as Array<{ vehicle_id: string }>).map((assignment) => assignment.vehicle_id))];
  }
 }

 let vehiclesQuery = supabase
  .from('vehicles')
  .select('id, vehicle_code, plate_number, vehicle_type')
  .eq('organization_id', profile.organization_id)
  .eq('status', 'ACTIVE')
  .order('vehicle_code');
 if (vehicleIds !== null) {
  if (vehicleIds.length === 0) {
   const emptyGps = await getCartrackFleetGpsStatus([]);
   const empty: FleetControlCenterResponse = {
    mode: 'DRIVER', generated_at: new Date().toISOString(), gps: emptyGps,
    kpis: { total_vehicles: 0, moving: 0, idle: 0, offline: 0, open_alerts: 0, critical_alerts: 0, active_deliveries: 0, maintenance_due: 0, geofence_coverage: 0 },
    alerts: [], geofences: [], geofence_options: [], maintenance: [], active_sessions: [], deliveries: [], driver_setup: null,
    recommendations: [{ id: 'no-assignment', priority: 'HARI_INI', title: 'Kenderaan belum ditetapkan', detail: 'Minta OM/HQ padankan profil driver dengan kenderaan sebelum check-in.', action_tab: 'drivers' }],
   };
   return NextResponse.json(empty);
  }
  vehiclesQuery = vehiclesQuery.in('id', vehicleIds);
 }

 const { data: vehicles, error: vehiclesError } = await vehiclesQuery;
 if (vehiclesError) return NextResponse.json({ error: vehiclesError.message }, { status: 500 });
 const vehicleRows = (vehicles ?? []) as VehicleRow[];
 const gps = await getCartrackFleetGpsStatus(vehicleRows);
 const activeVehicleIds = vehicleRows.map((vehicle) => vehicle.id);

 const [geofenceResult, branchResult, alertResult, maintenanceResult, sessionResult, deliveryResult] = await Promise.all([
  supabase.from('fleet_geofences').select('id, name, geofence_type, latitude, longitude, radius_m, branch_id').eq('organization_id', profile.organization_id).eq('is_active', true).order('name'),
  supabase.from('branches').select('id, branch_code, branch_name').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('branch_code'),
  supabase.from('fleet_gps_alerts').select('id, alert_type, severity, status, title, message, event_at, vehicle_id, metadata, vehicle:vehicles(plate_number)').eq('organization_id', profile.organization_id).neq('status', 'RESOLVED').order('event_at', { ascending: false }).limit(30),
  activeVehicleIds.length
   ? supabase.from('fleet_maintenance_plans').select('id, vehicle_id, service_name, status, next_service_date, next_service_odometer_km, vehicle:vehicles(plate_number)').eq('organization_id', profile.organization_id).in('vehicle_id', activeVehicleIds).neq('status', 'CANCELLED').order('next_service_date')
   : Promise.resolve({ data: [] }),
  supabase.from('fleet_driver_sessions').select('id, driver_id, vehicle_id, status, started_at, checklist, driver:drivers(full_name), vehicle:vehicles(plate_number)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('started_at', { ascending: false }),
  supabase.from('delivery_orders').select('id, order_number, status, primary_vehicle_id, final_destination:inventory_locations!delivery_orders_final_destination_id_fkey(name, branch:branches(latitude, longitude))').eq('organization_id', profile.organization_id).in('status', ACTIVE_DELIVERY_STATUSES).order('scheduled_date').limit(30),
 ]);

 const { alerts: liveAlerts, offlineVehicleIds, idleVehicleIds } = analyseLiveGps(gps.vehicles);
 const storedAlerts = ((alertResult.data ?? []) as unknown as StoredAlertRow[]).map((alert) => ({
  ...alert,
  plate_number: alert.vehicle?.plate_number ?? null,
 }));
 const storedKeys = new Set(storedAlerts.map((alert) => `${alert.alert_type}:${alert.vehicle_id ?? alert.plate_number}`));
 const alerts = [
  ...liveAlerts.filter((alert) => !storedKeys.has(`${alert.alert_type}:${alert.vehicle_id ?? alert.plate_number}`)),
  ...storedAlerts,
 ].sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime());

 const gpsByVehicle = new Map(gps.vehicles.map((vehicle) => [vehicle.vehicle_id, vehicle]));
 const maintenance = ((maintenanceResult.data ?? []) as any[]).map((plan) => {
  const current = gpsByVehicle.get(plan.vehicle_id)?.odometer_km ?? null;
  const next = plan.next_service_odometer_km === null ? null : Number(plan.next_service_odometer_km);
  return {
   id: plan.id,
   vehicle_id: plan.vehicle_id,
   plate_number: plan.vehicle?.plate_number ?? null,
   service_name: plan.service_name,
   status: plan.status,
   next_service_date: plan.next_service_date,
   next_service_odometer_km: next,
   current_odometer_km: current,
   remaining_km: current !== null && next !== null ? Math.round(next - current) : null,
  };
 });

 const maintenanceDue = maintenance.filter((plan) =>
  plan.status === 'OVERDUE' || plan.status === 'DUE' ||
  (plan.remaining_km !== null && plan.remaining_km <= 500) ||
  (plan.next_service_date && new Date(plan.next_service_date).getTime() <= Date.now() + 14 * 86_400_000));

 const deliveries = ((deliveryResult.data ?? []) as any[]).map((order) => {
  const gpsVehicle = gpsByVehicle.get(order.primary_vehicle_id) as FleetGpsVehicleStatus | undefined;
  const branch = order.final_destination?.branch;
  const coordinatesAvailable = gpsVehicle?.latitude !== null && gpsVehicle?.latitude !== undefined && gpsVehicle?.longitude !== null && gpsVehicle?.longitude !== undefined && branch?.latitude != null && branch?.longitude != null;
  const distance = coordinatesAvailable
   ? distanceKm(gpsVehicle.latitude!, gpsVehicle.longitude!, Number(branch.latitude), Number(branch.longitude))
   : null;
  const planningSpeed = Math.max(gpsVehicle?.speed_kph ?? 0, 45);
  return {
   id: order.id,
   order_number: order.order_number,
   status: order.status,
   destination: order.final_destination?.name ?? 'Destinasi belum dinamakan',
   plate_number: gpsVehicle?.plate_number ?? null,
   distance_km: distance === null ? null : Math.round(distance * 10) / 10,
   eta_minutes: distance === null ? null : Math.max(1, Math.round((distance / planningSpeed) * 60)),
   gps_available: coordinatesAvailable,
  };
 });

 const activeSessions = ((sessionResult.data ?? []) as any[])
  .filter((session) => isManagement || myDriverIds.includes(session.driver_id))
  .map((session) => ({
   id: session.id, driver_id: session.driver_id, driver_name: session.driver?.full_name ?? 'Driver',
   vehicle_id: session.vehicle_id, plate_number: session.vehicle?.plate_number ?? null,
   status: session.status, started_at: session.started_at, checklist: session.checklist ?? {},
  }));

 const base: Omit<FleetControlCenterResponse, 'recommendations'> = {
  mode: isManagement ? 'MANAGEMENT' : 'DRIVER',
  generated_at: new Date().toISOString(),
  gps,
  kpis: {
   total_vehicles: gps.vehicles.length,
   moving: gps.vehicles.filter((vehicle) => (vehicle.speed_kph ?? 0) >= 5).length,
   idle: idleVehicleIds.size,
   offline: offlineVehicleIds.size,
   open_alerts: alerts.filter((alert) => alert.status === 'OPEN').length,
   critical_alerts: alerts.filter((alert) => alert.status === 'OPEN' && ['HIGH', 'CRITICAL'].includes(alert.severity)).length,
   active_deliveries: deliveries.length,
   maintenance_due: maintenanceDue.length,
   geofence_coverage: (geofenceResult.data ?? []).length,
  },
  alerts: alerts.slice(0, 20),
  geofences: ((geofenceResult.data ?? []) as any[]).map((geofence) => ({ id: geofence.id, name: geofence.name, geofence_type: geofence.geofence_type, radius_m: geofence.radius_m, branch_id: geofence.branch_id })),
  geofence_options: ((branchResult.data ?? []) as Array<{ id: string; branch_code: string; branch_name: string }>).map((branch) => ({ id: branch.id, label: `${branch.branch_code} - ${branch.branch_name}` })),
  maintenance,
  active_sessions: activeSessions,
  deliveries,
  driver_setup: profile.role === 'DRIVER' && myDriverRows[0]
   ? {
    driver_id: myDriverRows[0].id,
    driver_name: myDriverRows[0].full_name,
    vehicles: vehicleRows.map((vehicle) => ({ id: vehicle.id, plate_number: vehicle.plate_number, vehicle_type: vehicle.vehicle_type })),
   }
   : null,
 };

 const response: FleetControlCenterResponse = { ...base, recommendations: buildRecommendations(base) };
 return NextResponse.json(response, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=20' } });
}
