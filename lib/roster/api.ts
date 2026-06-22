import type { RosterEntryInput } from '@/lib/roster/types';

export async function fetchRosterPlan(branchId: string, weekStart: string) {
  const params = new URLSearchParams({ branch_id: branchId, week_start: weekStart });
  const res = await fetch(`/api/roster/plans?${params}`);
  if (!res.ok) throw new Error((await res.json()).error ?? 'Gagal muat jadual');
  return res.json();
}

export async function fetchRosterStatus(weekStart?: string) {
  const params = weekStart ? `?week_start=${weekStart}` : '';
  const res = await fetch(`/api/roster/status${params}`);
  if (!res.ok) throw new Error((await res.json()).error ?? 'Gagal muat status');
  return res.json();
}

export async function saveRosterPlan(payload: {
  branch_id: string;
  week_start: string;
  entries: RosterEntryInput[];
}) {
  const res = await fetch('/api/roster/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Gagal simpan jadual');
  return res.json();
}

export async function publishRosterPlan(planId: string) {
  const res = await fetch(`/api/roster/plans/${planId}/publish`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Gagal terbitkan jadual');
  return res.json();
}

export async function fetchMySchedule(weekStart?: string) {
  const params = weekStart ? `?week_start=${weekStart}` : '';
  const res = await fetch(`/api/roster/my-schedule${params}`);
  if (!res.ok) throw new Error((await res.json()).error ?? 'Gagal muat jadual anda');
  return res.json();
}

export async function syncRosterRemindersClient() {
  await fetch('/api/roster/reminders', { method: 'POST' });
}
