import type {
  ShiftTemplate,
  StaffShiftRow,
  AttendanceRow,
} from '@/lib/shifts/types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function fetchShiftTemplates() {
  return fetchJson<{ templates: ShiftTemplate[] }>('/api/shifts/templates');
}

export async function fetchStaffShifts(branchId?: string) {
  const params = branchId ? `?branch_id=${branchId}` : '';
  return fetchJson<{ shifts: StaffShiftRow[] }>(`/api/shifts${params}`);
}

export async function fetchAttendance(branchId?: string) {
  const params = branchId ? `?branch_id=${branchId}` : '';
  return fetchJson<{ attendance: AttendanceRow[] }>(`/api/shifts/attendance${params}`);
}

export async function fetchStaffList(branchId?: string) {
  const params = branchId ? `?branch_id=${branchId}` : '';
  return fetchJson<{
    staff: Array<{ id: string; staff_code: string; full_name: string }>;
  }>(`/api/shifts/staff${params}`);
}

export async function createStaffShift(payload: {
  staff_id: string;
  branch_id: string;
  shift_date: string;
  template_id?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  notes?: string;
}) {
  return fetchJson<{ result: unknown }>('/api/shifts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function approveShift(shiftId: string) {
  return fetchJson<{ result: unknown }>(`/api/shifts/${shiftId}/approve`, {
    method: 'POST',
  });
}

export async function clockIn(staffId: string, branchId: string) {
  return fetchJson<{ result: unknown }>('/api/shifts/clock-in', {
    method: 'POST',
    body: JSON.stringify({ staff_id: staffId, branch_id: branchId }),
  });
}

export async function clockOut(staffId: string) {
  return fetchJson<{ result: unknown }>('/api/shifts/clock-out', {
    method: 'POST',
    body: JSON.stringify({ staff_id: staffId }),
  });
}
