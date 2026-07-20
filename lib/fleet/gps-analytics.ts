import type {
 FleetAlertSeverity,
 FleetControlAlert,
 FleetGpsVehicleStatus,
} from './types';

export type FleetGeofenceRow = {
 id: string;
 name: string;
 geofence_type: string;
 latitude: number | string;
 longitude: number | string;
 radius_m: number;
 branch_id: string | null;
};

export type FleetMaintenanceRow = {
 id: string;
 vehicle_id: string;
 service_name: string;
 status: string;
 next_service_date: string | null;
 next_service_odometer_km: number | string | null;
};

export function distanceKm(
 lat1: number,
 lng1: number,
 lat2: number,
 lng2: number) {
 const toRadians = (value: number) => (value * Math.PI) / 180;
 const earthRadiusKm = 6371;
 const dLat = toRadians(lat2 - lat1);
 const dLng = toRadians(lng2 - lng1);
 const a =
  Math.sin(dLat / 2) ** 2 +
  Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
 return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestGeofence(
 vehicle: FleetGpsVehicleStatus,
 geofences: FleetGeofenceRow[]) {
 if (vehicle.latitude === null || vehicle.longitude === null) return null;
 let nearest: { geofence: FleetGeofenceRow; distance_m: number; inside: boolean } | null = null;

 for (const geofence of geofences) {
  const distance_m = distanceKm(
   vehicle.latitude,
   vehicle.longitude,
   Number(geofence.latitude),
   Number(geofence.longitude)) * 1000;
  if (!nearest || distance_m < nearest.distance_m) {
   nearest = { geofence, distance_m, inside: distance_m <= geofence.radius_m };
  }
 }
 return nearest;
}

function liveAlert(
 vehicle: FleetGpsVehicleStatus,
 type: string,
 severity: FleetAlertSeverity,
 title: string,
 message: string,
 metadata: Record<string, unknown> = {}): FleetControlAlert {
 return {
  id: `live:${type}:${vehicle.vehicle_id ?? vehicle.registration ?? 'unknown'}`,
  alert_type: type,
  severity,
  status: 'OPEN',
  title,
  message,
  event_at: vehicle.event_ts ?? vehicle.received_at,
  vehicle_id: vehicle.vehicle_id,
  plate_number: vehicle.plate_number,
  metadata,
  live: true,
 };
}

export function analyseLiveGps(
 vehicles: FleetGpsVehicleStatus[],
 now = new Date()) {
 const alerts: FleetControlAlert[] = [];
 const offlineVehicleIds = new Set<string>();
 const idleVehicleIds = new Set<string>();

 for (const vehicle of vehicles) {
  const key = vehicle.vehicle_id ?? vehicle.registration ?? vehicle.label;
  const eventTime = vehicle.event_ts ? new Date(vehicle.event_ts).getTime() : 0;
  const ageMinutes = eventTime > 0 ? (now.getTime() - eventTime) / 60_000 : Number.POSITIVE_INFINITY;

  if (!vehicle.matched || ageMinutes > 30) {
   offlineVehicleIds.add(key);
   alerts.push(liveAlert(
    vehicle,
    'OFFLINE',
    ageMinutes > 120 ? 'HIGH' : 'MEDIUM',
    `${vehicle.plate_number ?? vehicle.label} tidak menghantar GPS`,
    eventTime > 0
     ? `Data terakhir diterima ${Math.round(ageMinutes)} minit lalu.`
     : 'Belum ada koordinat GPS untuk kenderaan ini.',
    { age_minutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null }));
  }

  if ((vehicle.speed_kph ?? 0) >= 90) {
   alerts.push(liveAlert(
    vehicle,
    'SPEEDING',
    (vehicle.speed_kph ?? 0) >= 110 ? 'CRITICAL' : 'HIGH',
    `${vehicle.plate_number ?? vehicle.label} melebihi had operasi`,
    `Kelajuan semasa ${Math.round(vehicle.speed_kph ?? 0)} km/j. OM perlu semak dengan driver.`,
    { speed_kph: vehicle.speed_kph, threshold_kph: 90 }));
  }

  if (vehicle.ignition === true && (vehicle.speed_kph ?? 0) < 2) {
   idleVehicleIds.add(key);
  }

  if (vehicle.fuel_level !== null && vehicle.fuel_level <= 20) {
   alerts.push(liveAlert(
    vehicle,
    'LOW_FUEL',
    vehicle.fuel_level <= 10 ? 'HIGH' : 'MEDIUM',
    `Minyak ${vehicle.plate_number ?? vehicle.label} rendah`,
    `Paras minyak ${Math.round(vehicle.fuel_level)}%. Rancang pengisian sebelum laluan seterusnya.`,
    { fuel_level: vehicle.fuel_level }));
  }
 }

 return { alerts, offlineVehicleIds, idleVehicleIds };
}

export function alertDedupeKey(alert: FleetControlAlert, eventDate = new Date(alert.event_at)) {
 const bucketMinutes = alert.alert_type.startsWith('GEOFENCE_') ? 5 : 30;
 const bucket = Math.floor(eventDate.getTime() / (bucketMinutes * 60_000));
 return [alert.alert_type, alert.vehicle_id ?? alert.plate_number ?? 'unknown', bucket].join(':');
}
