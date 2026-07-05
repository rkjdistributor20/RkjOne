import type { Profile } from '@/types/database';

const VIEW_ROLES = new Set([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'CEO_FACTORY',
]);

const EDIT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

export function canViewStockPlanning(role: string): boolean {
 return VIEW_ROLES.has(role);
}

export function canEditStockPlanning(role: string): boolean {
 return EDIT_ROLES.has(role);
}

export function assertStockPlanningEditor(profile: Profile | null): Profile {
 if (!profile) throw new Error('Tidak dibenarkan');
 if (!canEditStockPlanning(profile.role)) {
 throw new Error('Hanya HQ (Operation Manager / Admin) boleh ubah tetapan ramalan order');
 }
 return profile;
}

export function assertStockPlanningViewer(profile: Profile | null): Profile {
 if (!profile) throw new Error('Tidak dibenarkan');
 if (!canViewStockPlanning(profile.role)) {
 throw new Error('Tidak dibenarkan melihat tetapan ramalan order');
 }
 return profile;
}
