import type { Profile } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdminRole } from '@/lib/auth/permissions';

export type ScopedBranchFilter = {
  /** null = semua cawangan (admin HQ) */
  branchIds: string[] | null;
  regionId: string | null;
  branchId: string | null;
};

const HQ_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATION_MANAGER',
  'HR',
  'CEO_FACTORY',
  'FINANCE',
]);

export function isAreaManager(role: string): boolean {
  return role === 'AREA_MANAGER';
}

/** Perlu pilih cawangan — Area Manager & HQ tanpa branch tetap */
export function needsBranchPicker(profile: Pick<Profile, 'branch_id' | 'role'>): boolean {
  if (profile.branch_id) return false;
  return isAreaManager(profile.role) || HQ_ROLES.has(profile.role);
}

export async function resolveScopedBranches(
  supabase: SupabaseClient,
  profile: Pick<Profile, 'organization_id' | 'role' | 'region_id' | 'branch_id'>,
  requestedBranchId?: string | null
): Promise<ScopedBranchFilter> {
  if (HQ_ROLES.has(profile.role)) {
    return {
      branchIds: requestedBranchId ? [requestedBranchId] : null,
      regionId: null,
      branchId: requestedBranchId ?? profile.branch_id ?? null,
    };
  }

  if (isAreaManager(profile.role)) {
    if (!profile.region_id) {
      return { branchIds: [], regionId: null, branchId: null };
    }

    const { data: regionBranches } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('region_id', profile.region_id);

    const allowed = (regionBranches ?? []).map((b) => b.id);

    if (requestedBranchId) {
      if (!allowed.includes(requestedBranchId)) {
        throw new Error('Cawangan di luar kawasan anda');
      }
      return {
        branchIds: [requestedBranchId],
        regionId: profile.region_id,
        branchId: requestedBranchId,
      };
    }

    return {
      branchIds: allowed,
      regionId: profile.region_id,
      branchId: null,
    };
  }

  if (profile.branch_id) {
    return {
      branchIds: [profile.branch_id],
      regionId: profile.region_id,
      branchId: profile.branch_id,
    };
  }

  return { branchIds: [], regionId: null, branchId: null };
}

export function applyBranchIdsFilter<T extends { in: (col: string, vals: string[]) => T }>(
  query: T,
  column: string,
  branchIds: string[] | null
): T {
  if (branchIds === null) return query;
  if (branchIds.length === 0) {
    return query.in(column, ['00000000-0000-0000-0000-000000000000']);
  }
  return query.in(column, branchIds);
}
