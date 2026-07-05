import type { Profile } from '@/types/database';

export const HR_MANAGE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'] as const;

export type HrManageRole = (typeof HR_MANAGE_ROLES)[number];

export function canManageHrPeople(role: string): boolean {
 return HR_MANAGE_ROLES.includes(role as HrManageRole);
}

export function assertCanManageHrPeople(profile: Profile | null): Profile {
 if (!profile) throw new Error('Tidak dibenarkan');
 if (!canManageHrPeople(profile.role)) {
 throw new Error('Akses HR ditolak');
 }
 return profile;
}
