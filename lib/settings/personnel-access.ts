import type { Profile } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import type { UserRole } from '@/types/enums';

export function isAreaManagerRole(role: string): boolean {
 return role === 'AREA_MANAGER';
}

export function isHrRole(role: string): boolean {
 return role === 'HR';
}

/** Admin HQ, HR syarikat, atau Pengurus Kawasan */
export function isOrgWidePersonnelRole(role: string): boolean {
 return isSettingsAdmin(role) || isHrRole(role) || role === 'OPERATION_MANAGER';
}

export function canManagePersonnel(role: string): boolean {
 return isOrgWidePersonnelRole(role) || isAreaManagerRole(role);
}

export function assertCanManagePersonnel(profile: Profile | null): Profile {
 if (!profile) throw new Error('Tidak dibenarkan');
 if (!canManagePersonnel(profile.role)) {
 throw new Error('Hanya Admin HQ, HR Syarikat atau Pengurus Kawasan boleh urus staf/pengguna');
 }
 return profile;
}

/** Peranan sistem yang AM boleh cipta untuk login staf cawangan. */
export const AM_CREATABLE_USER_ROLES: UserRole[] = ['STAFF'];

export function rolesCreatableBy(profile: Profile): UserRole[] {
 if (profile.role === 'SUPER_ADMIN') {
 return [
 'SUPER_ADMIN',
 'ADMIN',
 'HR',
 'OPERATION_MANAGER',
 'CEO_FACTORY',
 'AREA_MANAGER',
 'DRIVER',
 'STAFF',
 'FINANCE',
 'MAINTENANCE_MANAGER',
 ];
 }
 if (profile.role === 'ADMIN') {
 return [
 'ADMIN',
 'HR',
 'OPERATION_MANAGER',
 'CEO_FACTORY',
 'AREA_MANAGER',
 'DRIVER',
 'STAFF',
 'FINANCE',
 'MAINTENANCE_MANAGER',
 ];
 }
 return [...AM_CREATABLE_USER_ROLES];
}

export async function assertBranchInPersonnelScope(
 supabase: SupabaseClient,
 profile: Profile,
 branchId: string | null | undefined): Promise<string | null> {
 if (!branchId) {
  if (isOrgWidePersonnelRole(profile.role)) return null;
  throw new Error('Pengurus Kawasan mesti pilih cawangan kiosk');
 }

 const { data: branch } = await supabase
  .from('branches')
  .select('id')
  .eq('id', branchId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (!branch) throw new Error('Cawangan tidak dijumpai dalam organisasi anda');

 if (isOrgWidePersonnelRole(profile.role)) return branchId;

 const scope = await resolveScopedBranches(supabase, profile);
 if (!scope.branchIds?.includes(branchId)) {
 throw new Error('Cawangan di luar kawasan anda');
 }
 return branchId;
}

export async function loadPersonnelScope(
 supabase: SupabaseClient,
 profile: Profile) {
 return resolveScopedBranches(supabase, profile);
}

export async function assertStaffTargetInScope(
 supabase: SupabaseClient,
 profile: Profile,
 staffId: string): Promise<void> {
 const { data: row } = await supabase.from('staff').select('id, branch_id').eq('id', staffId).eq('organization_id', profile.organization_id).maybeSingle();

 if (!row) throw new Error('Staf tidak dijumpai');
 if (isOrgWidePersonnelRole(profile.role)) return;
 if (!row.branch_id) throw new Error('Staf tidak mempunyai cawangan yang sah');
 await assertBranchInPersonnelScope(supabase, profile, row.branch_id);
}

export async function assertUserTargetInScope(
 supabase: SupabaseClient,
 profile: Profile,
 userId: string): Promise<void> {
 const { data: row } = await supabase.from('profiles').select('id, role, branch_id, region_id').eq('id', userId).eq('organization_id', profile.organization_id).maybeSingle();

 if (!row) throw new Error('Pengguna tidak dijumpai');
 if (isOrgWidePersonnelRole(profile.role)) return;
 if (row.role !== 'STAFF') {
 throw new Error('Pengurus Kawasan hanya boleh urus pengguna Staf kiosk');
 }
 await assertBranchInPersonnelScope(supabase, profile, row.branch_id);
}

export function assertRoleCreatable(profile: Profile, role: string): void {
 const allowed = rolesCreatableBy(profile);
 if (!allowed.includes(role as UserRole)) {
 throw new Error(
 isAreaManagerRole(profile.role)
 ? 'Pengurus Kawasan hanya boleh cipta akaun staf cawangan'
 : 'Peranan tidak dibenarkan');
 }
}
