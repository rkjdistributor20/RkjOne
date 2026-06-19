import type { ApprovalRequest } from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function fetchApprovals(status = 'PENDING') {
  const params = status ? `?status=${status}` : '';
  return fetchJson<{ approvals: ApprovalRequest[] }>(`/api/approvals${params}`);
}

export async function approveRequest(id: string) {
  return fetchJson<{ result: unknown }>(`/api/approvals/${id}/approve`, { method: 'POST' });
}

export async function rejectRequest(id: string, reason?: string) {
  return fetchJson<{ result: unknown }>(`/api/approvals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
