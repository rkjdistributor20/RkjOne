import type { HrDashboardData } from '@/lib/hr/company-hr';
import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import type { HrLeaveBalance, HrLeaveType, HrServiceRequestStatus } from '@/types/database';
import type { UserRole } from '@/types/enums';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
 const res = await fetch(url, {...init,
 headers: {
 'Content-Type': 'application/json',...(init?.headers ?? {}),
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
 legalEntityCode: LegalEntityCode) {
 return fetchJson<{ staff: unknown }>(`/api/settings/staff/${staffId}`, {
 method: 'PATCH',
 body: JSON.stringify({ legal_entity_code: legalEntityCode }),
 });
}

export async function transferProfileLegalEntity(
 profileId: string,
 legalEntityCode: LegalEntityCode) {
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
 role?: UserRole;
 }) {
 return fetchJson<{ profile: unknown }>(`/api/hr/profiles/${profileId}`, {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}

export async function updateHrAgentAccess(
 accountId: string,
 assignedPriceGroupId: string | null) {
 return fetchJson<{ ok: boolean }>('/api/sales-agent/admin/accounts', {
 method: 'PATCH',
 body: JSON.stringify({
 account_id: accountId,
 assigned_price_group_id: assignedPriceGroupId,
 }),
 });
}

export async function updateHrServiceRequestStatus(
 requestId: string,
 payload: { status: Exclude<HrServiceRequestStatus, 'SUBMITTED'>; reviewer_note?: string | null },
) {
 return fetchJson<{ request: unknown }>(`/api/hr/self-service/requests/${requestId}`, {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}

export async function updateHrLeaveBalance(
 staffId: string,
 payload: {
 leave_type: HrLeaveType;
 leave_year: number;
 entitlement_days?: number;
 carried_forward_days?: number;
 used_days?: number;
 pending_days?: number;
 adjustment_days?: number;
 notes?: string | null;
 },
) {
 return fetchJson<{ balance: HrLeaveBalance }>('/api/hr/leave-balances', {
 method: 'PATCH',
 body: JSON.stringify({
 staff_id: staffId,
 ...payload,
 }),
 });
}

export async function deactivateHrProfile(profileId: string) {
 return fetchJson<{ result: { id: string; deactivated: boolean } }>(
 `/api/hr/profiles/${profileId}`,
 { method: 'DELETE' });
}

export async function deactivateStaffMember(staffId: string) {
 return fetchJson<{ staff: unknown }>(`/api/settings/staff/${staffId}`, {
 method: 'PATCH',
 body: JSON.stringify({ status: 'INACTIVE' }),
 });
}

export { deleteStaffMember } from '@/lib/settings/api';
export { updateStaffMember } from '@/lib/settings/api';
