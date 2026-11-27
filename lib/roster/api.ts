import { fetchJson } from '@/lib/client/fetch-json';
import type { RosterBranchStatus, RosterEntryInput, RosterPlannerData, ScheduleComparison, StaffScheduleWeek } from './types';

export function fetchRosterPlan(branchId: string, weekStart: string) {
 const params = new URLSearchParams({ branch_id: branchId, week_start: weekStart });
 return fetchJson<RosterPlannerData>(`/api/roster/plans?${params}`);
}

export function fetchRosterStatus(weekStart: string) {
 const params = new URLSearchParams({ week_start: weekStart });
 return fetchJson<{ branches: RosterBranchStatus[] }>(`/api/roster/status?${params}`);
}

export function saveRosterPlan(payload: {
 branch_id: string;
 week_start: string;
 entries?: RosterEntryInput[];
 copy_from_week?: string;
}) {
 return fetchJson<{ plan_id: string }>('/api/roster/plans', {
  method: 'POST', body: JSON.stringify(payload),
 });
}

export function publishRosterPlan(planId: string) {
 return fetchJson(`/api/roster/plans/${planId}/publish`, { method: 'POST' });
}

export function fetchRosterActuals(weekStart: string, branchId?: string) {
 const params = new URLSearchParams({ week_start: weekStart });
 if (branchId) params.set('branch_id', branchId);
 return fetchJson<{ actuals: ScheduleComparison[] }>(`/api/area-manager/schedule-actuals?${params}`);
}

export function fetchMySchedule(weekStart?: string) {
 // Also used in a compact login view, where an unauthenticated request should
 // be displayed inline rather than redirecting back to login.
 const params = weekStart ? `?${new URLSearchParams({ week_start: weekStart })}` : '';
 return fetch(`/api/roster/my-schedule${params}`).then(async (res): Promise<{
  schedule: StaffScheduleWeek | null; message?: string;
 }> => {
  if (!res.ok) throw new Error((await res.json()).error ?? 'Gagal muat jadual anda');
  return res.json();
 });
}

export async function syncRosterRemindersClient() {
 await fetch('/api/roster/reminders', { method: 'POST' });
}
