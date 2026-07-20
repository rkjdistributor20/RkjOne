import { distanceKm } from '@/lib/fleet/gps-analytics';

const MAX_GPS_AGE_MS = 30 * 60_000;
const STOPPED_SPEED_KPH = 3;
const CLUSTER_RADIUS_M = 200;
const MAX_SHIFT_FROM_CENTER_M = 750;

interface LearnDropLocationInput {
 service: any;
 organizationId: string;
 profileId: string;
 branchId: string;
 routeStopId?: string | null;
 deliveryLegId?: string | null;
 podId?: string | null;
 driverId?: string | null;
 vehicleId?: string | null;
 reportedLatitude?: number | null;
 reportedLongitude?: number | null;
}

interface PositionCandidate {
 latitude: number;
 longitude: number;
 speed_kph: number | null;
 event_at: string;
 source: 'CARTRACK_DROP' | 'DEVICE_POD';
}

function validCoordinate(latitude: number | null | undefined, longitude: number | null | undefined) {
 return Number.isFinite(latitude) && Number.isFinite(longitude)
  && Number(latitude) >= -90 && Number(latitude) <= 90
  && Number(longitude) >= -180 && Number(longitude) <= 180;
}

async function resolveCandidate(service: any, vehicleId: string | null | undefined, input: LearnDropLocationInput) {
 if (vehicleId) {
  const { data: snapshot } = await service.from('fleet_gps_snapshots')
   .select('latitude, longitude, speed_kph, event_at')
   .eq('organization_id', input.organizationId).eq('vehicle_id', vehicleId)
   .order('event_at', { ascending: false }).limit(1).maybeSingle();
  const age = snapshot?.event_at ? Date.now() - new Date(snapshot.event_at).getTime() : Number.POSITIVE_INFINITY;
  const speed = snapshot?.speed_kph == null ? null : Number(snapshot.speed_kph);
  if (snapshot && age <= MAX_GPS_AGE_MS && Number(speed ?? 0) <= STOPPED_SPEED_KPH
   && validCoordinate(Number(snapshot.latitude), Number(snapshot.longitude))) {
   return {
    latitude: Number(snapshot.latitude), longitude: Number(snapshot.longitude), speed_kph: speed,
    event_at: snapshot.event_at, source: 'CARTRACK_DROP',
   } satisfies PositionCandidate;
  }
 }
 if (validCoordinate(input.reportedLatitude, input.reportedLongitude)) {
  return {
   latitude: Number(input.reportedLatitude), longitude: Number(input.reportedLongitude),
   speed_kph: null, event_at: new Date().toISOString(), source: 'DEVICE_POD',
  } satisfies PositionCandidate;
 }
 return null;
}

export async function learnDropLocation(input: LearnDropLocationInput) {
 const { service } = input;
 const [{ data: branch }, { data: profileDriver }] = await Promise.all([
  service.from('branches').select('id, branch_code, branch_name, latitude, longitude')
   .eq('organization_id', input.organizationId).eq('id', input.branchId).maybeSingle(),
  input.driverId ? Promise.resolve({ data: { id: input.driverId } }) : service.from('drivers')
   .select('id').eq('organization_id', input.organizationId).eq('profile_id', input.profileId)
   .eq('status', 'ACTIVE').limit(1).maybeSingle(),
 ]);
 if (!branch) return { learned: false, reason: 'BRANCH_NOT_FOUND' };

 let driverId = input.driverId ?? profileDriver?.id ?? null;
 let vehicleId = input.vehicleId ?? null;
 if (!vehicleId && driverId) {
  const { data: session } = await service.from('fleet_driver_sessions')
   .select('driver_id, vehicle_id').eq('organization_id', input.organizationId)
   .eq('driver_id', driverId).eq('status', 'ACTIVE').order('started_at', { ascending: false })
   .limit(1).maybeSingle();
  driverId = session?.driver_id ?? driverId;
  vehicleId = session?.vehicle_id ?? null;
 }

 const candidate = await resolveCandidate(service, vehicleId, input);
 if (!candidate) return { learned: false, reason: 'NO_STATIONARY_POSITION' };

 const { data: geofence } = await service.from('fleet_geofences')
  .select('id, name, latitude, longitude, radius_m, observation_count, confidence_score, location_source, verified_at')
  .eq('organization_id', input.organizationId).eq('branch_id', input.branchId)
  .eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle();
 const distanceToCenter = geofence
  ? distanceKm(candidate.latitude, candidate.longitude, Number(geofence.latitude), Number(geofence.longitude)) * 1000
  : null;
 const shouldReject = Boolean(geofence?.verified_at && distanceToCenter !== null && distanceToCenter > MAX_SHIFT_FROM_CENTER_M);

 const observationPayload = {
  organization_id: input.organizationId, branch_id: input.branchId, geofence_id: geofence?.id ?? null,
  vehicle_id: vehicleId, driver_id: driverId, route_stop_id: input.routeStopId ?? null,
  delivery_leg_id: input.deliveryLegId ?? null, proof_of_delivery_id: input.podId ?? null,
  source: candidate.source, latitude: candidate.latitude, longitude: candidate.longitude,
  speed_kph: candidate.speed_kph, gps_event_at: candidate.event_at,
  distance_to_center_m: distanceToCenter === null ? null : Math.round(distanceToCenter * 100) / 100,
  status: shouldReject ? 'REJECTED' : 'CANDIDATE',
  rejection_reason: shouldReject ? 'Titik drop terlalu jauh daripada lokasi yang telah disahkan.' : null,
  metadata: { stopped_threshold_kph: STOPPED_SPEED_KPH }, created_by: input.profileId,
 };
 let existingObservation = null;
 if (input.routeStopId || input.podId) {
  let existingObservationQuery = service.from('fleet_location_observations').select('id')
   .eq('organization_id', input.organizationId).eq('source', candidate.source);
  existingObservationQuery = input.routeStopId
   ? existingObservationQuery.eq('route_stop_id', input.routeStopId)
   : existingObservationQuery.eq('proof_of_delivery_id', input.podId);
  const result = await existingObservationQuery.maybeSingle();
  existingObservation = result.data;
 }
 const observationResult = existingObservation
  ? { data: existingObservation, error: null }
  : await service.from('fleet_location_observations').insert(observationPayload).select('id').single();
 const observation = observationResult.data;
 const observationError = observationResult.error;
 if (observationError) return { learned: false, reason: observationError.message };
 if (shouldReject) return { learned: false, reason: 'OUTLIER_REJECTED' };

 const { data: observations } = await service.from('fleet_location_observations')
  .select('id, latitude, longitude').eq('organization_id', input.organizationId)
  .eq('branch_id', input.branchId).in('status', ['CANDIDATE', 'APPLIED'])
  .gte('created_at', new Date(Date.now() - 90 * 86_400_000).toISOString())
  .order('created_at', { ascending: false }).limit(20);
 const clustered = ((observations ?? []) as Array<{ id: string; latitude: number | string; longitude: number | string }>).filter((row) =>
  distanceKm(candidate.latitude, candidate.longitude, Number(row.latitude), Number(row.longitude)) * 1000 <= CLUSTER_RADIUS_M);
 const sample = clustered.slice(0, 10);
 if (!sample.length) return { learned: false, reason: 'OBSERVATION_NOT_FOUND' };
 const latitude = sample.reduce((sum, row) => sum + Number(row.latitude), 0) / sample.length;
 const longitude = sample.reduce((sum, row) => sum + Number(row.longitude), 0) / sample.length;
 const count = sample.length;
 const confidence = Math.min(0.95, 0.35 + count * 0.2);
 const verified = count >= 3;
 const now = new Date().toISOString();
 const existingSourceIsLearned = ['CARTRACK_DROP', 'DEVICE_POD'].includes(String(geofence?.location_source ?? ''));
 const shouldApplyCenter = !geofence || existingSourceIsLearned || verified;

 let geofenceId = geofence?.id ?? null;
 if (geofenceId) {
  const updates = shouldApplyCenter ? {
   latitude, longitude, location_source: candidate.source, observation_count: count,
   confidence_score: confidence, last_observed_at: candidate.event_at,
   verified_at: verified ? (geofence.verified_at ?? now) : null, updated_at: now,
  } : {
   observation_count: count, last_observed_at: candidate.event_at, updated_at: now,
  };
  await service.from('fleet_geofences').update(updates)
   .eq('id', geofenceId).eq('organization_id', input.organizationId);
 } else {
  const { data: created, error } = await service.from('fleet_geofences').insert({
   organization_id: input.organizationId, branch_id: input.branchId,
   name: `${branch.branch_code} - ${branch.branch_name}`, geofence_type: 'BRANCH',
   latitude, longitude, radius_m: 250, location_source: candidate.source,
   observation_count: count, confidence_score: confidence,
   last_observed_at: candidate.event_at, verified_at: verified ? now : null,
   created_by: input.profileId,
  }).select('id').single();
  if (error) return { learned: false, reason: error.message };
  geofenceId = created.id;
 }

 await Promise.all([
  shouldApplyCenter ? service.from('branches').update({ latitude, longitude, updated_at: now })
   .eq('id', input.branchId).eq('organization_id', input.organizationId) : Promise.resolve(),
  observation?.id ? service.from('fleet_location_observations').update({
   status: shouldApplyCenter ? 'APPLIED' : 'CANDIDATE', geofence_id: geofenceId,
  })
   .eq('id', observation.id).eq('organization_id', input.organizationId) : Promise.resolve(),
 ]);
 return {
  learned: true, source: candidate.source, status: verified ? 'VERIFIED' : 'LEARNING',
  observation_count: count, confidence_score: confidence, latitude, longitude,
 };
}
