import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { jsonWithPrivateCache } from '@/lib/http/cache';

type DriverRow = {
 id: string;
 driver_code: string;
 full_name: string;
 route_description: string | null;
 phone: string | null;
 profile_id: string | null;
};

type DriverVehicleAssignmentRow = {
 id: string;
 driver_id: string;
 vehicle_id: string;
 is_active: boolean;
 assignment_role: 'PRIMARY' | 'RELIEF' | 'ASSISTANT';
 responsibility_notes: string | null;
 acknowledged_at: string | null;
};

type VehicleRow = {
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string | null;
 capacity: string | null;
 remarks: string | null;
 vehicle_category: 'MANAGER' | 'DELIVERY' | 'FACTORY' | 'REPLACEMENT';
 status: string;
};

type AgentDriverRouteRow = {
 id?: string;
 route_code: string;
 sequence_no?: number;
 driver_name: string | null;
 assistant_name?: string | null;
 collect_from: string | null;
 location_name: string | null;
 location_type: string | null;
 notes: string | null;
 status: string;
};

type UpdateDriverPayload = {
 id?: string;
 full_name?: string;
 phone?: string | null;
 route_description?: string | null;
 route_keys?: string[];
 vehicle_assignments?: Array<{
  vehicle_id: string;
  assignment_role: 'PRIMARY' | 'RELIEF' | 'ASSISTANT';
  responsibility_notes?: string | null;
 }>;
};

const VEHICLE_ASSIGNMENT_ROLES = new Set(['PRIMARY', 'RELIEF', 'ASSISTANT']);
const DEFAULT_RESPONSIBILITY = 'Periksa kenderaan sebelum bergerak; gunakan untuk tugasan rasmi; rekod GPS/status, minyak, tol, POD dan kerosakan; pulangkan bersih dan selamat.';

function routeKey(route: AgentDriverRouteRow) {
 return [
 route.route_code,
 route.sequence_no ?? 0,
 route.location_name ?? 'UNKNOWN',
 ].join('::');
}

function splitDriverNames(value?: string | null) {
 return [
 ...new Set(
 String(value ?? '')
 .split(/\s*\/\s*|\n|,/)
 .map((name) => name.trim())
 .filter(Boolean)),
 ];
}

function includesDriverName(value: string | null | undefined, fullName: string) {
 const names = splitDriverNames(value).map((name) => name.toLowerCase());
 return names.includes(fullName.toLowerCase()) || String(value ?? '').toLowerCase().includes(fullName.toLowerCase());
}

function routeLabel(route: AgentDriverRouteRow) {
 const rawName = route.location_name ?? 'Lokasi belum dinamakan';
 if (/^BR\d+/i.test(rawName)) return rawName;
 if (route.location_type === 'BRANCH_KIOSK') return rawName;
 const prefix = route.location_type === 'AGENT_DROP_POINT' ? 'Pickup Ejen' : 'Drop Point';
 return `${prefix}: ${rawName}`;
}

function isFleetManager(role?: string | null) {
 return ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR_MANAGER'].includes(String(role ?? '').toUpperCase());
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 let driverQuery = supabase.from('drivers').select('id, driver_code, full_name, route_description, phone, profile_id').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('driver_code');
 if (profile.role === 'DRIVER') driverQuery = driverQuery.eq('profile_id', profile.id);
 const { data, error } = await driverQuery;

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const driverRows = (data ?? []) as DriverRow[];
 const driverIds = driverRows.map((driver) => driver.id);
 const [{ data: assignments }, { data: vehicles }, { data: routes }] = await Promise.all([
 driverIds.length > 0
 ? supabase.from('driver_vehicle_assignments').select('id, driver_id, vehicle_id, is_active, assignment_role, responsibility_notes, acknowledged_at').eq('organization_id', profile.organization_id).eq('is_active', true).in('driver_id', driverIds)
 : Promise.resolve({ data: [] }),
 supabase.from('vehicles').select('id, vehicle_code, plate_number, vehicle_type, capacity, remarks, vehicle_category, status').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').neq('vehicle_category', 'MANAGER').order('vehicle_code'),
 supabase.from('agent_driver_routes').select('id, route_code, sequence_no, driver_name, assistant_name, collect_from, location_name, location_type, notes, status').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('route_code').order('sequence_no'),
 ]);

 const assignmentRows = (assignments ?? []) as DriverVehicleAssignmentRow[];
 const vehicleRows = (vehicles ?? []) as VehicleRow[];
 const routeRows = (routes ?? []) as AgentDriverRouteRow[];
 const vehicleById = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));
 const drivers = driverRows.map((driver) => {
 const driverVehicles = assignmentRows
 .filter((assignment) => assignment.driver_id === driver.id)
 .map((assignment) => {
  const vehicle = vehicleById.get(assignment.vehicle_id);
  return vehicle ? {
   ...vehicle,
   assignment_id: assignment.id,
   assignment_role: assignment.assignment_role,
   responsibility_notes: assignment.responsibility_notes,
   acknowledged_at: assignment.acknowledged_at,
  } : null;
 })
 .filter(Boolean);
 const driverRouteRows = routeRows.filter((route) => includesDriverName(route.driver_name, driver.full_name));

 return {
 ...driver,
 vehicles: driverVehicles,
 route_rows: driverRouteRows,
 assigned_route_keys: driverRouteRows.map(routeKey),
 };
 });

 const route_options = routeRows.map((route) => ({
 key: routeKey(route),
 route_code: route.route_code,
 sequence_no: route.sequence_no ?? 0,
 label: routeLabel(route),
 driver_name: route.driver_name,
 assigned_driver_names: splitDriverNames(route.driver_name),
 collect_from: route.collect_from,
 location_name: route.location_name,
 location_type: route.location_type,
 notes: route.notes,
 status: route.status,
 }));

 return jsonWithPrivateCache({
  drivers,
  route_options,
  available_vehicles: vehicleRows,
  current_driver_id: driverRows.find((driver) => driver.profile_id === profile.id)?.id ?? null,
  can_manage: isFleetManager(profile.role),
 }, 60, 180);
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!isFleetManager(profile.role)) return NextResponse.json({ error: 'Tiada akses untuk kemaskini driver.' }, { status: 403 });

 const payload = (await request.json()) as UpdateDriverPayload;
 if (!payload.id) return NextResponse.json({ error: 'ID driver diperlukan.' }, { status: 400 });

 const service = (await createServiceClient()) as any;
 const { data: driver, error: driverError } = await service
 .from('drivers')
 .select('id, full_name, driver_code')
 .eq('organization_id', profile.organization_id)
 .eq('id', payload.id)
 .maybeSingle();

 if (driverError) return NextResponse.json({ error: driverError.message }, { status: 500 });
 if (!driver) return NextResponse.json({ error: 'Driver tidak dijumpai.' }, { status: 404 });

 const driverRow = driver as DriverRow;
 const nextName = String(payload.full_name ?? driverRow.full_name).trim();
 if (!nextName) return NextResponse.json({ error: 'Nama driver tidak boleh kosong.' }, { status: 400 });

 const { error: updateError } = await service
 .from('drivers')
 .update({
 full_name: nextName,
 phone: payload.phone?.trim() || null,
 route_description: payload.route_description?.trim() || null,
 updated_at: new Date().toISOString(),
 })
 .eq('organization_id', profile.organization_id)
 .eq('id', payload.id);

 if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

 if (Array.isArray(payload.route_keys)) {
 const selectedKeys = new Set(payload.route_keys);
 const { data: routes, error: routesError } = await service
 .from('agent_driver_routes')
 .select('id, route_code, sequence_no, driver_name, assistant_name, collect_from, location_name, location_type, notes, status')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE');

 if (routesError) return NextResponse.json({ error: routesError.message }, { status: 500 });

 const now = new Date().toISOString();
 for (const route of (routes ?? []) as AgentDriverRouteRow[]) {
 const currentNames = splitDriverNames(route.driver_name)
 .filter((name) => name.toLowerCase() !== 'belum ditetapkan')
 .filter((name) => name.toLowerCase() !== driverRow.full_name.toLowerCase() && name.toLowerCase() !== nextName.toLowerCase());
 const shouldAssign = selectedKeys.has(routeKey(route));
 const nextNames = shouldAssign ? [...currentNames, nextName] : currentNames;

 const { error } = await service
 .from('agent_driver_routes')
 .update({
 driver_name: nextNames.length > 0 ? nextNames.join(' / ') : 'Belum ditetapkan',
 assistant_name: nextNames.some((name) => name.toLowerCase().includes('nadzir')) ? 'MUHAMMAD NADZIR BIN MOHAMED HASHIRAF' : null,
 updated_at: now,
 })
 .eq('organization_id', profile.organization_id)
 .eq('route_code', route.route_code)
 .eq('sequence_no', route.sequence_no ?? 0)
 .eq('location_name', route.location_name ?? '');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 }
 }

 if (Array.isArray(payload.vehicle_assignments)) {
  const uniqueVehicleIds = new Set(payload.vehicle_assignments.map((item) => item.vehicle_id));
  if (uniqueVehicleIds.size !== payload.vehicle_assignments.length) return NextResponse.json({ error: 'Kenderaan yang sama tidak boleh dipilih dua kali.' }, { status: 400 });
  if (payload.vehicle_assignments.some((item) => !item.vehicle_id || !VEHICLE_ASSIGNMENT_ROLES.has(item.assignment_role))) return NextResponse.json({ error: 'Padanan atau peranan kenderaan tidak sah.' }, { status: 400 });

  const vehicleIds = [...uniqueVehicleIds];
  const { data: allowedVehicles, error: vehicleError } = vehicleIds.length
   ? await service.from('vehicles').select('id').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').neq('vehicle_category', 'MANAGER').in('id', vehicleIds)
   : { data: [], error: null };
  if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 500 });
  if ((allowedVehicles ?? []).length !== vehicleIds.length) return NextResponse.json({ error: 'Satu atau lebih kenderaan tidak sah atau dikhaskan untuk manager.' }, { status: 400 });

  const primaryVehicleIds = payload.vehicle_assignments.filter((item) => item.assignment_role === 'PRIMARY').map((item) => item.vehicle_id);
  if (primaryVehicleIds.length) {
   const { data: occupiedPrimary, error: primaryError } = await service.from('driver_vehicle_assignments')
    .select('vehicle_id, driver:drivers(full_name)').eq('organization_id', profile.organization_id).eq('is_active', true)
    .eq('assignment_role', 'PRIMARY').neq('driver_id', payload.id).in('vehicle_id', primaryVehicleIds);
   if (primaryError) return NextResponse.json({ error: primaryError.message }, { status: 500 });
   if ((occupiedPrimary ?? []).length) {
    const occupied = occupiedPrimary[0] as { driver?: { full_name?: string } | null };
    return NextResponse.json({ error: `Kenderaan ini sudah mempunyai driver utama${occupied.driver?.full_name ? `: ${occupied.driver.full_name}` : ''}. Pilih Driver Ganti atau tukar assignment driver sedia ada dahulu.` }, { status: 409 });
   }
  }

  const { data: previousAssignments, error: previousError } = await service.from('driver_vehicle_assignments')
   .select('id, vehicle_id, assignment_role, responsibility_notes, acknowledged_at').eq('organization_id', profile.organization_id).eq('driver_id', payload.id).eq('is_active', true);
  if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 });
  const now = new Date().toISOString();
  const { error: deactivateError } = await service.from('driver_vehicle_assignments')
   .update({ is_active: false, unassigned_at: now }).eq('organization_id', profile.organization_id).eq('driver_id', payload.id).eq('is_active', true);
  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });

  if (payload.vehicle_assignments.length) {
   const { error: insertError } = await service.from('driver_vehicle_assignments').insert(payload.vehicle_assignments.map((item) => {
    const notes = item.responsibility_notes?.trim() || DEFAULT_RESPONSIBILITY;
    const previous = (previousAssignments ?? []).find((row: { vehicle_id: string; assignment_role: string; responsibility_notes: string | null }) => row.vehicle_id === item.vehicle_id && row.assignment_role === item.assignment_role && (row.responsibility_notes ?? DEFAULT_RESPONSIBILITY) === notes);
    return {
     organization_id: profile.organization_id,
     driver_id: payload.id,
     vehicle_id: item.vehicle_id,
     assignment_role: item.assignment_role,
     responsibility_notes: notes,
     acknowledged_at: previous?.acknowledged_at ?? null,
     assigned_by: profile.id,
     assigned_at: now,
     is_active: true,
    };
   }));
   if (insertError) {
    const previousIds = (previousAssignments ?? []).map((item: { id: string }) => item.id);
    if (previousIds.length) await service.from('driver_vehicle_assignments').update({ is_active: true, unassigned_at: null }).in('id', previousIds);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
   }
  }

  await service.from('vehicles').update({ default_driver_id: null }).eq('organization_id', profile.organization_id).eq('default_driver_id', payload.id);
  if (primaryVehicleIds.length) await service.from('vehicles').update({ default_driver_id: payload.id }).eq('organization_id', profile.organization_id).in('id', primaryVehicleIds);
 }

 return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const payload = (await request.json()) as { action?: string; assignment_id?: string };
 if (payload.action !== 'ACKNOWLEDGE_ASSIGNMENT' || !payload.assignment_id) return NextResponse.json({ error: 'Tindakan tidak sah.' }, { status: 400 });

 const service = (await createServiceClient()) as any;
 const { data: driver, error: driverError } = await service.from('drivers').select('id').eq('organization_id', profile.organization_id).eq('profile_id', profile.id).eq('status', 'ACTIVE').maybeSingle();
 if (driverError) return NextResponse.json({ error: driverError.message }, { status: 500 });
 if (!driver) return NextResponse.json({ error: 'Profil pengguna belum dipautkan kepada rekod driver.' }, { status: 403 });

 const { data, error } = await service.from('driver_vehicle_assignments').update({ acknowledged_at: new Date().toISOString() })
  .eq('id', payload.assignment_id).eq('organization_id', profile.organization_id).eq('driver_id', driver.id).eq('is_active', true).select('id').maybeSingle();
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 if (!data) return NextResponse.json({ error: 'Assignment aktif tidak dijumpai.' }, { status: 404 });
 return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!isFleetManager(profile.role)) return NextResponse.json({ error: 'Tiada akses untuk delete driver.' }, { status: 403 });

 const payload = (await request.json()) as { id?: string };
 if (!payload.id) return NextResponse.json({ error: 'ID driver diperlukan.' }, { status: 400 });

 const service = (await createServiceClient()) as any;
 const { data: driver, error: driverError } = await service
 .from('drivers')
 .select('id, full_name')
 .eq('organization_id', profile.organization_id)
 .eq('id', payload.id)
 .maybeSingle();

 if (driverError) return NextResponse.json({ error: driverError.message }, { status: 500 });
 if (!driver) return NextResponse.json({ error: 'Driver tidak dijumpai.' }, { status: 404 });

 const driverRow = driver as DriverRow;
 const now = new Date().toISOString();
 const { error: inactiveDriverError } = await service
 .from('drivers')
 .update({ status: 'INACTIVE', updated_at: now })
 .eq('organization_id', profile.organization_id)
 .eq('id', payload.id);

 if (inactiveDriverError) return NextResponse.json({ error: inactiveDriverError.message }, { status: 500 });

 const { error: inactiveAssignmentError } = await service
 .from('driver_vehicle_assignments')
 .update({ is_active: false, unassigned_at: now })
 .eq('organization_id', profile.organization_id)
 .eq('driver_id', payload.id)
 .eq('is_active', true);

 if (inactiveAssignmentError) return NextResponse.json({ error: inactiveAssignmentError.message }, { status: 500 });

 const { data: routes, error: routesError } = await service
 .from('agent_driver_routes')
 .select('id, route_code, sequence_no, driver_name, location_name')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE');

 if (routesError) return NextResponse.json({ error: routesError.message }, { status: 500 });

 for (const route of (routes ?? []) as AgentDriverRouteRow[]) {
 if (!includesDriverName(route.driver_name, driverRow.full_name)) continue;
 const nextNames = splitDriverNames(route.driver_name).filter((name) => name.toLowerCase() !== driverRow.full_name.toLowerCase());
 const { error } = await service
 .from('agent_driver_routes')
 .update({
 driver_name: nextNames.length > 0 ? nextNames.join(' / ') : 'Belum ditetapkan',
 assistant_name: nextNames.some((name) => name.toLowerCase().includes('nadzir')) ? 'MUHAMMAD NADZIR BIN MOHAMED HASHIRAF' : null,
 updated_at: now,
 })
 .eq('organization_id', profile.organization_id)
 .eq('route_code', route.route_code)
 .eq('sequence_no', route.sequence_no ?? 0)
 .eq('location_name', route.location_name ?? '');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 }

 return NextResponse.json({ ok: true });
}
