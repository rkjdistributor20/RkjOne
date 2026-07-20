import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCartrackFleetGpsStatus } from '@/lib/fleet/cartrack';
import {
 alertDedupeKey,
 analyseLiveGps,
 nearestGeofence,
 type FleetGeofenceRow,
} from '@/lib/fleet/gps-analytics';
import type { FleetControlAlert, FleetGpsVehicleStatus } from '@/lib/fleet/types';

const SYNC_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

export async function POST() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!SYNC_ROLES.has(profile.role)) {
  return NextResponse.json({ error: 'Hanya OM atau pentadbir boleh menjalankan analisis GPS.' }, { status: 403 });
 }

 const service = createAdminClient() as any;
 const { data: vehicles, error: vehicleError } = await service
  .from('vehicles')
  .select('id, vehicle_code, plate_number, vehicle_type')
  .eq('organization_id', profile.organization_id)
  .eq('status', 'ACTIVE')
  .order('vehicle_code');
 if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 500 });

 const gps = await getCartrackFleetGpsStatus(vehicles ?? []);
 if (gps.status !== 'ok') {
  return NextResponse.json({ error: gps.message ?? 'Cartrack tidak dapat disegerakkan.' }, { status: 502 });
 }

 const vehicleIds = gps.vehicles.flatMap((vehicle) => vehicle.vehicle_id ? [vehicle.vehicle_id] : []);
 const [{ data: geofences }, { data: previousSnapshots }, { data: maintenancePlans }, { data: activeSessions }] = await Promise.all([
  service.from('fleet_geofences').select('id, name, geofence_type, latitude, longitude, radius_m, branch_id').eq('organization_id', profile.organization_id).eq('is_active', true),
  vehicleIds.length
   ? service.from('fleet_gps_snapshots').select('vehicle_id, latitude, longitude, speed_kph, ignition, event_at').eq('organization_id', profile.organization_id).in('vehicle_id', vehicleIds).order('event_at', { ascending: false }).limit(Math.max(vehicleIds.length * 3, 20))
   : Promise.resolve({ data: [] }),
  vehicleIds.length
   ? service.from('fleet_maintenance_plans').select('id, vehicle_id, service_name, next_service_date, next_service_odometer_km, status').eq('organization_id', profile.organization_id).in('vehicle_id', vehicleIds).neq('status', 'CANCELLED')
   : Promise.resolve({ data: [] }),
  vehicleIds.length
   ? service.from('fleet_driver_sessions').select('id, driver_id, vehicle_id, current_route_stop_id').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').in('vehicle_id', vehicleIds)
   : Promise.resolve({ data: [] }),
 ]);

 const sessionByVehicle = new Map<string, any>(((activeSessions ?? []) as any[]).map((session) => [session.vehicle_id, session]));
 const currentStopIds = ((activeSessions ?? []) as any[]).map((session) => session.current_route_stop_id).filter(Boolean);
 const [{ data: currentStops }, { data: recordedArrivals }] = await Promise.all([
  currentStopIds.length
   ? service.from('hq_delivery_route_stops').select('id, route_plan_id, branch_id').in('id', currentStopIds)
   : Promise.resolve({ data: [] }),
  currentStopIds.length
   ? service.from('fleet_navigation_events').select('session_id, route_stop_id').eq('organization_id', profile.organization_id).eq('event_type', 'ARRIVED').in('route_stop_id', currentStopIds)
   : Promise.resolve({ data: [] }),
 ]);
 const stopById = new Map<string, any>(((currentStops ?? []) as any[]).map((stop) => [stop.id, stop]));
 const arrivalKeys = new Set(((recordedArrivals ?? []) as any[]).map((event) => `${event.session_id}:${event.route_stop_id}`));
 const navigationRows: any[] = [];
 const arrivedSessionIds = new Set<string>();

 const previousByVehicle = new Map<string, any>();
 for (const snapshot of previousSnapshots ?? []) {
  if (!previousByVehicle.has(snapshot.vehicle_id)) previousByVehicle.set(snapshot.vehicle_id, snapshot);
 }

 const snapshotRows = gps.vehicles.flatMap((vehicle) => {
  if (!vehicle.vehicle_id || !vehicle.event_ts) return [];
  return [{
   organization_id: profile.organization_id,
   vehicle_id: vehicle.vehicle_id,
   registration: vehicle.registration,
   latitude: vehicle.latitude,
   longitude: vehicle.longitude,
   speed_kph: vehicle.speed_kph,
   odometer_km: vehicle.odometer_km,
   fuel_level: vehicle.fuel_level,
   ignition: vehicle.ignition,
   heading: vehicle.heading,
   driver_name: vehicle.driver_name,
   location_description: vehicle.location_description,
   raw_status: vehicle.raw_status,
   event_at: vehicle.event_ts,
   received_at: gps.fetched_at,
  }];
 });

 if (snapshotRows.length > 0) {
  const { error } = await service.from('fleet_gps_snapshots').upsert(snapshotRows, {
   onConflict: 'vehicle_id,event_at', ignoreDuplicates: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const analysis = analyseLiveGps(gps.vehicles);
 const alerts: FleetControlAlert[] = [...analysis.alerts];
 const geofenceRows = (geofences ?? []) as FleetGeofenceRow[];

 for (const vehicle of gps.vehicles) {
  if (!vehicle.vehicle_id) continue;
  const previous = previousByVehicle.get(vehicle.vehicle_id);

  if (
   previous?.ignition === true && Number(previous.speed_kph ?? 0) < 2 &&
   vehicle.ignition === true && Number(vehicle.speed_kph ?? 0) < 2 &&
   new Date(vehicle.event_ts ?? vehicle.received_at).getTime() - new Date(previous.event_at).getTime() >= 15 * 60_000
  ) {
   alerts.push({
    id: `live:IDLE:${vehicle.vehicle_id}`, alert_type: 'IDLE', severity: 'MEDIUM', status: 'OPEN',
    title: `${vehicle.plate_number ?? vehicle.label} idle terlalu lama`,
    message: 'Enjin hidup tanpa pergerakan sekurang-kurangnya 15 minit. Semak keperluan operasi.',
    event_at: vehicle.event_ts ?? vehicle.received_at, vehicle_id: vehicle.vehicle_id,
    plate_number: vehicle.plate_number, metadata: { threshold_minutes: 15 }, live: true,
   });
  }

  const currentFence = nearestGeofence(vehicle, geofenceRows);
  if (previous?.latitude != null && previous?.longitude != null && currentFence) {
   const previousVehicle = { ...vehicle, latitude: Number(previous.latitude), longitude: Number(previous.longitude) } as FleetGpsVehicleStatus;
   const previousFence = nearestGeofence(previousVehicle, geofenceRows);
   if (currentFence.inside && (!previousFence?.inside || previousFence.geofence.id !== currentFence.geofence.id)) {
    alerts.push({
     id: `live:GEOFENCE_ARRIVAL:${vehicle.vehicle_id}:${currentFence.geofence.id}`,
     alert_type: 'GEOFENCE_ARRIVAL', severity: 'LOW', status: 'OPEN',
     title: `${vehicle.plate_number ?? vehicle.label} tiba`,
     message: `Kenderaan memasuki ${currentFence.geofence.name}.`,
     event_at: vehicle.event_ts ?? vehicle.received_at, vehicle_id: vehicle.vehicle_id,
     plate_number: vehicle.plate_number,
     metadata: { geofence_id: currentFence.geofence.id, geofence_name: currentFence.geofence.name, distance_m: Math.round(currentFence.distance_m) }, live: true,
    });
    const session = sessionByVehicle.get(vehicle.vehicle_id);
    const stop = session?.current_route_stop_id ? stopById.get(session.current_route_stop_id) : null;
    const arrivalKey = session && stop ? `${session.id}:${stop.id}` : null;
    if (session && stop && currentFence.geofence.branch_id === stop.branch_id && arrivalKey && !arrivalKeys.has(arrivalKey)) {
     navigationRows.push({
      organization_id: profile.organization_id, session_id: session.id, driver_id: session.driver_id,
      vehicle_id: vehicle.vehicle_id, route_plan_id: stop.route_plan_id, route_stop_id: stop.id,
      geofence_id: currentFence.geofence.id, event_type: 'ARRIVED', navigation_provider: 'CARTRACK',
      destination_name: currentFence.geofence.name, destination_latitude: currentFence.geofence.latitude,
      destination_longitude: currentFence.geofence.longitude, origin_latitude: vehicle.latitude,
      origin_longitude: vehicle.longitude, metadata: { distance_m: Math.round(currentFence.distance_m), verified_by: 'CARTRACK_GEOFENCE' },
     });
     arrivalKeys.add(arrivalKey);
     arrivedSessionIds.add(session.id);
    }
   }
   if (previousFence?.inside && (!currentFence.inside || previousFence.geofence.id !== currentFence.geofence.id)) {
    alerts.push({
     id: `live:GEOFENCE_DEPARTURE:${vehicle.vehicle_id}:${previousFence.geofence.id}`,
     alert_type: 'GEOFENCE_DEPARTURE', severity: 'LOW', status: 'OPEN',
     title: `${vehicle.plate_number ?? vehicle.label} keluar lokasi`,
     message: `Kenderaan meninggalkan ${previousFence.geofence.name}.`,
     event_at: vehicle.event_ts ?? vehicle.received_at, vehicle_id: vehicle.vehicle_id,
     plate_number: vehicle.plate_number,
     metadata: { geofence_id: previousFence.geofence.id, geofence_name: previousFence.geofence.name }, live: true,
    });
   }
  }

  for (const plan of (maintenancePlans ?? []).filter((item: any) => item.vehicle_id === vehicle.vehicle_id)) {
   const nextKm = plan.next_service_odometer_km == null ? null : Number(plan.next_service_odometer_km);
   const remainingKm = nextKm !== null && vehicle.odometer_km !== null ? nextKm - vehicle.odometer_km : null;
   const dueByDate = plan.next_service_date && new Date(plan.next_service_date).getTime() <= Date.now() + 14 * 86_400_000;
   if ((remainingKm !== null && remainingKm <= 500) || dueByDate || ['DUE', 'OVERDUE'].includes(plan.status)) {
    const overdue = (remainingKm !== null && remainingKm < 0) || (plan.next_service_date && new Date(plan.next_service_date).getTime() < Date.now());
    alerts.push({
     id: `live:MAINTENANCE_DUE:${vehicle.vehicle_id}:${plan.id}`,
     alert_type: 'MAINTENANCE_DUE', severity: overdue ? 'HIGH' : 'MEDIUM', status: 'OPEN',
     title: `${plan.service_name} ${vehicle.plate_number ?? vehicle.label}`,
     message: overdue ? 'Servis telah melepasi had. Susun slot bengkel sebelum perjalanan seterusnya.' : 'Servis hampir sampai. Rancang slot tanpa mengganggu penghantaran.',
     event_at: gps.fetched_at, vehicle_id: vehicle.vehicle_id, plate_number: vehicle.plate_number,
     metadata: { maintenance_plan_id: plan.id, remaining_km: remainingKm, next_service_date: plan.next_service_date }, live: true,
    });
   }
  }
 }

 if (navigationRows.length > 0) {
  const { error } = await service.from('fleet_navigation_events').insert(navigationRows);
  if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });
 }
 if (arrivedSessionIds.size > 0) {
  await service.from('fleet_driver_sessions').update({
   safe_driving_mode: false, updated_at: new Date().toISOString(),
  }).in('id', [...arrivedSessionIds]).eq('organization_id', profile.organization_id);
 }

 const alertRows = alerts.map((alert) => ({
  organization_id: profile.organization_id,
  vehicle_id: alert.vehicle_id,
  alert_type: alert.alert_type,
  severity: alert.severity,
  status: 'OPEN',
  title: alert.title,
  message: alert.message,
  event_at: alert.event_at,
  dedupe_key: alertDedupeKey(alert),
  metadata: alert.metadata ?? {},
 }));

 if (alertRows.length > 0) {
  const { error } = await service.from('fleet_gps_alerts').upsert(alertRows, {
   onConflict: 'organization_id,dedupe_key', ignoreDuplicates: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 }

 return NextResponse.json({ ok: true, snapshots: snapshotRows.length, alerts: alertRows.length, navigation_events: navigationRows.length });
}
