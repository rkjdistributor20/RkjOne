import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCartrackFleetGpsStatus } from '@/lib/fleet/cartrack';
import type { CompanyVehicleActionPayload, CompanyVehicleAccessMode } from '@/lib/fleet/company-vehicle-types';

const MANAGEMENT = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);
const COMPLIANCE = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER']);
const EXPENSE_REVIEW = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'FINANCE']);
const GPS_ACCESS = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER']);
const INCIDENT_STATUSES = new Set(['OPEN', 'UNDER_REVIEW', 'IN_REPAIR', 'RESOLVED', 'CLOSED']);
const EXPENSE_STATUSES = new Set(['APPROVED', 'REJECTED']);
const VEHICLE_CATEGORIES = new Set(['MANAGER', 'DELIVERY', 'FACTORY', 'REPLACEMENT']);

function modeFor(role: string): CompanyVehicleAccessMode {
 if (MANAGEMENT.has(role)) return 'MANAGEMENT';
 if (role === 'MAINTENANCE_MANAGER') return 'MAINTENANCE';
 if (role === 'FINANCE') return 'FINANCE';
 if (role === 'HR') return 'HR';
 return 'CUSTODIAN';
}

function clean(value?: string) {
 return value?.trim() || null;
}

function safeUrl(value?: string) {
 const cleaned = clean(value);
 if (!cleaned) return null;
 try {
  const url = new URL(cleaned);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
 } catch { return null; }
}

function numberOrNull(value: unknown) {
 return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function plausibleOdometer(value: unknown) {
 const numeric = numberOrNull(value);
 return numeric !== null && numeric >= 0 && numeric <= 2_000_000 ? numeric : null;
}

function isRecentGpsEvent(value: unknown, now: Date) {
 if (typeof value !== 'string' || !value) return false;
 const eventTime = new Date(value).getTime();
 return Number.isFinite(eventTime) && eventTime <= now.getTime() + 60_000 && now.getTime() - eventTime <= 30 * 60_000;
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const service = createAdminClient() as any;
 const mode = modeFor(profile.role);
 const canSeeAll = mode !== 'CUSTODIAN';
 let vehiclesQuery = service.from('vehicles').select(`
  id, vehicle_code, plate_number, vehicle_type, vehicle_category,
  company_custodian_profile_id, company_assigned_at, company_usage_note,
  road_tax_expiry, insurance_expiry, inspection_expiry, permit_expiry, compliance_notes,
  company_custodian:profiles!vehicles_company_custodian_profile_id_fkey(full_name, role)
 `).eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('vehicle_category').order('plate_number');
 if (!canSeeAll) vehiclesQuery = vehiclesQuery.eq('company_custodian_profile_id', profile.id);

 const { data: vehicleData, error: vehicleError } = await vehiclesQuery;
 if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 500 });
 const vehicles = (vehicleData ?? []) as any[];
 const vehicleIds = vehicles.map((vehicle) => vehicle.id as string);
 const empty = { data: [] as any[] };

 const [assignmentsResult, usageResult, expensesResult, incidentsResult, documentsResult, maintenanceResult, custodiansResult] = await Promise.all([
  vehicleIds.length ? service.from('company_vehicle_assignments').select('id, vehicle_id, custodian_profile_id, acknowledged_at, status').in('vehicle_id', vehicleIds).eq('status', 'ACTIVE') : empty,
  vehicleIds.length ? service.from('company_vehicle_usage_logs').select('id, vehicle_id, profile_id, purpose, usage_type, destination, started_at, ended_at, start_odometer_km, end_odometer_km, status, profile:profiles!company_vehicle_usage_logs_profile_id_fkey(full_name)').in('vehicle_id', vehicleIds).order('started_at', { ascending: false }).limit(120) : empty,
  vehicleIds.length ? service.from('company_vehicle_expenses').select('id, vehicle_id, expense_type, amount, expense_date, receipt_url, notes, status, submitter:profiles!company_vehicle_expenses_submitted_by_fkey(full_name)').in('vehicle_id', vehicleIds).order('expense_date', { ascending: false }).limit(200) : empty,
  vehicleIds.length ? service.from('company_vehicle_incidents').select('id, vehicle_id, incident_type, severity, incident_at, location, description, status, estimated_cost, actual_cost, reporter:profiles!company_vehicle_incidents_reported_by_fkey(full_name)').in('vehicle_id', vehicleIds).order('incident_at', { ascending: false }).limit(120) : empty,
  vehicleIds.length ? service.from('company_vehicle_documents').select('id, vehicle_id, document_type, document_name, document_url, issued_at, expires_at, status').in('vehicle_id', vehicleIds).neq('status', 'ARCHIVED').order('expires_at') : empty,
  vehicleIds.length ? service.from('fleet_maintenance_plans').select('id, vehicle_id, service_name, status, next_service_date, next_service_odometer_km').in('vehicle_id', vehicleIds).neq('status', 'CANCELLED').order('next_service_date') : empty,
  MANAGEMENT.has(profile.role) ? service.from('profiles').select('id, full_name, role').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').in('role', ['AREA_MANAGER', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER', 'ADMIN']).order('full_name') : empty,
 ]);

 const errors = [assignmentsResult, usageResult, expensesResult, incidentsResult, documentsResult, maintenanceResult, custodiansResult]
  .map((result) => result.error).filter(Boolean);
 if (errors.length) return NextResponse.json({ error: errors[0].message }, { status: 500 });

 const gpsVisible = GPS_ACCESS.has(profile.role) || vehicles.some((vehicle) => vehicle.company_custodian_profile_id === profile.id);
 const gps = gpsVisible && vehicles.length ? await getCartrackFleetGpsStatus(vehicles) : null;
 const gpsByVehicle = new Map((gps?.vehicles ?? []).map((item) => [item.vehicle_id, item]));
 const now = new Date();
 const dueCutoff = new Date(now.getTime() + 60 * 86400000);
 const monthKey = now.toISOString().slice(0, 7);

 const responseVehicles = vehicles.map((vehicle) => {
  const assignment = (assignmentsResult.data ?? []).find((row: any) => row.vehicle_id === vehicle.id);
  const usage = (usageResult.data ?? []).filter((row: any) => row.vehicle_id === vehicle.id).slice(0, 8);
  const expenses = (expensesResult.data ?? []).filter((row: any) => row.vehicle_id === vehicle.id);
  const incidents = (incidentsResult.data ?? []).filter((row: any) => row.vehicle_id === vehicle.id);
  const documents = (documentsResult.data ?? []).filter((row: any) => row.vehicle_id === vehicle.id);
  const gpsItem = gpsByVehicle.get(vehicle.id);
  const hasLiveGps = Boolean(gpsItem?.matched && gpsItem.latitude !== null && gpsItem.longitude !== null);
  const gpsActive = hasLiveGps && isRecentGpsEvent(gpsItem?.event_ts, now);
  const gpsOdometer = hasLiveGps ? plausibleOdometer(gpsItem?.odometer_km) : null;
  const maintenance = (maintenanceResult.data ?? []).filter((row: any) => row.vehicle_id === vehicle.id).map((row: any) => ({
   ...row,
   next_service_odometer_km: row.next_service_odometer_km === null ? null : Number(row.next_service_odometer_km),
   remaining_km: row.next_service_odometer_km === null || gpsOdometer === null ? null : Number(row.next_service_odometer_km) - gpsOdometer,
  }));
  const supplementaryExpiry = documents.filter((row: any) => ['REGISTRATION', 'OTHER'].includes(row.document_type)).map((row: any) => row.expires_at);
  const expiryValues = [vehicle.road_tax_expiry, vehicle.insurance_expiry, vehicle.inspection_expiry, vehicle.permit_expiry, ...supplementaryExpiry].filter(Boolean);
  const documentsDue = expiryValues.filter((value: string) => new Date(`${value}T23:59:59`) <= dueCutoff).length;
  return {
   ...vehicle,
   company_custodian_name: vehicle.company_custodian?.full_name ?? null,
   company_custodian: undefined,
   assignment_status: assignment?.status ?? null,
   assignment_id: assignment?.id ?? null,
   assignment_acknowledged_at: assignment?.acknowledged_at ?? null,
   active_usage: ['MANAGEMENT', 'MAINTENANCE', 'CUSTODIAN'].includes(mode) ? usage.find((row: any) => row.status === 'ACTIVE') ?? null : null,
   latest_usages: ['MANAGEMENT', 'MAINTENANCE', 'CUSTODIAN'].includes(mode) ? usage.map((row: any) => ({ ...row, profile_name: row.profile?.full_name ?? null, profile: undefined })) : [],
   expenses: ['MANAGEMENT', 'MAINTENANCE', 'FINANCE', 'CUSTODIAN'].includes(mode) ? expenses.slice(0, 12).map((row: any) => ({ ...row, amount: Number(row.amount), submitted_by_name: row.submitter?.full_name ?? null, submitter: undefined })) : [],
   incidents: incidents.slice(0, 12).map((row: any) => ({ ...row, estimated_cost: row.estimated_cost === null ? null : numberOrNull(Number(row.estimated_cost)), actual_cost: row.actual_cost === null ? null : numberOrNull(Number(row.actual_cost)), reported_by_name: row.reporter?.full_name ?? null, reporter: undefined })),
   documents,
   maintenance,
   monthly_cost: expenses.filter((row: any) => row.expense_date?.startsWith(monthKey) && row.status !== 'REJECTED').reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
   open_incidents: incidents.filter((row: any) => !['RESOLVED', 'CLOSED'].includes(row.status)).length,
   documents_due: documentsDue,
   gps: hasLiveGps && gpsItem ? { active: gpsActive, status: gpsItem.raw_status ?? (gpsItem.speed_kph && gpsItem.speed_kph >= 5 ? 'MOVING' : 'IDLE'), speed_kph: gpsItem.speed_kph, odometer_km: gpsOdometer, event_ts: gpsItem.event_ts, map_url: gpsItem.map_url } : null,
  };
 });

 return NextResponse.json({
  mode,
  current_profile_id: profile.id,
  can_manage: MANAGEMENT.has(profile.role),
  can_manage_compliance: COMPLIANCE.has(profile.role),
  can_review_expenses: EXPENSE_REVIEW.has(profile.role),
  gps_visible: gpsVisible,
  generated_at: now.toISOString(),
  kpis: {
   total: responseVehicles.length,
   in_use: responseVehicles.filter((vehicle) => vehicle.active_usage).length,
   documents_due: responseVehicles.reduce((sum, vehicle) => sum + vehicle.documents_due, 0),
   open_incidents: responseVehicles.reduce((sum, vehicle) => sum + vehicle.open_incidents, 0),
   monthly_cost: responseVehicles.reduce((sum, vehicle) => sum + vehicle.monthly_cost, 0),
   pending_expenses: (expensesResult.data ?? []).filter((row: any) => row.status === 'SUBMITTED').length,
   maintenance_due: (maintenanceResult.data ?? []).filter((row: any) => ['DUE', 'OVERDUE'].includes(row.status) || (row.next_service_date && new Date(`${row.next_service_date}T23:59:59`) <= dueCutoff)).length,
   tracked_gps: responseVehicles.filter((vehicle) => vehicle.gps?.active).length,
  },
  vehicles: responseVehicles,
  custodians: custodiansResult.data ?? [],
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const body = await request.json() as CompanyVehicleActionPayload;
 const service = createAdminClient() as any;
 if (!body.action) return NextResponse.json({ error: 'Tindakan diperlukan.' }, { status: 400 });

 let vehicle: any = null;
 if (body.vehicle_id) {
  const result = await service.from('vehicles').select('id, company_custodian_profile_id, status').eq('id', body.vehicle_id).eq('organization_id', profile.organization_id).maybeSingle();
  vehicle = result.data;
  if (!vehicle || vehicle.status !== 'ACTIVE') return NextResponse.json({ error: 'Kenderaan tidak dijumpai atau tidak aktif.' }, { status: 404 });
 }
 const isCustodian = vehicle?.company_custodian_profile_id === profile.id;
 const canUseVehicle = MANAGEMENT.has(profile.role) || isCustodian;
 const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
 let result: any;

 if (body.action === 'ASSIGN') {
  if (!MANAGEMENT.has(profile.role)) return fail('Hanya pengurusan boleh membuat serahan kenderaan.', 403);
  if (!vehicle || !body.custodian_profile_id) return fail('Kenderaan dan penjaga diperlukan.');
  const custodian = await service.from('profiles').select('id').eq('id', body.custodian_profile_id).eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').maybeSingle();
  if (!custodian.data) return fail('Penjaga tidak sah.');
  await service.from('company_vehicle_assignments').update({ status: 'RETURNED', returned_at: new Date().toISOString() }).eq('vehicle_id', vehicle.id).eq('status', 'ACTIVE');
  result = await service.from('company_vehicle_assignments').insert({ organization_id: profile.organization_id, vehicle_id: vehicle.id, custodian_profile_id: body.custodian_profile_id, assigned_by: profile.id, start_odometer_km: numberOrNull(body.odometer_km), condition_notes: clean(body.notes), status: 'ACTIVE' }).select('id').single();
  if (!result.error) await service.from('vehicles').update({ company_custodian_profile_id: body.custodian_profile_id, company_assigned_at: new Date().toISOString(), company_usage_note: clean(body.notes) ?? 'Kenderaan syarikat untuk kegunaan rasmi.', vehicle_category: 'MANAGER' }).eq('id', vehicle.id);
 } else if (body.action === 'UPDATE_CATEGORY') {
  if (!MANAGEMENT.has(profile.role) || !vehicle || !body.vehicle_category || !VEHICLE_CATEGORIES.has(body.vehicle_category)) return fail('Kategori kenderaan tidak sah.', 403);
  result = await service.from('vehicles').update({ vehicle_category: body.vehicle_category }).eq('id', vehicle.id).eq('organization_id', profile.organization_id).select('id').maybeSingle();
 } else if (body.action === 'ACKNOWLEDGE_HANDOVER') {
  if (!canUseVehicle || !vehicle) return fail('Tiada akses kepada serahan ini.', 403);
  result = await service.from('company_vehicle_assignments').update({ acknowledged_at: new Date().toISOString() }).eq('vehicle_id', vehicle.id).eq('status', 'ACTIVE').select('id').maybeSingle();
 } else if (body.action === 'START_USAGE') {
  if (!canUseVehicle || !vehicle) return fail('Hanya penjaga atau pengurusan boleh memulakan perjalanan.', 403);
  if (!clean(body.purpose)) return fail('Tujuan perjalanan diperlukan.');
  if (isCustodian && !MANAGEMENT.has(profile.role)) {
   const handover = await service.from('company_vehicle_assignments').select('acknowledged_at').eq('vehicle_id', vehicle.id).eq('custodian_profile_id', profile.id).eq('status', 'ACTIVE').maybeSingle();
   if (!handover.data?.acknowledged_at) return fail('Sahkan penerimaan kenderaan sebelum memulakan perjalanan.', 409);
  }
  result = await service.from('company_vehicle_usage_logs').insert({ organization_id: profile.organization_id, vehicle_id: vehicle.id, profile_id: profile.id, purpose: clean(body.purpose), usage_type: body.usage_type ?? 'COMPANY', destination: clean(body.destination), start_odometer_km: numberOrNull(body.odometer_km), notes: clean(body.notes), status: 'ACTIVE' }).select('id').single();
 } else if (body.action === 'END_USAGE') {
  if (!canUseVehicle || !vehicle) return fail('Tiada akses untuk menamatkan perjalanan.', 403);
  result = await service.from('company_vehicle_usage_logs').update({ ended_at: new Date().toISOString(), end_odometer_km: numberOrNull(body.odometer_km), notes: clean(body.notes), status: 'COMPLETED' }).eq('vehicle_id', vehicle.id).eq('status', 'ACTIVE').select('id').maybeSingle();
 } else if (body.action === 'ADD_EXPENSE') {
  if (!canUseVehicle || !vehicle) return fail('Tiada akses untuk merekod belanja.', 403);
  if (!body.expense_type || !body.amount || body.amount <= 0) return fail('Jenis dan jumlah belanja yang sah diperlukan.');
  if (clean(body.receipt_url) && !safeUrl(body.receipt_url)) return fail('Pautan resit mesti menggunakan http atau https.');
  result = await service.from('company_vehicle_expenses').insert({ organization_id: profile.organization_id, vehicle_id: vehicle.id, usage_log_id: body.usage_log_id ?? null, submitted_by: profile.id, expense_type: body.expense_type, amount: body.amount, expense_date: body.expense_date ?? new Date().toISOString().slice(0, 10), fuel_litres: numberOrNull(body.fuel_litres), odometer_km: numberOrNull(body.odometer_km), receipt_url: safeUrl(body.receipt_url), notes: clean(body.notes), status: 'SUBMITTED' }).select('id').single();
 } else if (body.action === 'SAVE_DOCUMENT') {
  if (!COMPLIANCE.has(profile.role) || !vehicle) return fail('Tiada akses untuk mengurus dokumen.', 403);
  if (!body.document_type || !clean(body.document_name)) return fail('Jenis dan nama dokumen diperlukan.');
  if (clean(body.document_url) && !safeUrl(body.document_url)) return fail('Pautan dokumen mesti menggunakan http atau https.');
  result = await service.from('company_vehicle_documents').insert({ organization_id: profile.organization_id, vehicle_id: vehicle.id, document_type: body.document_type, document_name: clean(body.document_name), document_url: safeUrl(body.document_url), issued_at: body.issued_at || null, expires_at: body.expires_at || null, uploaded_by: profile.id, status: 'ACTIVE' }).select('id').single();
  if (!result.error && body.expires_at) {
   const fieldByType: Record<string, string> = { ROAD_TAX: 'road_tax_expiry', INSURANCE: 'insurance_expiry', INSPECTION: 'inspection_expiry', PERMIT: 'permit_expiry' };
   const field = fieldByType[body.document_type];
   if (field) await service.from('vehicles').update({ [field]: body.expires_at }).eq('id', vehicle.id);
  }
 } else if (body.action === 'REPORT_INCIDENT') {
  if (!canUseVehicle || !vehicle) return fail('Tiada akses untuk melaporkan insiden.', 403);
  if (!body.incident_type || !clean(body.description)) return fail('Jenis dan penerangan insiden diperlukan.');
  result = await service.from('company_vehicle_incidents').insert({ organization_id: profile.organization_id, vehicle_id: vehicle.id, reported_by: profile.id, incident_type: body.incident_type, severity: body.severity ?? 'MEDIUM', incident_at: body.incident_at ?? new Date().toISOString(), location: clean(body.location), description: clean(body.description), estimated_cost: numberOrNull(body.estimated_cost), status: 'OPEN' }).select('id').single();
 } else if (body.action === 'REVIEW_EXPENSE') {
  if (!EXPENSE_REVIEW.has(profile.role) || !body.expense_id || !body.status || !EXPENSE_STATUSES.has(body.status)) return fail('Semakan belanja tidak sah.', 403);
  result = await service.from('company_vehicle_expenses').update({ status: body.status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq('id', body.expense_id).eq('organization_id', profile.organization_id).select('id').maybeSingle();
 } else if (body.action === 'UPDATE_INCIDENT') {
  if (!COMPLIANCE.has(profile.role) || !body.incident_id || !body.status || !INCIDENT_STATUSES.has(body.status)) return fail('Kemas kini insiden tidak sah.', 403);
  const resolved = ['RESOLVED', 'CLOSED'].includes(body.status);
  result = await service.from('company_vehicle_incidents').update({ status: body.status, actual_cost: numberOrNull(body.actual_cost), resolved_by: resolved ? profile.id : null, resolved_at: resolved ? new Date().toISOString() : null }).eq('id', body.incident_id).eq('organization_id', profile.organization_id).select('id').maybeSingle();
 } else {
  return fail('Tindakan tidak disokong.');
 }

 if (result?.error) {
  const message = result.error.code === '23505' ? 'Kenderaan masih mempunyai rekod aktif.' : result.error.message;
  return fail(message);
 }
 return NextResponse.json({ ok: true, id: result?.data?.id ?? null });
}
