import type { HrDashboardData } from '@/lib/hr/company-hr';
import type { LegalEntityCode } from '@/lib/brand/legal-entities';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Permintaan gagal');
  }
  return data as T;
}

export async function fetchHrDashboard(): Promise<HrDashboardData> {
  return fetchJson<HrDashboardData>('/api/hr/companies');
}

export async function transferStaffLegalEntity(
  staffId: string,
  legalEntityCode: LegalEntityCode
) {
  return fetchJson<{ staff: unknown }>(`/api/settings/staff/${staffId}`, {
    method: 'PATCH',
    body: JSON.stringify({ legal_entity_code: legalEntityCode }),
  });
}

export async function transferProfileLegalEntity(
  profileId: string,
  legalEntityCode: LegalEntityCode
) {
  return fetchJson<{ profile: unknown }>(`/api/hr/profiles/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ legal_entity_code: legalEntityCode }),
  });
}

export async function updateHrProfile(
  profileId: string,
  payload: {
    full_name?: string;
    phone?: string | null;
    status?: string;
    legal_entity_code?: LegalEntityCode;
  }
) {
  return fetchJson<{ profile: unknown }>(`/api/hr/profiles/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deactivateHrProfile(profileId: string) {
  return fetchJson<{ result: { id: string; deactivated: boolean } }>(
    `/api/hr/profiles/${profileId}`,
    { method: 'DELETE' }
  );
}

export async function deactivateStaffMember(staffId: string) {
  return fetchJson<{ staff: unknown }>(`/api/settings/staff/${staffId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'INACTIVE' }),
  });
}

export { deleteStaffMember } from '@/lib/settings/api';
export { updateStaffMember } from '@/lib/settings/api';
