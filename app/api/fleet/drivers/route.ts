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
};

type DriverVehicleAssignmentRow = {
 driver_id: string;
 vehicle_id: string;
 is_active: boolean;
};

type VehicleRow = {
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string | null;
 capacity: string | null;
 remarks: string | null;
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
};

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
 const { data, error } = await supabase.from('drivers').select('id, driver_code, full_name, route_description, phone').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('driver_code');

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const driverRows = (data ?? []) as DriverRow[];
 const driverIds = driverRows.map((driver) => driver.id);
 const [{ data: assignments }, { data: vehicles }, { data: routes }] = await Promise.all([
 driverIds.length > 0
 ? supabase.from('driver_vehicle_assignments').select('driver_id, vehicle_id, is_active').eq('organization_id', profile.organization_id).eq('is_active', true).in('driver_id', driverIds)
 : Promise.resolve({ data: [] }),
 supabase.from('vehicles').select('id, vehicle_code, plate_number, vehicle_type, capacity, remarks, status').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('vehicle_code'),
 supabase.from('agent_driver_routes').select('id, route_code, sequence_no, driver_name, assistant_name, collect_from, location_name, location_type, notes, status').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('route_code').order('sequence_no'),
 ]);

 const assignmentRows = (assignments ?? []) as DriverVehicleAssignmentRow[];
 const vehicleRows = (vehicles ?? []) as VehicleRow[];
 const routeRows = (routes ?? []) as AgentDriverRouteRow[];
 const vehicleById = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));
 const drivers = driverRows.map((driver) => {
 const driverVehicles = assignmentRows
 .filter((assignment) => assignment.driver_id === driver.id)
 .map((assignment) => vehicleById.get(assignment.vehicle_id))
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

 return jsonWithPrivateCache({ drivers, route_options }, 60, 180);
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
