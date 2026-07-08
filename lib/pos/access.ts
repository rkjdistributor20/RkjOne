import type { UserRole } from '@/types/enums';
import type { Profile } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export function canViewFullPosHistory(role?: string | null): boolean {
 return FULL_POS_HISTORY_ROLES.includes(role as UserRole);
}

export function canApprovePosShiftStaff(role?: string | null): boolean {
 return POS_SHIFT_STAFF_APPROVER_ROLES.has(role as UserRole);
}

export class PosAccessError extends Error {
 status: number;

 constructor(message: string, status = 403) {
 super(message);
 this.name = 'PosAccessError';
 this.status = status;
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

 const { data: scheduledShift, error: scheduleError } = await supabase
 .from('staff_shifts')
 .select('id, staff_id')
 .eq('organization_id', profile.organization_id)
 .eq('branch_id', branchId)
 .eq('shift_date', shiftDate)
 .eq('status', 'APPROVED')
 .in('staff_id', staffIds)
 .limit(1)
 .maybeSingle();

 if (scheduleError) {
 throw new Error(scheduleError.message);
 }

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

export async function assertCanAccessPosBranch(
 supabase: SupabaseClient,
 profile: Pick<Profile, 'organization_id' | 'role' | 'region_id' | 'branch_id'>,
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
 if (profile.region_id && branch.region_id === profile.region_id) {
 return branch;
 }
 throw new PosAccessError('Cawangan di luar kawasan Area Manager anda.', 403);
 }

 if (role === 'STAFF' && profile.branch_id === branchId) {
 return branch;
 }

 throw new PosAccessError('Akses POS hanya untuk cawangan dan peranan yang dibenarkan.', 403);
}
