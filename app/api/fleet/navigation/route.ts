import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildWazeUrl } from '@/lib/navigation/waze';
import type {
 FleetNavigationEvent,
 FleetNavigationResponse,
 FleetNavigationStop,
 FleetRoutePreferences,
} from '@/lib/fleet/types';

const MANAGEMENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);
const REQUIRED_CHECKS = ['vehicle_condition', 'tyres', 'load_secured', 'documents'];
const ACTIVE_PLAN_STATUSES = ['READY', 'DISPATCHED'];
const OPEN_STOP_STATUSES = ['PENDING', 'IN_TRANSIT'];
const DEFAULT_PREFERENCES: FleetRoutePreferences = {
 avoid_tolls: false,
 avoid_ferries: true,
 avoid_freeways: false,
 avoid_dangerous_turns: true,
 avoid_trails: 'avoid_all',
};

type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;

function malaysiaDate(offsetDays = 0) {
 const date = new Date(Date.now() + offsetDays * 86_400_000);
 return new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
 }).format(date);
}

function sanitizePreferences(value: unknown): FleetRoutePreferences {
 const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 const trail = ['avoid_all', 'allow', 'avoid_long'].includes(String(row.avoid_trails))
  ? String(row.avoid_trails) as FleetRoutePreferences['avoid_trails']
  : DEFAULT_PREFERENCES.avoid_trails;
 return {
  avoid_tolls: row.avoid_tolls === true,
  avoid_ferries: row.avoid_ferries !== false,
  avoid_freeways: row.avoid_freeways === true,
  avoid_dangerous_turns: row.avoid_dangerous_turns !== false,
  avoid_trails: trail,
 };
}

function wazeUrl(
 destination: { latitude: number | null; longitude: number | null; name: string },
 preferences: FleetRoutePreferences) {
 return buildWazeUrl({
  latitude: destination.latitude,
  longitude: destination.longitude,
  query: destination.name,
  avoidTolls: preferences.avoid_tolls,
  avoidFerries: preferences.avoid_ferries,
  avoidFreeways: preferences.avoid_freeways,
  avoidDangerousTurns: preferences.avoid_dangerous_turns,
  avoidTrails: preferences.avoid_trails,
 });
}

async function recentEvents(service: any, organizationId: string, driverIds?: string[]) {
 let query = service.from('fleet_navigation_events')
  .select('id, event_type, destination_name, used_coordinate_fallback, reason, created_at, driver:drivers(full_name), vehicle:vehicles(plate_number)')
  .eq('organization_id', organizationId)
  .order('created_at', { ascending: false })
  .limit(40);
 if (driverIds) {
  if (driverIds.length === 0) return [] as FleetNavigationEvent[];
  query = query.in('driver_id', driverIds);
 }
 const { data } = await query;
 return ((data ?? []) as any[]).map((event) => ({
  id: event.id,
  event_type: event.event_type,
  destination_name: event.destination_name,
  driver_name: event.driver?.full_name ?? null,
  plate_number: event.vehicle?.plate_number ?? null,
  used_coordinate_fallback: Boolean(event.used_coordinate_fallback),
  reason: event.reason ?? null,
  created_at: event.created_at,
 })) as FleetNavigationEvent[];
}

async function locationMetrics(service: any, organizationId: string) {
 const [{ data: branches }, { data: geofences }] = await Promise.all([
  service.from('branches').select('id, latitude, longitude').eq('organization_id', organizationId).eq('status', 'ACTIVE'),
  service.from('fleet_geofences').select('branch_id, verified_at').eq('organization_id', organizationId).eq('is_active', true).not('branch_id', 'is', null),
 ]);
 const geofenced = new Set(((geofences ?? []) as Array<{ branch_id: string }>).map((row) => row.branch_id));
 const verified = new Set(((geofences ?? []) as Array<{ branch_id: string; verified_at: string | null }>).filter((row) => row.verified_at).map((row) => row.branch_id));
 const rows = (branches ?? []) as Array<{ id: string; latitude: number | null; longitude: number | null }>;
 const withCoordinates = rows.filter((branch) =>
  (branch.latitude !== null && branch.longitude !== null) || geofenced.has(branch.id)).length;
 return { withCoordinates, withoutCoordinates: Math.max(0, rows.length - withCoordinates), learning: Math.max(0, geofenced.size - verified.size) };
}

async function driverContext(profile: Profile) {
 const service = createAdminClient() as any;
 const { data: drivers } = await service.from('drivers')
  .select('id, full_name').eq('organization_id', profile.organization_id)
  .eq('profile_id', profile.id).eq('status', 'ACTIVE');
 const driverRows = (drivers ?? []) as Array<{ id: string; full_name: string }>;
 const driverIds = driverRows.map((driver) => driver.id);

 const { data: sessions } = driverIds.length ? await service.from('fleet_driver_sessions')
  .select('id, driver_id, vehicle_id, started_at, checklist, safe_driving_mode, route_preferences, current_route_stop_id, vehicle:vehicles(plate_number)')
  .eq('organization_id', profile.organization_id).eq('status', 'ACTIVE')
  .in('driver_id', driverIds).order('started_at', { ascending: false }).limit(1) : { data: [] };
 const session = (sessions ?? [])[0] as any | undefined;
 const preferences = sanitizePreferences(session?.route_preferences);

 let assignment: any = null;
 if (session) {
  const result = await service.from('driver_vehicle_assignments')
   .select('id, acknowledged_at').eq('organization_id', profile.organization_id)
   .eq('driver_id', session.driver_id).eq('vehicle_id', session.vehicle_id)
   .eq('is_active', true).maybeSingle();
  assignment = result.data;
 }

 const { data: plans } = driverIds.length ? await service.from('hq_delivery_route_plans')
  .select('id, driver_id, vehicle_id, route_name, production_date, status')
  .eq('organization_id', profile.organization_id).in('driver_id', driverIds)
  .in('status', ACTIVE_PLAN_STATUSES).gte('production_date', malaysiaDate(-1))
  .lte('production_date', malaysiaDate(7)).order('production_date').order('created_at') : { data: [] };
 const compatiblePlans = ((plans ?? []) as any[]).filter((plan) =>
  !session || !plan.vehicle_id || plan.vehicle_id === session.vehicle_id);
 const planIds = compatiblePlans.map((plan) => plan.id);

 const { data: stops } = planIds.length ? await service.from('hq_delivery_route_stops')
  .select('id, route_plan_id, stop_sequence, branch_id, status, is_handoff, notes')
  .in('route_plan_id', planIds).in('status', OPEN_STOP_STATUSES)
  .order('stop_sequence') : { data: [] };
 const stopRows = (stops ?? []) as any[];
 const branchIds = [...new Set(stopRows.map((stop) => stop.branch_id).filter(Boolean))];
 const [{ data: branches }, { data: geofences }, { data: quickGeofences }] = await Promise.all([
  branchIds.length ? service.from('branches').select('id, branch_code, branch_name, area, latitude, longitude').in('id', branchIds) : Promise.resolve({ data: [] }),
  branchIds.length ? service.from('fleet_geofences').select('id, branch_id, latitude, longitude, confidence_score, observation_count, verified_at, location_source').eq('organization_id', profile.organization_id).eq('is_active', true).in('branch_id', branchIds) : Promise.resolve({ data: [] }),
  service.from('fleet_geofences').select('id, name, geofence_type, latitude, longitude')
   .eq('organization_id', profile.organization_id).eq('is_active', true)
   .in('geofence_type', ['FACTORY', 'HQ', 'HUB']).order('geofence_type'),
 ]);
 const branchById = new Map<string, any>(((branches ?? []) as any[]).map((branch) => [branch.id, branch]));
 const fenceByBranch = new Map<string, any>(((geofences ?? []) as any[]).map((fence) => [fence.branch_id, fence]));
 const planById = new Map<string, any>(compatiblePlans.map((plan) => [plan.id, plan]));
 const orderedStops = [...stopRows].sort((a, b) => {
  const planA = compatiblePlans.findIndex((plan) => plan.id === a.route_plan_id);
  const planB = compatiblePlans.findIndex((plan) => plan.id === b.route_plan_id);
  return planA - planB || Number(a.stop_sequence) - Number(b.stop_sequence);
 });
 const navigationStops: FleetNavigationStop[] = orderedStops.map((stop) => {
  const branch = branchById.get(stop.branch_id);
  const fence = fenceByBranch.get(stop.branch_id);
  const latitude = fence?.latitude != null ? Number(fence.latitude) : branch?.latitude != null ? Number(branch.latitude) : null;
  const longitude = fence?.longitude != null ? Number(fence.longitude) : branch?.longitude != null ? Number(branch.longitude) : null;
  const destinationName = branch
   ? `${branch.branch_code} - ${branch.branch_name}${branch.area ? `, ${branch.area}` : ''}, Malaysia`
   : stop.notes ?? 'Hentian operasi';
  const coordinateStatus: FleetNavigationStop['coordinate_status'] = latitude === null || longitude === null
   ? 'NAME_FALLBACK' : fence && !fence.verified_at ? 'LEARNING' : 'VERIFIED';
  return {
   id: stop.id,
   route_plan_id: stop.route_plan_id,
   route_name: planById.get(stop.route_plan_id)?.route_name ?? 'Laluan penghantaran',
   sequence: Number(stop.stop_sequence),
   branch_code: branch?.branch_code ?? null,
   destination_name: destinationName,
   latitude,
   longitude,
   geofence_id: fence?.id ?? null,
   coordinate_status: coordinateStatus,
   observation_count: Number(fence?.observation_count ?? 0),
   confidence_score: fence?.confidence_score == null ? null : Number(fence.confidence_score),
   status: stop.status,
   waze_url: wazeUrl({ latitude, longitude, name: destinationName }, preferences),
  };
 });
 const nextStop = navigationStops[0] ?? null;
 const checklist = (session?.checklist ?? {}) as Record<string, boolean>;
 const readiness = [
  { key: 'profile', label: 'Profil driver aktif', passed: driverIds.length > 0, detail: driverIds.length ? driverRows[0].full_name : 'Profil driver belum dipautkan.' },
  { key: 'shift', label: 'Syif aktif', passed: Boolean(session), detail: session ? `Bermula ${new Date(session.started_at).toLocaleString('ms-MY')}` : 'Mulakan syif dan pilih kenderaan.' },
  { key: 'assignment', label: 'Kenderaan ditugaskan', passed: Boolean(assignment), detail: assignment ? session?.vehicle?.plate_number ?? 'Kenderaan aktif' : 'Kenderaan belum dipadankan.' },
  { key: 'acknowledged', label: 'Tanggungjawab diterima', passed: Boolean(assignment?.acknowledged_at), detail: assignment?.acknowledged_at ? 'Pengesahan driver direkodkan.' : 'Sahkan penerimaan kenderaan dahulu.' },
  { key: 'checklist', label: 'Pemeriksaan keselamatan lengkap', passed: REQUIRED_CHECKS.every((key) => checklist[key] === true), detail: 'Lampu, brek, tayar, muatan dan dokumen.' },
  { key: 'route', label: 'Arahan laluan tersedia', passed: Boolean(nextStop), detail: nextStop ? `${nextStop.route_name} - ${nextStop.destination_name}` : 'OM perlu menerbitkan laluan READY.' },
 ];
 const quickDestinations = ((quickGeofences ?? []) as any[]).map((fence) => ({
  id: fence.id, name: fence.name, geofence_type: fence.geofence_type,
  latitude: Number(fence.latitude), longitude: Number(fence.longitude),
  waze_url: wazeUrl({ latitude: Number(fence.latitude), longitude: Number(fence.longitude), name: fence.name }, preferences),
 }));

 return {
  service, driverRows, driverIds, session, assignment, preferences, navigationStops, nextStop,
  readiness, quickDestinations,
 };
}

async function metrics(service: any, organizationId: string, events: FleetNavigationEvent[]) {
 const location = await locationMetrics(service, organizationId);
 const today = malaysiaDate();
 const todayEvents = events.filter((event) => event.created_at.slice(0, 10) >= today);
 return {
  launches_today: todayEvents.filter((event) => event.event_type === 'LAUNCHED').length,
  active_drivers: new Set(todayEvents.filter((event) => event.event_type === 'LAUNCHED').map((event) => event.driver_name).filter(Boolean)).size,
  coordinate_fallbacks: todayEvents.filter((event) => event.used_coordinate_fallback).length,
  blocked_attempts: todayEvents.filter((event) => event.event_type === 'BLOCKED').length,
  locations_with_coordinates: location.withCoordinates,
  locations_without_coordinates: location.withoutCoordinates,
  locations_learning: location.learning,
 };
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!MANAGEMENT_ROLES.has(profile.role) && profile.role !== 'DRIVER') {
  return NextResponse.json({ error: 'Tiada akses kepada navigasi fleet.' }, { status: 403 });
 }
 const service = createAdminClient() as any;
 if (MANAGEMENT_ROLES.has(profile.role)) {
  const events = await recentEvents(service, profile.organization_id);
  const response: FleetNavigationResponse = {
   mode: 'MANAGEMENT', generated_at: new Date().toISOString(), session: null,
   readiness: [], ready_to_navigate: false, next_stop: null, remaining_stops: 0,
   quick_destinations: [], recent_events: events,
   metrics: await metrics(service, profile.organization_id, events),
  };
  return NextResponse.json(response, { headers: { 'Cache-Control': 'private, max-age=5' } });
 }

 const context = await driverContext(profile);
 const events = await recentEvents(context.service, profile.organization_id, context.driverIds);
 const response: FleetNavigationResponse = {
  mode: 'DRIVER', generated_at: new Date().toISOString(),
  session: context.session ? {
   id: context.session.id, driver_id: context.session.driver_id, vehicle_id: context.session.vehicle_id,
   driver_name: context.driverRows.find((driver) => driver.id === context.session.driver_id)?.full_name ?? 'Driver',
   plate_number: context.session.vehicle?.plate_number ?? null, started_at: context.session.started_at,
   safe_driving_mode: Boolean(context.session.safe_driving_mode), route_preferences: context.preferences,
  } : null,
  readiness: context.readiness,
  ready_to_navigate: context.readiness.every((item) => item.passed),
  next_stop: context.nextStop,
  remaining_stops: context.navigationStops.length,
  quick_destinations: context.quickDestinations,
  recent_events: events,
  metrics: await metrics(context.service, profile.organization_id, events),
 };
 return NextResponse.json(response, { headers: { 'Cache-Control': 'private, max-age=5' } });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (profile.role !== 'DRIVER') return NextResponse.json({ error: 'Tindakan navigasi ini khusus untuk driver.' }, { status: 403 });
 const body = await request.json().catch(() => ({})) as {
  action?: string; destination_id?: string; route_stop_id?: string;
  latitude?: number | null; longitude?: number | null; reason?: string;
  preferences?: FleetRoutePreferences;
 };
 const context = await driverContext(profile);
 const action = String(body.action ?? '').toUpperCase();
 const eventBase = {
  organization_id: profile.organization_id,
  session_id: context.session?.id ?? null,
  driver_id: context.session?.driver_id ?? context.driverIds[0] ?? null,
  vehicle_id: context.session?.vehicle_id ?? null,
  origin_latitude: body.latitude ?? null,
  origin_longitude: body.longitude ?? null,
  created_by: profile.id,
 };

 if (action === 'SET_PREFERENCES') {
  if (!context.session) return NextResponse.json({ error: 'Mulakan syif sebelum menetapkan pilihan laluan.' }, { status: 409 });
  const preferences = sanitizePreferences(body.preferences);
  const { error } = await context.service.from('fleet_driver_sessions').update({
   route_preferences: preferences, updated_at: new Date().toISOString(),
  }).eq('id', context.session.id).eq('organization_id', profile.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
 }

 if (action === 'REPORT_ISSUE') {
  const destination = context.nextStop;
  const reason = body.reason?.trim();
  if (!reason) return NextResponse.json({ error: 'Nyatakan masalah perjalanan untuk tindakan OM.' }, { status: 400 });
  const { error } = await context.service.from('fleet_navigation_events').insert({
   ...eventBase, route_plan_id: destination?.route_plan_id ?? null, route_stop_id: destination?.id ?? null,
   geofence_id: destination?.geofence_id ?? null, event_type: 'ISSUE_REPORTED',
   destination_name: destination?.destination_name ?? 'Operasi driver',
   destination_latitude: destination?.latitude ?? null, destination_longitude: destination?.longitude ?? null,
   waze_url: destination?.waze_url ?? null,
   used_coordinate_fallback: destination?.coordinate_status === 'NAME_FALLBACK', reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (context.session?.vehicle_id) {
   await context.service.from('fleet_gps_alerts').upsert({
    organization_id: profile.organization_id, vehicle_id: context.session.vehicle_id,
    alert_type: 'ROUTE_DEVIATION', severity: 'HIGH', status: 'OPEN',
    title: `Driver melaporkan masalah - ${context.session.vehicle?.plate_number ?? 'kenderaan'}`,
    message: reason, event_at: new Date().toISOString(),
    dedupe_key: `NAVIGATION_ISSUE:${context.session.id}:${new Date().toISOString().slice(0, 13)}`,
    metadata: { session_id: context.session.id, route_stop_id: destination?.id ?? null },
   }, { onConflict: 'organization_id,dedupe_key', ignoreDuplicates: true });
  }
  return NextResponse.json({ ok: true });
 }

 const quick = context.quickDestinations.find((destination) => destination.id === body.destination_id);
 const destination = action === 'LAUNCH_QUICK' ? quick : context.nextStop;
 const destinationName = destination
  ? ('destination_name' in destination ? destination.destination_name : destination.name)
  : 'Hentian seterusnya';
 const blocking = context.readiness.filter((item) => !item.passed && (action !== 'LAUNCH_QUICK' || item.key !== 'route'));
 if (!destination || blocking.length > 0 || (body.route_stop_id && context.nextStop?.id !== body.route_stop_id)) {
  const reason = !destination ? 'Destinasi tidak tersedia.' : blocking.map((item) => item.label).join(', ');
  if (eventBase.driver_id) await context.service.from('fleet_navigation_events').insert({
   ...eventBase, event_type: 'BLOCKED', destination_name: destinationName,
   reason, metadata: { blocking_checks: blocking.map((item) => item.key) },
  });
  return NextResponse.json({ error: `Navigasi disekat: ${reason}` }, { status: 409 });
 }

 const routeStop = 'route_plan_id' in destination ? destination : null;
 const latitude = destination.latitude;
 const longitude = destination.longitude;
 const url = wazeUrl({ latitude, longitude, name: destinationName }, context.preferences);
 const fallback = latitude === null || longitude === null;

 if (['LAUNCH_NEXT', 'LAUNCH_QUICK', 'SHARE', 'FALLBACK_COPIED'].includes(action)) {
  const eventType = action === 'SHARE' ? 'SHARED' : action === 'FALLBACK_COPIED' ? 'FALLBACK_COPIED'
   : 'LAUNCHED';
  const { error } = await context.service.from('fleet_navigation_events').insert({
   ...eventBase, route_plan_id: routeStop?.route_plan_id ?? null, route_stop_id: routeStop?.id ?? null,
   geofence_id: routeStop?.geofence_id ?? ('geofence_type' in destination ? destination.id : null),
   event_type: eventType, destination_name: destinationName,
   destination_latitude: latitude, destination_longitude: longitude,
   waze_url: url, used_coordinate_fallback: fallback, reason: body.reason?.trim() || null,
   metadata: { route_preferences: context.preferences },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 }

 if (action === 'LAUNCH_NEXT' || action === 'LAUNCH_QUICK') {
  await context.service.from('fleet_driver_sessions').update({
   current_route_stop_id: routeStop?.id ?? null, safe_driving_mode: true,
   last_navigation_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', context.session.id).eq('organization_id', profile.organization_id);
  if (routeStop?.status === 'PENDING') {
   await context.service.from('hq_delivery_route_stops').update({ status: 'IN_TRANSIT' }).eq('id', routeStop.id);
  }
  return NextResponse.json({ ok: true, waze_url: url });
 }
 if (action === 'SHARE') {
  return NextResponse.json({ ok: true, waze_url: url, share_text: `RKJ One: ${destinationName}\n${url}` });
 }
 if (action === 'FALLBACK_COPIED') return NextResponse.json({ ok: true });
 return NextResponse.json({ error: 'Tindakan navigasi tidak sah.' }, { status: 400 });
}
