import type {
  CommissionTier,
  PayrollRule,
  PayrollRun,
  PayrollStaffRow,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function fetchPayrollRules() {
  return fetchJson<{ rules: PayrollRule[] }>('/api/payroll/rules');
}

export async function updatePayrollRule(ruleId: string, rate: number, notes?: string) {
  return fetchJson<{ result: unknown }>(`/api/payroll/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ rate, notes }),
  });
}

export async function fetchCommissionTiers() {
  return fetchJson<{ tiers: CommissionTier[] }>('/api/payroll/commission-tiers');
}

export async function fetchPayrollRuns() {
  return fetchJson<{ runs: PayrollRun[] }>('/api/payroll/runs');
}

export async function fetchPayrollRun(id: string) {
  return fetchJson<{ run: PayrollRun }>(`/api/payroll/runs/${id}`);
}

export async function generatePayrollRun(payload: {
  period_start: string;
  period_end: string;
  branch_id?: string;
}) {
  return fetchJson<{ result: Record<string, unknown> }>('/api/payroll/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function approvePayrollRun(runId: string) {
  return fetchJson<{ result: unknown }>(`/api/payroll/runs/${runId}/approve`, {
    method: 'POST',
  });
}

export async function fetchPayrollStaff() {
  return fetchJson<{ staff: PayrollStaffRow[] }>('/api/payroll/staff');
}
