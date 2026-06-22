export type ProfileMe = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  employee_code: string | null;
  must_change_password: boolean;
  needs_avatar: boolean;
  branch?: { branch_code: string; branch_name: string } | null;
};

export async function fetchMyProfile(): Promise<ProfileMe> {
  const res = await fetch('/api/profile');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Gagal muat profil');
  return data.profile;
}

export async function updateMyProfile(payload: {
  full_name?: string;
  phone?: string | null;
}) {
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
