export const MALAYSIA_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Wilayah Persekutuan Kuala Lumpur',
  'Wilayah Persekutuan Labuan',
  'Wilayah Persekutuan Putrajaya',
] as const;

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Lelaki' },
  { value: 'FEMALE', label: 'Perempuan' },
  { value: 'OTHER', label: 'Lain-lain' },
] as const;

export type ProfileGender = (typeof GENDER_OPTIONS)[number]['value'];

export type ProfileDetailsPayload = {
  full_name?: string;
  phone?: string | null;
  ic_number?: string | null;
  date_of_birth?: string | null;
  gender?: ProfileGender | null;
  nationality?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
};

export const PROFILE_SELECT = `
  id, full_name, email, phone, avatar_url, role, employee_code, must_change_password,
  ic_number, date_of_birth, gender, nationality,
  address_line1, address_line2, city, state, postcode,
  emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
  profile_completed_at, created_at, last_login_at,
  branch:branches(branch_code, branch_name),
  region:regions!profiles_region_id_fkey(code, name)
`;

export function normalizeIcNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function formatIcDisplay(ic: string): string {
  const d = normalizeIcNumber(ic);
  if (d.length !== 12) return ic;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export function validateIcNumber(ic: string | null | undefined): string | null {
  if (!ic?.trim()) return 'No. IC / Passport diperlukan';
  const d = normalizeIcNumber(ic);
  if (d.length !== 12) return 'No. IC mesti 12 digit (atau isi passport tanpa sengkang)';
  return null;
}

export function validatePostcode(postcode: string | null | undefined): string | null {
  if (!postcode?.trim()) return 'Poskod diperlukan';
  if (!/^\d{5}$/.test(postcode.trim())) return 'Poskod mesti 5 digit';
  return null;
}

export function validatePhoneMY(phone: string | null | undefined, label = 'Telefon'): string | null {
  if (!phone?.trim()) return `${label} diperlukan`;
  const d = phone.replace(/\D/g, '');
  if (d.length < 9 || d.length > 12) return `${label} tidak sah`;
  return null;
}
