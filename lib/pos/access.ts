import type { UserRole } from '@/types/enums';
import type { Profile } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';

const FULL_POS_HISTORY_ROLES: UserRole[] = [
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'AREA_MANAGER',
];

const POS_BRANCH_ALL_ACCESS_ROLES = new Set<UserRole>([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
]);

const POS_SHIFT_STAFF_APPROVER_ROLES = new Set<UserRole>([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'AREA_MANAGER',
]);

const POS_TRANSACTION_VOID_ROLES = new Set<UserRole>([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'AREA_MANAGER',
]);

const POS_TRANSACTION_REFUND_ROLES = new Set<UserRole>([
 'SUPER_ADMIN',
 'ADMIN',
 'FINANCE',
]);

export function canViewFullPosHistory(role?: string | null): boolean {
 return FULL_POS_HISTORY_ROLES.includes(role as UserRole);
}

export function canApprovePosShiftStaff(role?: string | null): boolean {
 return POS_SHIFT_STAFF_APPROVER_ROLES.has(role as UserRole);
}

export function requiresActivePosShiftMember(role?: string | null): boolean {
 return Boolean(role) && !POS_BRANCH_ALL_ACCESS_ROLES.has(role as UserRole);
}

export function canVoidPosTransaction(role?: string | null): boolean {
 return POS_TRANSACTION_VOID_ROLES.has(role as UserRole);
}

export function canRefundPosTransaction(role?: string | null): boolean {
 return POS_TRANSACTION_REFUND_ROLES.has(role as UserRole);
}

export class PosAccessError extends Error {
 status: number;

 constructor(message: string, status = 403) {
 super(message);
 this.name = 'PosAccessError';
 this.status = status;
 }
}

export class PosMissingOpenShiftError extends PosAccessError {
 constructor() {
  super('Tiada syif POS aktif untuk cawangan ini. Buka syif sebelum memulihkan terminal pembayaran.', 403);
 }
}

export function posAccessErrorStatus(error: unknown, fallback = 403) {
 return error instanceof PosAccessError ? error.status : fallback;
}

function malaysiaDate(value = new Date()) {
 return new Intl.DateTimeFormat('en-CA', {
 timeZone: 'Asia/Kuala_Lumpur',
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 }).format(value);
}

export async function assertAreaManagerScheduledForPos(
 supabase: SupabaseClient,
 profile: Pick<Profile, 'id' | 'organization_id' | 'role'>,
 branchId: string,
 shiftDate = malaysiaDate()) {
 if (profile.role !== 'AREA_MANAGER') return null;

 const { data: staffRows, error: staffError } = await supabase
 .from('staff')
 .select('id, full_name')
 .eq('organization_id', profile.organization_id)
 .eq('profile_id', profile.id)
 .eq('status', 'ACTIVE');

 if (staffError) {
 throw new Error(staffError.message);
 }

 const staffIds = (staffRows ?? [])
 .map((row: { id?: string | null }) => row.id)
 .filter((id: string | null | undefined): id is string => Boolean(id));

 if (!staffIds.length) {
 throw new PosAccessError(
 'Akaun AM belum dipautkan kepada rekod staf aktif. Tambah AM sebagai staf dan masukkan ke jadual syif sebelum guna POS.',
 403);
 }

 const previousDate = new Date(`${shiftDate}T00:00:00Z`);
 previousDate.setUTCDate(previousDate.getUTCDate() - 1);
 const previousDay = previousDate.toISOString().slice(0, 10);
 const currentTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
 }).format(new Date());
 const { data: scheduledShifts, error: scheduleError } = await supabase
 .from('staff_shifts')
 .select('id, staff_id, shift_date, scheduled_start, scheduled_end')
 .eq('organization_id', profile.organization_id)
 .eq('branch_id', branchId)
 .in('shift_date', [shiftDate, previousDay])
 .eq('status', 'APPROVED')
 .in('staff_id', staffIds);

 if (scheduleError) {
 throw new Error(scheduleError.message);
 }
 const scheduledShift = scheduledShifts?.find((row) => row.shift_date === shiftDate)
  ?? scheduledShifts?.find((row) => row.shift_date === previousDay
   && typeof row.scheduled_start === 'string' && typeof row.scheduled_end === 'string'
   && row.scheduled_end < row.scheduled_start && currentTime < row.scheduled_end);

 if (!scheduledShift) {
 throw new PosAccessError(
 `AM perlu ada jadual syif diluluskan untuk cawangan ini pada ${shiftDate} sebelum guna POS.`,
 403);
 }

 return {
 staffId: scheduledShift.staff_id as string,
 staffShiftId: scheduledShift.id as string,
 shiftDate,
 };
}

export async function assertActivePosShiftMember(
 supabase: SupabaseClient,
 profile: Pick<Profile, 'id' | 'role'>,
 shiftId: string,
 branchId: string) {
 if (!requiresActivePosShiftMember(profile.role)) return null;

 const { data: member, error } = await supabase
 .from('pos_shift_staff_members')
 .select('id, status, role_in_shift')
 .eq('shift_id', shiftId)
 .eq('branch_id', branchId)
 .eq('profile_id', profile.id)
 .eq('status', 'ACTIVE')
 .maybeSingle();

 if (error) throw new Error(error.message);
 if (!member) {
 throw new PosAccessError(
 'Anda belum aktif dalam syif POS ini. Rekod diri mula bertugas pada tablet rasmi cawangan.',
 403);
 }

 return member;
}

export async function getOpenPosBranchShiftId(
 supabase: SupabaseClient,
 profile: Pick<Profile, 'organization_id'>,
 branchId: string,
) {
 const { data: shift, error } = await supabase
 .from('pos_shifts')
 .select('id')
 .eq('organization_id', profile.organization_id)
 .eq('branch_id', branchId)
 .eq('status', 'OPEN')
 .maybeSingle();

 if (error) throw new Error(error.message);
 if (!shift) {
   throw new PosMissingOpenShiftError();
 }
 return shift.id as string;
}

export async function assertActivePosBranchShiftMember(
 supabase: SupabaseClient,
 profile: Pick<Profile, 'id' | 'organization_id' | 'role'>,
 branchId: string) {
 if (!requiresActivePosShiftMember(profile.role)) return null;

 const shiftId = await getOpenPosBranchShiftId(supabase, profile, branchId);
 return assertActivePosShiftMember(supabase, profile, shiftId, branchId);
}

export async function assertCanAccessPosBranch(
 supabase: SupabaseClient,
 profile: Pick<Profile, 'id' | 'organization_id' | 'role' | 'region_id' | 'branch_id'>,
 branchId: string) {
 const { data: branch, error } = await supabase
 .from('branches')
 .select('id, region_id')
 .eq('id', branchId)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (error) {
 throw new Error(error.message);
 }

 if (!branch) {
 throw new PosAccessError('Cawangan POS tidak dijumpai dalam syarikat anda.', 404);
 }

 const role = profile.role as UserRole;

 if (POS_BRANCH_ALL_ACCESS_ROLES.has(role)) {
 return branch;
 }

 if (role === 'AREA_MANAGER') {
 try {
 await resolveScopedBranches(supabase, profile, branchId);
 return branch;
 } catch {
 throw new PosAccessError('Cawangan tidak termasuk dalam senarai yang ditetapkan untuk AM ini.', 403);
 }
 }

 if (role === 'STAFF' && profile.branch_id === branchId) {
 return branch;
 }

 throw new PosAccessError('Akses POS hanya untuk cawangan dan peranan yang dibenarkan.', 403);
}
