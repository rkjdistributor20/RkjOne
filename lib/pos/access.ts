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
