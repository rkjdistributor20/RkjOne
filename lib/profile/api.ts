import type { ProfileDetailsPayload } from '@/lib/profile/fields';
import type { ProfileMe } from '@/lib/profile/serialize';

export type { ProfileMe };

export async function fetchMyProfile(): Promise<ProfileMe> {
 const res = await fetch('/api/profile');
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal muat profil');
 return data.profile;
}

export async function updateMyProfile(payload: ProfileDetailsPayload) {
 const res = await fetch('/api/profile', {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal kemas kini profil');
 return data.profile as ProfileMe;
}

export async function uploadProfileAvatar(file: File): Promise<ProfileMe> {
 const form = new FormData();
 form.append('file', file);
 const res = await fetch('/api/profile/avatar', { method: 'POST', body: form });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal muat naik gambar');
 return data.profile as ProfileMe;
}
