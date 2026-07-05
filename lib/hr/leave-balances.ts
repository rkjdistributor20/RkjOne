import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, HrLeaveBalance, HrLeaveType, HrServiceRequest, Json, Staff } from '@/types/database';

export const HR_LEAVE_TYPES: HrLeaveType[] = ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'REPLACEMENT'];

export const DEFAULT_LEAVE_ENTITLEMENT: Record<HrLeaveType, number> = {
 ANNUAL: 8,
 SICK: 14,
 EMERGENCY: 2,
 UNPAID: 0,
 REPLACEMENT: 0,
};

export const LEAVE_TYPE_LABEL_MS: Record<HrLeaveType, string> = {
 ANNUAL: 'Cuti Tahunan',
 SICK: 'Cuti Sakit',
 EMERGENCY: 'Cuti Kecemasan',
 UNPAID: 'Cuti Tanpa Gaji',
 REPLACEMENT: 'Cuti Ganti',
};

export const LEAVE_TYPE_LABEL_EN: Record<HrLeaveType, string> = {
 ANNUAL: 'Annual Leave',
 SICK: 'Sick Leave',
 EMERGENCY: 'Emergency Leave',
 UNPAID: 'Unpaid Leave',
 REPLACEMENT: 'Replacement Leave',
};

type DbClient = SupabaseClient<Database>;

function numberValue(value: unknown, fallback = 0) {
 const next = Number(value);
 return Number.isFinite(next) ? next : fallback;
}

function metadataRecord(metadata: Json | null | undefined): Record<string, unknown> {
 if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
 return metadata as Record<string, unknown>;
}

function parseDateOnly(value: string | null | undefined): Date | null {
 if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const [year, month, day] = value.split('-').map(Number);
 return new Date(Date.UTC(year, month - 1, day));
}

export function normalizeLeaveType(value: unknown): HrLeaveType {
 const type = String(value ?? 'ANNUAL').toUpperCase() as HrLeaveType;
 return HR_LEAVE_TYPES.includes(type) ? type : 'ANNUAL';
}

export function formatLeaveType(type: HrLeaveType, lang: 'ms' | 'en' = 'ms') {
 return lang === 'en' ? LEAVE_TYPE_LABEL_EN[type] : LEAVE_TYPE_LABEL_MS[type];
}

export function calculateLeaveDays(startDate: string | null | undefined, endDate: string | null | undefined) {
 const start = parseDateOnly(startDate);
 if (!start) return 1;
 const end = parseDateOnly(endDate) ?? start;
 const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
 return Math.max(1, days);
}

export function leaveYearFromDates(startDate: string | null | undefined, endDate?: string | null) {
 const source = parseDateOnly(startDate) ?? parseDateOnly(endDate ?? null) ?? new Date();
 return source.getUTCFullYear();
}

export function remainingLeaveDays(balance: Pick<
 HrLeaveBalance,
 'entitlement_days' | 'carried_forward_days' | 'adjustment_days' | 'used_days' | 'pending_days'
>) {
 return (
 numberValue(balance.entitlement_days) +
 numberValue(balance.carried_forward_days) +
 numberValue(balance.adjustment_days) -
 numberValue(balance.used_days) -
 numberValue(balance.pending_days)
 );
}

export function leaveRequestMeta(request: HrServiceRequest) {
 const metadata = metadataRecord(request.metadata);
 const leaveType = normalizeLeaveType(metadata.leave_type);
 const rawDays = numberValue(metadata.leave_days, 0);
 const days = rawDays > 0 ? rawDays : calculateLeaveDays(request.start_date, request.end_date);
 const leaveYear = numberValue(metadata.leave_year, leaveYearFromDates(request.start_date, request.end_date));
 return { leaveType, days, leaveYear };
}

async function fetchStaff(service: DbClient, organizationId: string, staffId: string): Promise<Staff | null> {
 const { data, error } = await service
 .from('staff')
 .select('*')
 .eq('organization_id', organizationId)
 .eq('id', staffId)
 .maybeSingle();
 if (error) throw error;
 return (data as Staff | null) ?? null;
}

export async function ensureLeaveBalance(
 service: DbClient,
 params: {
 organizationId: string;
 staffId: string;
 leaveYear: number;
 leaveType: HrLeaveType;
 updatedBy?: string | null;
 },
): Promise<HrLeaveBalance> {
 const { data: existing, error: existingError } = await service
 .from('hr_leave_balances')
 .select('*')
 .eq('organization_id', params.organizationId)
 .eq('staff_id', params.staffId)
 .eq('leave_year', params.leaveYear)
 .eq('leave_type', params.leaveType)
 .maybeSingle();
 if (existingError) throw existingError;
 if (existing) return existing as HrLeaveBalance;

 const staff = await fetchStaff(service, params.organizationId, params.staffId);
 if (!staff) throw new Error('Rekod staf untuk baki cuti tidak ditemui.');

 const { data, error } = await service
 .from('hr_leave_balances')
 .insert({
 organization_id: params.organizationId,
 legal_entity_id: staff.legal_entity_id,
 staff_id: staff.id,
 profile_id: staff.profile_id,
 leave_year: params.leaveYear,
 leave_type: params.leaveType,
 entitlement_days: DEFAULT_LEAVE_ENTITLEMENT[params.leaveType],
 updated_by: params.updatedBy ?? null,
 notes: 'Auto-created by HRMIS leave workflow.',
 } as never)
 .select('*')
 .single();
 if (error) throw error;
 return data as HrLeaveBalance;
}

async function hasTransaction(
 service: DbClient,
 requestId: string,
 transactionType: 'PENDING' | 'APPROVED_USAGE' | 'REJECT_RELEASE' | 'CANCEL_RELEASE',
) {
 const { data, error } = await service
 .from('hr_leave_transactions')
 .select('id')
 .eq('hr_service_request_id', requestId)
 .eq('transaction_type', transactionType)
 .limit(1);
 if (error) throw error;
 return (data ?? []).length > 0;
}

async function updateBalanceAndLog(
 service: DbClient,
 balance: HrLeaveBalance,
 request: HrServiceRequest,
 params: {
 usedDelta?: number;
 pendingDelta?: number;
 transactionType: 'PENDING' | 'APPROVED_USAGE' | 'REJECT_RELEASE' | 'CANCEL_RELEASE';
 days: number;
 note: string;
 actorId?: string | null;
 },
) {
 const usedDays = Math.max(0, numberValue(balance.used_days) + numberValue(params.usedDelta));
 const pendingDays = Math.max(0, numberValue(balance.pending_days) + numberValue(params.pendingDelta));
 const nextRemaining =
 numberValue(balance.entitlement_days) +
 numberValue(balance.carried_forward_days) +
 numberValue(balance.adjustment_days) -
 usedDays -
 pendingDays;

 const { data: updated, error: updateError } = await service
 .from('hr_leave_balances')
 .update({
 used_days: usedDays,
 pending_days: pendingDays,
 updated_by: params.actorId ?? null,
 updated_at: new Date().toISOString(),
 } as never)
 .eq('id', balance.id)
 .select('*')
 .single();
 if (updateError) throw updateError;

 const { error: logError } = await service.from('hr_leave_transactions').insert({
 organization_id: request.organization_id,
 leave_balance_id: balance.id,
 staff_id: request.staff_id ?? balance.staff_id,
 profile_id: request.profile_id,
 hr_service_request_id: request.id,
 leave_type: balance.leave_type,
 transaction_type: params.transactionType,
 days: params.days,
 balance_after_days: nextRemaining,
 note: params.note,
 created_by: params.actorId ?? null,
 } as never);
 if (logError) throw logError;
 return updated as HrLeaveBalance;
}

export async function registerLeaveRequestPending(
 service: DbClient,
 request: HrServiceRequest,
 actorId?: string | null,
) {
 if (request.request_type !== 'LEAVE' || !request.staff_id) return null;
 if (await hasTransaction(service, request.id, 'PENDING')) return null;
 const meta = leaveRequestMeta(request);
 const balance = await ensureLeaveBalance(service, {
 organizationId: request.organization_id,
 staffId: request.staff_id,
 leaveYear: meta.leaveYear,
 leaveType: meta.leaveType,
 updatedBy: actorId ?? request.profile_id,
 });
 return updateBalanceAndLog(service, balance, request, {
 pendingDelta: meta.days,
 transactionType: 'PENDING',
 days: meta.days,
 note: 'Leave request submitted and held as pending HR balance.',
 actorId: actorId ?? request.profile_id,
 });
}

export async function approveLeaveRequestUsage(
 service: DbClient,
 request: HrServiceRequest,
 actorId?: string | null,
) {
 if (request.request_type !== 'LEAVE' || !request.staff_id) return null;
 if (await hasTransaction(service, request.id, 'APPROVED_USAGE')) return null;
 const meta = leaveRequestMeta(request);
 const balance = await ensureLeaveBalance(service, {
 organizationId: request.organization_id,
 staffId: request.staff_id,
 leaveYear: meta.leaveYear,
 leaveType: meta.leaveType,
 updatedBy: actorId ?? null,
 });
 return updateBalanceAndLog(service, balance, request, {
 usedDelta: meta.days,
 pendingDelta: -meta.days,
 transactionType: 'APPROVED_USAGE',
 days: meta.days,
 note: 'Leave approved by HR and deducted from official balance.',
 actorId,
 });
}

export async function releaseLeaveRequestPending(
 service: DbClient,
 request: HrServiceRequest,
 status: 'REJECTED' | 'CANCELLED',
 actorId?: string | null,
) {
 if (request.request_type !== 'LEAVE' || !request.staff_id) return null;
 const transactionType = status === 'REJECTED' ? 'REJECT_RELEASE' : 'CANCEL_RELEASE';
 if (await hasTransaction(service, request.id, transactionType)) return null;
 const meta = leaveRequestMeta(request);
 const balance = await ensureLeaveBalance(service, {
 organizationId: request.organization_id,
 staffId: request.staff_id,
 leaveYear: meta.leaveYear,
 leaveType: meta.leaveType,
 updatedBy: actorId ?? null,
 });
 return updateBalanceAndLog(service, balance, request, {
 pendingDelta: -meta.days,
 transactionType,
 days: meta.days,
 note: status === 'REJECTED' ? 'Leave request rejected and pending days released.' : 'Leave request cancelled and pending days released.',
 actorId,
 });
}
