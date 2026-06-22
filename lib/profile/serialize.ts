import { computeProfileCompletion } from '@/lib/profile/completion';
import { formatIcDisplay } from '@/lib/profile/fields';
import { profileNeedsAvatar } from '@/lib/profile/requirements';

export type ProfileStaffInfo = {
  staff_code: string;
  worker_type: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number_masked: string | null;
} | null;

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
  ic_number: string | null;
  ic_number_display: string | null;
  date_of_birth: string | null;
  gender: string | null;
  nationality: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  profile_completed_at: string | null;
  joined_at: string | null;
  last_login_at: string | null;
  completion_percent: number;
  profile_complete: boolean;
  missing_fields: string[];
  branch?: { branch_code: string; branch_name: string } | null;
  region?: { region_code: string; region_name: string } | null;
  staff?: ProfileStaffInfo;
};

function maskAccountNumber(num: string | null | undefined): string | null {
  if (!num?.trim()) return null;
  const d = num.replace(/\s/g, '');
  if (d.length <= 4) return '****';
  return `****${d.slice(-4)}`;
}

export function serializeProfileMe(
  row: Record<string, unknown>,
  staff?: Record<string, unknown> | null
): ProfileMe {
  const branch = row.branch as { branch_code: string; branch_name: string } | null;
  const region = row.region as { region_code: string; region_name: string } | null;
  const ic = (row.ic_number as string | null) ?? null;

  const completion = computeProfileCompletion({
    full_name: row.full_name as string,
    phone: row.phone as string | null,
    avatar_url: row.avatar_url as string | null,
    ic_number: ic,
    date_of_birth: row.date_of_birth as string | null,
    gender: row.gender as string | null,
    nationality: row.nationality as string | null,
    address_line1: row.address_line1 as string | null,
    city: row.city as string | null,
    state: row.state as string | null,
    postcode: row.postcode as string | null,
    emergency_contact_name: row.emergency_contact_name as string | null,
    emergency_contact_phone: row.emergency_contact_phone as string | null,
  });

  return {
    id: row.id as string,
    full_name: row.full_name as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    role: row.role as string,
    employee_code: (row.employee_code as string | null) ?? null,
    must_change_password: Boolean(row.must_change_password),
    needs_avatar: profileNeedsAvatar(row as { avatar_url: string | null }),
    ic_number: ic,
    ic_number_display: ic ? formatIcDisplay(ic) : null,
    date_of_birth: (row.date_of_birth as string | null) ?? null,
    gender: (row.gender as string | null) ?? null,
    nationality: (row.nationality as string | null) ?? null,
    address_line1: (row.address_line1 as string | null) ?? null,
    address_line2: (row.address_line2 as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    postcode: (row.postcode as string | null) ?? null,
    emergency_contact_name: (row.emergency_contact_name as string | null) ?? null,
    emergency_contact_phone: (row.emergency_contact_phone as string | null) ?? null,
    emergency_contact_relation: (row.emergency_contact_relation as string | null) ?? null,
    profile_completed_at: (row.profile_completed_at as string | null) ?? null,
    joined_at: (row.created_at as string | null) ?? null,
    last_login_at: (row.last_login_at as string | null) ?? null,
    completion_percent: completion.percent,
    profile_complete: completion.complete,
    missing_fields: completion.missingRequired,
    branch,
    region,
    staff: staff
      ? {
          staff_code: staff.staff_code as string,
          worker_type: (staff.worker_type as string | null) ?? null,
          bank_name: (staff.bank_name as string | null) ?? null,
          account_holder: (staff.account_holder as string | null) ?? null,
          account_number_masked: maskAccountNumber(staff.account_number as string | null),
        }
      : null,
  };
}

export function buildProfileUpdates(body: Record<string, unknown>): {
  updates: Record<string, string | null>;
  error?: string;
} {
  const updates: Record<string, string | null> = {};

  if (body.full_name != null) {
    const fullName = String(body.full_name).trim();
    if (fullName.length < 2) return { updates, error: 'Nama mesti sekurang-kurangnya 2 aksara' };
    updates.full_name = fullName;
  }

  const stringFields = [
    'phone',
    'ic_number',
    'date_of_birth',
    'gender',
    'nationality',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postcode',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relation',
  ] as const;

  for (const key of stringFields) {
    if (body[key] === undefined) continue;
    const raw = body[key];
    if (raw === null || raw === '') {
      updates[key] = null;
      continue;
    }
    let val = String(raw).trim();
    if (key === 'ic_number') val = val.replace(/\D/g, '');
    if (key === 'postcode') val = val.replace(/\D/g, '').slice(0, 5);
    updates[key] = val;
  }

  if (updates.gender && !['MALE', 'FEMALE', 'OTHER'].includes(updates.gender)) {
    return { updates, error: 'Jantina tidak sah' };
  }

  return { updates };
}

export function completionTimestamp(row: Record<string, unknown>): string | null {
  const completion = computeProfileCompletion({
    full_name: row.full_name as string,
    phone: row.phone as string | null,
    avatar_url: row.avatar_url as string | null,
    ic_number: row.ic_number as string | null,
    date_of_birth: row.date_of_birth as string | null,
    gender: row.gender as string | null,
    nationality: row.nationality as string | null,
    address_line1: row.address_line1 as string | null,
    city: row.city as string | null,
    state: row.state as string | null,
    postcode: row.postcode as string | null,
    emergency_contact_name: row.emergency_contact_name as string | null,
    emergency_contact_phone: row.emergency_contact_phone as string | null,
  });

  if (!completion.complete) return null;
  return (row.profile_completed_at as string | null) ?? new Date().toISOString();
}
