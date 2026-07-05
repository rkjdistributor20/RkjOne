import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
 normalizeHrServiceRequestStatus,
 requestTypeTitle,
 type CreateEmployeeHrServiceRequestPayload,
} from '@/lib/hr/employee-self-service';
import {
 calculateLeaveDays,
 leaveYearFromDates,
 normalizeLeaveType,
 registerLeaveRequestPending,
} from '@/lib/hr/leave-balances';
import type {
 HrLeaveType,
 HrServiceRequest,
 HrServiceRequestPriority,
 HrServiceRequestType,
 Staff,
} from '@/types/database';

const ALLOWED_TYPES: HrServiceRequestType[] = [
 'LEAVE',
 'PROFILE_UPDATE',
 'DOCUMENT',
 'PAYROLL',
 'TRANSFER',
 'ATTENDANCE',
 'UNIFORM_EQUIPMENT',
 'OVERTIME',
 'CLAIM',
 'TRAINING',
 'RESIGNATION',
 'DISCIPLINE',
 'ASSET',
 'LOAN_ADVANCE',
 'HR_HELP',
];

const ALLOWED_PRIORITIES: HrServiceRequestPriority[] = ['LOW', 'NORMAL', 'HIGH'];
const ALLOWED_LEAVE_TYPES: HrLeaveType[] = ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'REPLACEMENT'];

function cleanDate(value: unknown) {
 if (typeof value !== 'string') return null;
 const trimmed = value.trim();
 if (!trimmed) return null;
 return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parsePayload(body: unknown): CreateEmployeeHrServiceRequestPayload {
 const raw = (body ?? {}) as Record<string, unknown>;
 const requestType = String(raw.request_type ?? 'HR_HELP').toUpperCase() as HrServiceRequestType;
 const priority = String(raw.priority ?? 'NORMAL').toUpperCase() as HrServiceRequestPriority;
 const description = String(raw.description ?? '').trim();
 const title = typeof raw.title === 'string' ? raw.title.trim() : '';
 const leaveType = normalizeLeaveType(raw.leave_type);

 if (!ALLOWED_TYPES.includes(requestType)) {
 throw new Error('Jenis permohonan HR tidak sah.');
 }
 if (!ALLOWED_PRIORITIES.includes(priority)) {
 throw new Error('Keutamaan permohonan tidak sah.');
 }
 if (description.length < 8) {
 throw new Error('Sila isi penerangan permohonan dengan jelas.');
 }
 const startDate = cleanDate(raw.start_date);
 const endDate = cleanDate(raw.end_date);
 if (requestType === 'LEAVE' && !startDate) {
 throw new Error('Sila pilih tarikh mula cuti.');
 }
 if (startDate && endDate && endDate < startDate) {
 throw new Error('Tarikh tamat tidak boleh lebih awal daripada tarikh mula.');
 }

 return {
 request_type: requestType,
 priority,
 title,
 description,
 start_date: startDate,
 end_date: endDate,
 leave_type: ALLOWED_LEAVE_TYPES.includes(leaveType) ? leaveType : 'ANNUAL',
 };
}

function newRequestNumber() {
 const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
 return `HR-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function serializeRequest(row: HrServiceRequest) {
 return {
 ...row,
 legal_entity_code: null,
 legal_entity_name: null,
 branch_code: null,
 branch_name: null,
 };
}

export async function GET() {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const service = await createServiceClient();
 const { data, error } = await service
 .from('hr_service_requests')
 .select('*')
 .eq('organization_id', profile.organization_id)
 .eq('profile_id', profile.id)
 .order('created_at', { ascending: false })
 .limit(20);

 if (error) throw error;
 return NextResponse.json({ requests: ((data ?? []) as HrServiceRequest[]).map(serializeRequest) });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal memuatkan permohonan HR.' },
 { status: 500 },
 );
 }
}

export async function POST(request: Request) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const payload = parsePayload(await request.json().catch(() => ({})));
 const service = await createServiceClient();

 const { data: staffRows, error: staffError } = await service
 .from('staff')
 .select('*')
 .eq('organization_id', profile.organization_id)
 .eq('profile_id', profile.id)
 .eq('status', 'ACTIVE')
 .order('staff_code');

 if (staffError) throw staffError;

 const rows = (staffRows ?? []) as Staff[];
 const localStaff = rows.find((row) => row.worker_type === 'LOCAL');
 const primaryStaff = localStaff ?? rows[0] ?? null;

 if (rows.length > 0 && !localStaff) {
 return NextResponse.json(
 {
 error:
 'HRMIS kendiri ini dikhaskan untuk pekerja tempatan. Pekerja asing boleh diurus oleh HR melalui dashboard HR syarikat.',
 },
 { status: 403 },
 );
 }

 const insert = {
 organization_id: profile.organization_id,
 legal_entity_id: primaryStaff?.legal_entity_id ?? profile.legal_entity_id ?? null,
 branch_id: primaryStaff?.branch_id ?? profile.branch_id ?? null,
 profile_id: profile.id,
 staff_id: primaryStaff?.id ?? null,
 request_number: newRequestNumber(),
 request_type: payload.request_type,
 title: payload.title?.trim() || requestTypeTitle(payload.request_type),
 description: payload.description,
 start_date: payload.start_date ?? null,
 end_date: payload.end_date ?? null,
 priority: payload.priority ?? 'NORMAL',
 status: normalizeHrServiceRequestStatus('SUBMITTED'),
 metadata: {
 source: 'employee_hrmis',
 submitted_role: profile.role,
 submitted_email: profile.email,
 ...(payload.request_type === 'LEAVE'
 ? {
 leave_type: payload.leave_type ?? 'ANNUAL',
 leave_days: calculateLeaveDays(payload.start_date ?? null, payload.end_date ?? null),
 leave_year: leaveYearFromDates(payload.start_date ?? null, payload.end_date ?? null),
 }
 : {}),
 },
 };

 const { data, error } = await service
 .from('hr_service_requests')
 .insert(insert as never)
 .select('*')
 .single();

 if (error) throw error;
 if (payload.request_type === 'LEAVE') {
 await registerLeaveRequestPending(service, data as HrServiceRequest, profile.id);
 }

 return NextResponse.json({ request: serializeRequest(data as HrServiceRequest) });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal menghantar permohonan HR.' },
 { status: 400 },
 );
 }
}
