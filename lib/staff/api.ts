import type { StaffGroupedResponse } from '@/lib/staff/types';

async function fetchJson<T>(url: string): Promise<T> {
 const res = await fetch(url);
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Request failed');
 return data;
}

export async function fetchStaffGrouped(branchId?: string) {
 const params = new URLSearchParams();
 if (branchId) params.set('branch_id', branchId);
 const qs = params.toString();
 return fetchJson<StaffGroupedResponse>(
 `/api/staff/grouped${qs ? `?${qs}` : ''}`);
}

export async function fetchScopedBranches() {
 return fetchJson<{
 branches: Array<{
 id: string;
 branch_code: string;
 branch_name: string;
 region_name: string | null;
 manager_name: string | null;
 }>;
 }>('/api/branches');
}
