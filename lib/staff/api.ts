import type { StaffGroupedResponse } from '@/lib/staff/types';
import { fetchJson } from '@/lib/client/fetch-json';

export async function fetchStaffGrouped(branchId?: string) {
 const params = new URLSearchParams();
 if (branchId) params.set('branch_id', branchId);
 const qs = params.toString();
 return fetchJson<StaffGroupedResponse>(
 `/api/staff/grouped${qs ? `?${qs}` : ''}`,
 undefined,
 { timeoutMs: 12_000 });
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
 }>('/api/branches', undefined, { ttlMs: 30_000, timeoutMs: 12_000 });
}
