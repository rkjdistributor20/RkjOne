import type {
  CommissionTier,
  PayrollRule,
  PayrollRun,
  PayrollStaffRow,
} from './types';
import type { CompanyPayrollDashboard } from './company-payroll';
import type { MyPayrollDashboard } from './my-payroll';

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

export async function fetchCompanyPayroll() {
  return fetchJson<CompanyPayrollDashboard>('/api/payroll/companies');
}

export async function generateWeeklyForeignReport(payload?: {
  period_start?: string;
  period_end?: string;
  branch_id?: string;
}) {
  return fetchJson<{
    result: Record<string, unknown>;
    week: { period_start: string; period_end: string; label: string };
    foreign_workers: number;
    branch_report: Array<Record<string, unknown>>;
    companies: Array<{ code: string; legal_name: string; foreign_count: number; weekly_total: number }>;
  }>('/api/payroll/weekly-foreign', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

export async function fetchMyPayroll() {
  return fetchJson<{ payroll: MyPayrollDashboard }>('/api/me/payroll');
}

export async function uploadMyPayslip(form: FormData) {
  const res = await fetch('/api/me/payslips', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Upload gagal');
  return data;
}

export async function fetchAiPayrollProposal(periodType: 'WEEKLY' | 'MONTHLY' = 'WEEKLY') {
  return fetchJson<{ proposal: import('./ai-proposal').AiPayrollProposal }>(
    `/api/payroll/ai-proposal?period_type=${periodType}`
  );
}

export async function distributePayslips(payload: {
  period_type: 'WEEKLY' | 'MONTHLY';
  period_start: string;
  period_end: string;
  period_label: string;
  proposal: import('./ai-proposal').AiPayrollProposal;
  create_payroll_run?: boolean;
}) {
  return fetchJson<{
    distributed: number;
    skipped: number;
    errors: string[];
    payslip_ids: string[];
    payroll_run_id: string | null;
    proposal_summary: string;
  }>('/api/payroll/distribute-payslips', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
