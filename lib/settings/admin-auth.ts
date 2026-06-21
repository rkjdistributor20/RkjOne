import type { Profile } from '@/types/database';

export function isSettingsAdmin(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function assertSettingsAdmin(profile: Profile | null): Profile {
  if (!profile) throw new Error('Tidak dibenarkan');
  if (!isSettingsAdmin(profile.role)) {
    throw new Error('Hanya pentadbir HQ boleh urus tetapan ini');
  }
  return profile;
}
