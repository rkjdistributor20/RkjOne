import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_ENTITIES, legalEntityLabel, type LegalEntityCode } from '@/lib/brand/legal-entities';
import {
  computeForeignWeeklyPay,
  computeLocalMonthlyPay,
  DEFAULT_SHIFTS_PER_WEEK,
  inferWorkerType,
  staffPayDisplay,
} from '@/lib/payroll/staff-pay-rates';
import { usesRetailLocalPayRules } from '@/lib/payroll/local-pay-policy';
import type { PayrollRule } from '@/lib/payroll/types';
import { isGroupOwnerMetadata } from '@/lib/hr/group-owner';

export type MyPayEmployment = {
  staff_id: string;
  staff_code: string;
  legal_entity_code: string;
  legal_entity_name: string;
  worker_type: 'LOCAL' | 'FOREIGN';
  branch_name: string | null;
  pay_label: string | null;
  weekly_amount: number | null;
  monthly_amount: number | null;
  shift_hours: number | null;
  shifts_per_week: number | null;
  pay_breakdown: Array<{ label: string; amount: number }>;
};

export type MyPaySlipRow = {
  id: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  file_name: string;
  legal_entity_code: string | null;
  legal_entity_name: string | null;
  created_at: string;
  download_url: string | null;
  source: 'UPLOAD' | 'SYSTEM';
  gross_pay: number | null;
  net_pay: number | null;
};

export type MyPayrollHistoryRow = {
  run_number: string;
  period_start: string;
  period_end: string;
  status: string;
  gross_pay: number;
  net_pay: number;
  shift_pay: number;
  ot_pay: number;
  basic_salary: number;
  commission: number;
  epf: number;
  socso: number;
  eis: number;
  legal_entity_code: string | null;
};

export type MyPayrollDashboard = {
  full_name: string;
  email: string | null;
  is_group_owner: boolean;
  employments: MyPayEmployment[];
  total_weekly: number | null;
  total_monthly: number | null;
  companies: Array<{
    code: LegalEntityCode;
    legal_name: string;
    scope: string;
    is_my_employer: boolean;
  }>;
  payroll_history: MyPayrollHistoryRow[];
  payslips: MyPaySlipRow[];
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function buildPayBreakdown(
  workerType: 'LOCAL' | 'FOREIGN',
  legalEntityCode: string,
  rules: PayrollRule[],
  shiftHours: number | null,
  shiftsPerWeek: number | null,
  monthlyAmount: number | null
): Array<{ label: string; amount: number }> {
  if (workerType === 'FOREIGN' && shiftHours != null) {
    const pay = computeForeignWeeklyPay(rules, shiftHours, shiftsPerWeek ?? DEFAULT_SHIFTS_PER_WEEK);
    const otRule = rules.find(
      (r) => r.worker_type === 'FOREIGN' && r.period === 'HOURLY' && r.component?.includes('OT')
    );
    return [
      { label: `Shift ${shiftHours}j × ${pay.shiftsPerWeek} hari`, amount: pay.weekly },
      ...(otRule?.rate ? [{ label: 'OT (anggaran/jam)', amount: otRule.rate }] : []),
    ];
  }
  if (workerType === 'LOCAL') {
    if (usesRetailLocalPayRules(legalEntityCode)) {
      return computeLocalMonthlyPay(rules).breakdown.map((b) => ({
        label: b.component,
        amount: b.amount,
      }));
    }
    if (monthlyAmount != null) {
      return [{ label: 'Gaji bulanan (rekod syarikat)', amount: Number(monthlyAmount) }];
    }
    return [{ label: 'Gaji bulanan', amount: 0 }];
  }
  return [];
}

export async function getMyPayrollDashboard(
  supabase: SupabaseClient,
  profileId: string,
  organizationId: string,
  rules: PayrollRule[]
): Promise<MyPayrollDashboard> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, metadata, legal_entity_id')
    .eq('id', profileId)
    .single();

  const { data: staffRows } = await supabase
    .from('staff')
    .select(
      'id, staff_code, full_name, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, legal_entity_id, branch:branches(branch_name), legal_entity:legal_entities(code, legal_name)'
    )
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .eq('status', 'ACTIVE');

  const employments: MyPayEmployment[] = [];
  let totalWeekly = 0;
  let totalMonthly = 0;
  let hasWeekly = false;
  let hasMonthly = false;

  for (const row of staffRows ?? []) {
    const branch = one(row.branch as { branch_name: string } | { branch_name: string }[] | null);
    const entity = one(
      row.legal_entity as { code: string; legal_name: string } | { code: string; legal_name: string }[] | null
    );
    const workerType = inferWorkerType(row as Parameters<typeof inferWorkerType>[0]);
    const breakdown = buildPayBreakdown(
      workerType,
      entity?.code ?? 'RKJ',
      rules,
      row.shift_hours != null ? Number(row.shift_hours) : null,
      row.shifts_per_week,
      row.monthly_amount != null ? Number(row.monthly_amount) : null
    );

    if (workerType === 'FOREIGN') {
      const w = Number(row.weekly_amount ?? breakdown[0]?.amount ?? 0);
      totalWeekly += w;
      hasWeekly = true;
    } else {
      const m = Number(row.monthly_amount ?? breakdown.reduce((s, b) => s + b.amount, 0));
      totalMonthly += m;
      hasMonthly = true;
    }

    employments.push({
      staff_id: row.id as string,
      staff_code: row.staff_code as string,
      legal_entity_code: entity?.code ?? '—',
      legal_entity_name: entity?.legal_name ?? '—',
      worker_type: workerType,
      branch_name: branch?.branch_name ?? null,
      pay_label: staffPayDisplay(row as Parameters<typeof staffPayDisplay>[0]),
      weekly_amount: row.weekly_amount,
      monthly_amount: row.monthly_amount,
      shift_hours: row.shift_hours,
      shifts_per_week: row.shifts_per_week,
      pay_breakdown: breakdown,
    });
  }

  const employerCodes = new Set(employments.map((e) => e.legal_entity_code));
  const companies = LEGAL_ENTITIES.map((e) => ({
    code: e.code,
    legal_name: legalEntityLabel(e.code, e.legalName),
    scope: e.scope,
    is_my_employer: employerCodes.has(e.code),
  }));

  const staffIds = employments.map((e) => e.staff_id);
  const payroll_history: MyPayrollHistoryRow[] = [];

  if (staffIds.length > 0) {
    const { data: lines } = await supabase
      .from('payroll_line_items')
      .select(
        'gross_pay, net_pay, shift_pay, ot_pay, basic_salary, commission, epf, socso, eis, staff_id, payroll_run:payroll_runs(run_number, period_start, period_end, status)'
      )
      .in('staff_id', staffIds)
      .order('created_at', { ascending: false })
      .limit(24);

    for (const line of lines ?? []) {
      const run = one(
        line.payroll_run as
          | { run_number: string; period_start: string; period_end: string; status: string }
          | Array<{ run_number: string; period_start: string; period_end: string; status: string }>
          | null
      );
      if (!run) continue;
      const emp = employments.find((e) => e.staff_id === line.staff_id);
      payroll_history.push({
        run_number: run.run_number,
        period_start: run.period_start,
        period_end: run.period_end,
        status: run.status,
        gross_pay: Number(line.gross_pay),
        net_pay: Number(line.net_pay),
        shift_pay: Number(line.shift_pay),
        ot_pay: Number(line.ot_pay),
        basic_salary: Number(line.basic_salary),
        commission: Number(line.commission),
        epf: Number(line.epf),
        socso: Number(line.socso),
        eis: Number(line.eis),
        legal_entity_code: emp?.legal_entity_code ?? null,
      });
    }
  }

  const { data: payslipRows } = await supabase
    .from('staff_payslips')
    .select(
      'id, period_label, period_start, period_end, file_name, storage_path, created_at, source, gross_pay, net_pay, legal_entity:legal_entities(code, legal_name)'
    )
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20);

  const payslips: MyPaySlipRow[] = (payslipRows ?? []).map((p) => {
    const entity = one(
      p.legal_entity as { code: string; legal_name: string } | { code: string; legal_name: string }[] | null
    );
    return {
      id: p.id as string,
      period_label: p.period_label as string,
      period_start: p.period_start as string | null,
      period_end: p.period_end as string | null,
      file_name: p.file_name as string,
      legal_entity_code: entity?.code ?? null,
      legal_entity_name: entity?.legal_name ?? null,
      created_at: p.created_at as string,
      download_url: null as string | null,
      source: (p.source as 'UPLOAD' | 'SYSTEM') ?? 'UPLOAD',
      gross_pay: p.gross_pay != null ? Number(p.gross_pay) : null,
      net_pay: p.net_pay != null ? Number(p.net_pay) : null,
    };
  });

  return {
    full_name: (profile?.full_name as string) ?? '',
    email: (profile?.email as string | null) ?? null,
    is_group_owner: isGroupOwnerMetadata(profile?.metadata),
    employments,
    total_weekly: hasWeekly ? Math.round(totalWeekly * 100) / 100 : null,
    total_monthly: hasMonthly ? Math.round(totalMonthly * 100) / 100 : null,
    companies,
    payroll_history,
    payslips,
  };
}
