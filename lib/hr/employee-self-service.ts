import type { SupabaseClient } from '@supabase/supabase-js';
import { computeProfileCompletion } from '@/lib/profile/completion';
import type {
 Branch,
 Database,
 HrLeaveBalance,
 HrLeaveType,
 HrServiceRequest,
 HrServiceRequestPriority,
 HrServiceRequestStatus,
 HrServiceRequestType,
 LegalEntity,
 ProfileWithBranch,
 Region,
 Staff,
} from '@/types/database';
import { remainingLeaveDays } from '@/lib/hr/leave-balances';

type StaffRow = Staff & {
 legal_entity_id: string | null;
 branch_id: string | null;
 region_id: string | null;
};

export type EmployeeHrStaffRecord = {
 staff_id: string;
 staff_code: string;
 full_name: string;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 status: string;
 legal_entity_id: string | null;
 legal_entity_code: string | null;
 legal_entity_name: string | null;
 legal_entity_scope: string | null;
 branch_id: string | null;
 branch_code: string | null;
 branch_name: string | null;
 region_id: string | null;
 region_name: string | null;
 monthly_amount: number | null;
 weekly_amount: number | null;
 bank_name: string | null;
 account_holder: string | null;
 account_number_masked: string | null;
 on_hold: boolean;
};

export type EmployeeHrAttendanceRow = {
 id: string;
 staff_id: string;
 attendance_date: string;
 branch_id: string | null;
 branch_code: string | null;
 branch_name: string | null;
 clock_in: string | null;
 clock_out: string | null;
 hours_worked: number | null;
 ot_hours: number | null;
 notes: string | null;
};

export type EmployeeHrServiceRequest = Pick<
 HrServiceRequest,
 | 'id'
 | 'request_number'
 | 'request_type'
 | 'title'
 | 'description'
 | 'start_date'
 | 'end_date'
 | 'priority'
 | 'status'
 | 'reviewer_note'
 | 'created_at'
 | 'updated_at'
> & {
 legal_entity_code: string | null;
 legal_entity_name: string | null;
 branch_code: string | null;
 branch_name: string | null;
};

export type EmployeeHrLeaveBalance = Pick<
 HrLeaveBalance,
 | 'id'
 | 'staff_id'
 | 'profile_id'
 | 'leave_year'
 | 'leave_type'
 | 'entitlement_days'
 | 'carried_forward_days'
 | 'used_days'
 | 'pending_days'
 | 'adjustment_days'
 | 'remaining_days'
 | 'notes'
 | 'updated_at'
> & {
 staff_code: string | null;
 staff_name: string | null;
 legal_entity_code: string | null;
 legal_entity_name: string | null;
 branch_code: string | null;
 branch_name: string | null;
 remaining: number;
};

export type EmployeeHrSelfServiceDashboard = {
 profile: {
 id: string;
 full_name: string;
 email: string | null;
 phone: string | null;
 role: string;
 employee_code: string | null;
 profile_completed_at: string | null;
 completion_percent: number;
 missing_fields: string[];
 };
 is_local_employee: boolean;
 staff_records: EmployeeHrStaffRecord[];
 primary_staff: EmployeeHrStaffRecord | null;
 service_requests: EmployeeHrServiceRequest[];
 leave_balances: EmployeeHrLeaveBalance[];
 attendance: EmployeeHrAttendanceRow[];
 summary: {
 active_employers: number;
 pending_requests: number;
 completed_requests: number;
 attendance_records: number;
 };
};

export type CreateEmployeeHrServiceRequestPayload = {
 request_type: HrServiceRequestType;
 title?: string;
 description: string;
 start_date?: string | null;
 end_date?: string | null;
 priority?: HrServiceRequestPriority;
 leave_type?: HrLeaveType;
};

const REQUEST_TYPE_TITLES: Record<HrServiceRequestType, string> = {
 LEAVE: 'Permohonan cuti / pelepasan kerja',
 PROFILE_UPDATE: 'Kemaskini maklumat profil HR',
 DOCUMENT: 'Permohonan dokumen HR',
 PAYROLL: 'Semakan gaji, elaun atau slip gaji',
 TRANSFER: 'Permohonan pertukaran tempat kerja',
 ATTENDANCE: 'Semakan kehadiran / waktu kerja',
 UNIFORM_EQUIPMENT: 'Permohonan uniform atau peralatan kerja',
 OVERTIME: 'Permohonan kerja lebih masa / OT',
 CLAIM: 'Tuntutan bayaran / claim pekerja',
 TRAINING: 'Permohonan latihan atau kursus',
 RESIGNATION: 'Notis berhenti kerja / tamat perkhidmatan',
 DISCIPLINE: 'Semakan disiplin atau kaunseling',
 ASSET: 'Aset kerja / peralatan syarikat',
 LOAN_ADVANCE: 'Pinjaman atau advance gaji',
 HR_HELP: 'Bantuan HR',
};

function maskAccountNumber(num: string | null | undefined): string | null {
 if (!num?.trim()) return null;
 const clean = num.replace(/\s/g, '');
 if (clean.length <= 4) return '****';
 return `****${clean.slice(-4)}`;
}

function numberValue(value: unknown): number | null {
 if (value == null) return null;
 const n = Number(value);
 return Number.isFinite(n) ? n : null;
}

function buildMaps<T extends { id: string }>(rows: T[]) {
 return new Map(rows.map((row) => [row.id, row]));
}

function mapServiceRequest(
 request: HrServiceRequest,
 legalMap: Map<string, LegalEntity>,
 branchMap: Map<string, Branch>,
): EmployeeHrServiceRequest {
 const legal = request.legal_entity_id ? legalMap.get(request.legal_entity_id) : null;
 const branch = request.branch_id ? branchMap.get(request.branch_id) : null;
 return {
 id: request.id,
 request_number: request.request_number,
 request_type: request.request_type,
 title: request.title,
 description: request.description,
 start_date: request.start_date,
 end_date: request.end_date,
 priority: request.priority,
 status: request.status,
 reviewer_note: request.reviewer_note,
 created_at: request.created_at,
 updated_at: request.updated_at,
 legal_entity_code: legal?.code ?? null,
 legal_entity_name: legal?.legal_name ?? legal?.name ?? null,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 };
}

export async function getEmployeeHrSelfServiceDashboard(
 supabase: SupabaseClient<Database>,
 profile: ProfileWithBranch,
): Promise<EmployeeHrSelfServiceDashboard> {
 const { data: staffData, error: staffError } = await supabase
 .from('staff')
 .select(
 'id, organization_id, staff_code, full_name, legal_entity_id, branch_id, region_id, worker_type, bank_name, account_number, account_holder, weekly_amount, monthly_amount, shift_hours, shifts_per_week, profile_id, status, on_hold, remarks, created_at, updated_at',
 )
 .eq('organization_id', profile.organization_id)
 .eq('profile_id', profile.id)
 .order('staff_code');

 if (staffError) throw new Error(staffError.message);

 const staffRows = (staffData ?? []) as StaffRow[];
 const legalIds = [...new Set(staffRows.map((row) => row.legal_entity_id).filter(Boolean) as string[])];
 const branchIds = [...new Set(staffRows.map((row) => row.branch_id).filter(Boolean) as string[])];
 const regionIds = [...new Set(staffRows.map((row) => row.region_id).filter(Boolean) as string[])];
 const staffIds = staffRows.map((row) => row.id);

 const [
 { data: legalRows },
 { data: branchRows },
 { data: regionRows },
 { data: requestRows },
 { data: leaveRows },
 { data: attendanceRows },
 ] = await Promise.all([
 legalIds.length
 ? supabase.from('legal_entities').select('*').in('id', legalIds)
 : Promise.resolve({ data: [] as LegalEntity[] }),
 branchIds.length
 ? supabase.from('branches').select('*').in('id', branchIds)
 : Promise.resolve({ data: [] as Branch[] }),
 regionIds.length
 ? supabase.from('regions').select('*').in('id', regionIds)
 : Promise.resolve({ data: [] as Region[] }),
 supabase
 .from('hr_service_requests')
 .select('*')
 .eq('organization_id', profile.organization_id)
 .eq('profile_id', profile.id)
 .order('created_at', { ascending: false })
 .limit(20),
 staffIds.length
 ? supabase
 .from('hr_leave_balances')
 .select('*')
 .eq('organization_id', profile.organization_id)
 .in('staff_id', staffIds)
 .order('leave_year', { ascending: false })
 .order('leave_type')
 : Promise.resolve({ data: [] as HrLeaveBalance[] }),
 staffIds.length
 ? supabase
 .from('attendance_records')
 .select('id, staff_id, attendance_date, branch_id, clock_in, clock_out, hours_worked, ot_hours, notes')
 .eq('organization_id', profile.organization_id)
 .in('staff_id', staffIds)
 .order('attendance_date', { ascending: false })
 .limit(12)
 : Promise.resolve({ data: [] as unknown[] }),
 ]);

 const legalMap = buildMaps((legalRows ?? []) as LegalEntity[]);
 const branchMap = buildMaps((branchRows ?? []) as Branch[]);
 const regionMap = buildMaps((regionRows ?? []) as Region[]);

 const staffRecords: EmployeeHrStaffRecord[] = staffRows.map((staff) => {
 const legal = staff.legal_entity_id ? legalMap.get(staff.legal_entity_id) : null;
 const branch = staff.branch_id ? branchMap.get(staff.branch_id) : null;
 const region = staff.region_id ? regionMap.get(staff.region_id) : null;
 return {
 staff_id: staff.id,
 staff_code: staff.staff_code,
 full_name: staff.full_name,
 worker_type: staff.worker_type,
 status: staff.status,
 legal_entity_id: staff.legal_entity_id,
 legal_entity_code: legal?.code ?? null,
 legal_entity_name: legal?.legal_name ?? legal?.name ?? null,
 legal_entity_scope: legal?.scope ?? null,
 branch_id: staff.branch_id,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 region_id: staff.region_id,
 region_name: region?.name ?? null,
 monthly_amount: numberValue(staff.monthly_amount),
 weekly_amount: numberValue(staff.weekly_amount),
 bank_name: staff.bank_name,
 account_holder: staff.account_holder,
 account_number_masked: maskAccountNumber(staff.account_number),
 on_hold: Boolean(staff.on_hold),
 };
 });

 const requestLegalIds = [
 ...new Set(((requestRows ?? []) as HrServiceRequest[]).map((row) => row.legal_entity_id).filter(Boolean) as string[]),
 ].filter((id) => !legalMap.has(id));
 const requestBranchIds = [
 ...new Set(((requestRows ?? []) as HrServiceRequest[]).map((row) => row.branch_id).filter(Boolean) as string[]),
 ].filter((id) => !branchMap.has(id));

 if (requestLegalIds.length) {
 const { data } = await supabase.from('legal_entities').select('*').in('id', requestLegalIds);
 for (const row of (data ?? []) as LegalEntity[]) legalMap.set(row.id, row);
 }
 if (requestBranchIds.length) {
 const { data } = await supabase.from('branches').select('*').in('id', requestBranchIds);
 for (const row of (data ?? []) as Branch[]) branchMap.set(row.id, row);
 }

 const serviceRequests = ((requestRows ?? []) as HrServiceRequest[]).map((request) =>
 mapServiceRequest(request, legalMap, branchMap));

 const staffById = new Map(staffRecords.map((staff) => [staff.staff_id, staff]));
 const leaveBalances = ((leaveRows ?? []) as HrLeaveBalance[]).map((balance) => {
 const staff = staffById.get(balance.staff_id);
 return {
 id: balance.id,
 staff_id: balance.staff_id,
 profile_id: balance.profile_id,
 leave_year: balance.leave_year,
 leave_type: balance.leave_type,
 entitlement_days: numberValue(balance.entitlement_days) ?? 0,
 carried_forward_days: numberValue(balance.carried_forward_days) ?? 0,
 used_days: numberValue(balance.used_days) ?? 0,
 pending_days: numberValue(balance.pending_days) ?? 0,
 adjustment_days: numberValue(balance.adjustment_days) ?? 0,
 remaining_days: numberValue(balance.remaining_days) ?? remainingLeaveDays(balance),
 notes: balance.notes,
 updated_at: balance.updated_at,
 staff_code: staff?.staff_code ?? null,
 staff_name: staff?.full_name ?? null,
 legal_entity_code: staff?.legal_entity_code ?? null,
 legal_entity_name: staff?.legal_entity_name ?? null,
 branch_code: staff?.branch_code ?? null,
 branch_name: staff?.branch_name ?? null,
 remaining: numberValue(balance.remaining_days) ?? remainingLeaveDays(balance),
 };
 });

 const attendance = (attendanceRows ?? []).map((row) => {
 const record = row as {
 id: string;
 staff_id: string;
 attendance_date: string;
 branch_id: string | null;
 clock_in: string | null;
 clock_out: string | null;
 hours_worked: number | null;
 ot_hours: number | null;
 notes: string | null;
 };
 const branch = record.branch_id ? branchMap.get(record.branch_id) : null;
 return {
 id: record.id,
 staff_id: record.staff_id,
 attendance_date: record.attendance_date,
 branch_id: record.branch_id,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 clock_in: record.clock_in,
 clock_out: record.clock_out,
 hours_worked: numberValue(record.hours_worked),
 ot_hours: numberValue(record.ot_hours),
 notes: record.notes,
 };
 });

 const completion = computeProfileCompletion(profile);
 const primaryStaff =
 staffRecords.find((staff) => staff.status === 'ACTIVE' && staff.worker_type === 'LOCAL') ??
 staffRecords.find((staff) => staff.status === 'ACTIVE') ??
 staffRecords[0] ??
 null;
 const isLocalEmployee = staffRecords.some((staff) => staff.worker_type === 'LOCAL');

 return {
 profile: {
 id: profile.id,
 full_name: profile.full_name,
 email: profile.email,
 phone: profile.phone,
 role: profile.role,
 employee_code: profile.employee_code,
 profile_completed_at: profile.profile_completed_at,
 completion_percent: completion.percent,
 missing_fields: completion.missingRequired,
 },
 is_local_employee: isLocalEmployee,
 staff_records: staffRecords,
 primary_staff: primaryStaff,
 service_requests: serviceRequests,
 leave_balances: leaveBalances,
 attendance,
 summary: {
 active_employers: staffRecords.filter((staff) => staff.status === 'ACTIVE').length,
 pending_requests: serviceRequests.filter((request) =>
 ['SUBMITTED', 'IN_REVIEW'].includes(request.status)).length,
 completed_requests: serviceRequests.filter((request) =>
 ['APPROVED', 'COMPLETED'].includes(request.status)).length,
 attendance_records: attendance.length,
 },
 };
}

export function requestTypeTitle(type: HrServiceRequestType) {
 return REQUEST_TYPE_TITLES[type] ?? 'Permohonan HR';
}

export function normalizeHrServiceRequestStatus(status: string): HrServiceRequestStatus {
 if (['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(status)) {
 return status as HrServiceRequestStatus;
 }
 return 'SUBMITTED';
}
