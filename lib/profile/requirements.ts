import type { Profile } from '@/types/database';

export function profileNeedsAvatar(
 profile: Pick<Profile, 'avatar_url'> | null | undefined): boolean {
 if (!profile) return true;
 const url = profile.avatar_url?.trim();
 return !url;
}

export const PROFILE_PATH = '/profile';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
