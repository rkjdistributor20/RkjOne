import type { SupabaseClient } from '@supabase/supabase-js';
import { type LegalEntityCode } from '@/lib/brand/legal-entities';
import { getCompanyPayrollDashboard } from '@/lib/payroll/company-payroll';
import {
  computeFixedCompanyLocalPay,
  computeRkjSalesLocalPay,
  usesRetailLocalPayRules,
} from '@/lib/payroll/local-pay-policy';
import {
  computeForeignWeeklyPay,
  DEFAULT_SHIFTS_PER_WEEK,
} from '@/lib/payroll/staff-pay-rates';
import type { PayrollRule, CommissionTier } from '@/lib/payroll/types';

export type ProposalPeriodType = 'WEEKLY' | 'MONTHLY';

export type PayrollProposalLine = {
  staff_id: string;
  staff_code: string;
  full_name: string;
  branch_name: string | null;
  profile_id: string | null;
  worker_type: 'LOCAL' | 'FOREIGN';
  shift_hours: number | null;
  shifts_in_period: number;
  ot_hours: number;
  basic_salary: number;
  attendance_allowance: number;
  shift_pay: number;
  ot_pay: number;
  commission: number;
  epf: number;
  socso: number;
  eis: number;
  gross_pay: number;
  net_pay: number;
  pay_basis: string;
  pay_model?: 'RETAIL_RULES' | 'FIXED_RECORD';
  edited?: boolean;
  flags: string[];
};

export type CompanyPayrollProposal = {
  company_id: string;
  company_code: LegalEntityCode;
  company_name: string;
  foreign_lines: PayrollProposalLine[];
  local_lines: PayrollProposalLine[];
  foreign_total_net: number;
  local_total_net: number;
  total_net: number;
  total_gross: number;
};

export type AiPayrollProposal = {
  period_start: string;
  period_end: string;
  period_label: string;
  period_type: ProposalPeriodType;
  generated_at: string;
  summary: string;
  insights: string[];
  warnings: string[];
  companies: CompanyPayrollProposal[];
  totals: {
    staff_count: number;
    foreign_count: number;
    local_count: number;
    gross: number;
    net: number;
    without_portal: number;
  };
};

type ShiftAgg = { shifts: number; ot_hours: number; hours: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function buildNarrativeSummary(
  periodType: ProposalPeriodType,
  periodLabel: string,
  companies: CompanyPayrollProposal[],
  totals: AiPayrollProposal['totals']
): string {
  const parts = companies.map((c) => {
    const f = c.foreign_lines.length;
    const l = c.local_lines.length;
    return `${c.company_code}: ${f} pekerja asing (RM ${c.foreign_total_net.toFixed(2)}/minggu) · ${l} tempatan (RM ${c.local_total_net.toFixed(2)}/bulan)`;
  });
  const cadence = periodType === 'WEEKLY' ? 'mingguan' : 'bulanan';
  return (
    `Cadangan gaji ${cadence} ${periodLabel}: ${totals.staff_count} staf, jumlah bersih RM ${totals.net.toFixed(2)}. ` +
    `Pecahan syarikat — ${parts.join('; ')}. ` +
    `Staf jualan RKJ ikut peraturan PR + komisen; RKJ Distributor & Manufacturing ikut gaji bulanan rekod.`
  );
}

function buildInsights(companies: CompanyPayrollProposal[]): string[] {
  const insights: string[] = [];
  for (const c of companies) {
    const highOt = c.foreign_lines.filter((l) => l.ot_hours >= 4);
    if (highOt.length > 0) {
      insights.push(
        `${c.company_code}: ${highOt.length} pekerja asing dengan OT ≥4j — semak kelulusan shift.`
      );
    }
    const noShifts = c.foreign_lines.filter((l) => l.shifts_in_period === 0);
    if (noShifts.length > 0) {
      insights.push(
        `${c.company_code}: ${noShifts.length} pekerja asing tiada shift diluluskan dalam tempoh — gaji mungkin RM 0.`
      );
    }
    const locals = c.local_lines.filter((l) => l.commission > 0 && l.pay_model === 'RETAIL_RULES');
    if (locals.length > 0) {
      const commTotal = round2(locals.reduce((s, l) => s + l.commission, 0));
      insights.push(
        `${c.company_code}: komisen POS RM ${commTotal.toFixed(2)} untuk ${locals.length} staf tempatan.`
      );
    }
  }
  if (insights.length === 0) {
    insights.push('Tiada anomali kritikal — cadangan selaras dengan peraturan payroll semasa.');
  }
  return insights;
}

async function loadShiftAggregates(
  supabase: SupabaseClient,
  staffIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Map<string, ShiftAgg>> {
  const map = new Map<string, ShiftAgg>();
  if (staffIds.length === 0) return map;

  const { data } = await supabase
    .from('staff_shifts')
    .select('staff_id, ot_hours, actual_hours, scheduled_hours')
    .in('staff_id', staffIds)
    .eq('status', 'APPROVED')
    .gte('shift_date', periodStart)
    .lte('shift_date', periodEnd);

  for (const row of data ?? []) {
    const id = row.staff_id as string;
    const prev = map.get(id) ?? { shifts: 0, ot_hours: 0, hours: 0 };
    const hrs = Number(row.actual_hours ?? row.scheduled_hours ?? 8);
    map.set(id, {
      shifts: prev.shifts + 1,
      ot_hours: prev.ot_hours + Number(row.ot_hours ?? 0),
      hours: prev.hours + hrs,
    });
  }
  return map;
}

async function loadSalesByStaff(
  supabase: SupabaseClient,
  staffIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (staffIds.length === 0) return map;

  const { data } = await supabase
    .from('pos_shifts')
    .select('staff_id, total_sales')
    .in('staff_id', staffIds)
    .eq('status', 'CLOSED')
    .gte('closed_at', `${periodStart}T00:00:00`)
    .lte('closed_at', `${periodEnd}T23:59:59`);

  for (const row of data ?? []) {
    const id = row.staff_id as string;
    map.set(id, (map.get(id) ?? 0) + Number(row.total_sales ?? 0));
  }
  return map;
}

function buildLocalLine(
  staff: {
    id: string;
    staff_code: string;
    full_name: string;
    profile_id: string | null;
    monthly_amount: number | null;
    branch_name: string | null;
  },
  companyCode: LegalEntityCode,
  rules: PayrollRule[],
  tiers: CommissionTier[],
  sales: number,
  periodStart: string,
  periodEnd: string
): PayrollProposalLine {
  const flags: string[] = [];
  const pay = usesRetailLocalPayRules(companyCode)
    ? computeRkjSalesLocalPay(rules, tiers, sales, periodStart, periodEnd)
    : computeFixedCompanyLocalPay(companyCode, staff.monthly_amount, periodStart, periodEnd);

  if (!usesRetailLocalPayRules(companyCode) && (staff.monthly_amount == null || staff.monthly_amount <= 0)) {
    flags.push('Gaji bulanan rekod tiada — sila kemas kini di HR');
  }

  if (
    usesRetailLocalPayRules(companyCode) &&
    staff.monthly_amount != null &&
    Math.abs(Number(staff.monthly_amount) - pay.gross_pay) > 50
  ) {
    flags.push(`Rekod staf RM ${Number(staff.monthly_amount).toFixed(2)} vs cadangan RM ${pay.gross_pay.toFixed(2)}`);
  }

  return {
    staff_id: staff.id,
    staff_code: staff.staff_code,
    full_name: staff.full_name,
    branch_name: staff.branch_name,
    profile_id: staff.profile_id,
    worker_type: 'LOCAL',
    shift_hours: null,
    shifts_in_period: 0,
    ot_hours: 0,
    basic_salary: pay.basic_salary,
    attendance_allowance: pay.attendance_allowance,
    shift_pay: pay.shift_pay,
    ot_pay: pay.ot_pay,
    commission: pay.commission,
    epf: pay.epf,
    socso: pay.socso,
    eis: pay.eis,
    gross_pay: pay.gross_pay,
    net_pay: pay.net_pay,
    pay_basis: pay.pay_basis,
    pay_model: pay.pay_model,
    edited: false,
    flags,
  };
}

function buildForeignLine(
  staff: {
    id: string;
    staff_code: string;
    full_name: string;
    profile_id: string | null;
    shift_hours: number | null;
    shifts_per_week: number | null;
    weekly_amount: number | null;
    branch_name: string | null;
  },
  rules: PayrollRule[],
  shiftAgg: ShiftAgg | undefined,
  periodType: ProposalPeriodType
): PayrollProposalLine {
  const flags: string[] = [];
  const shiftsInPeriod = shiftAgg?.shifts ?? 0;
  const otHours = shiftAgg?.ot_hours ?? 0;
  const shiftHours = staff.shift_hours != null ? Number(staff.shift_hours) : null;

  let shiftPay = 0;
  let payBasis = '';

  if (shiftHours != null) {
    const tier = computeForeignWeeklyPay(
      rules,
      shiftHours,
      staff.shifts_per_week ?? DEFAULT_SHIFTS_PER_WEEK
    );
    if (periodType === 'WEEKLY') {
      if (shiftsInPeriod > 0) {
        shiftPay = round2(tier.perShift * shiftsInPeriod);
        payBasis = `${shiftsInPeriod} shift × RM ${tier.perShift.toFixed(2)} (${shiftHours}j)`;
      } else {
        shiftPay = tier.weekly;
        payBasis = `Anggaran mingguan ${tier.shiftsPerWeek} hari × RM ${tier.perShift.toFixed(2)}`;
        flags.push('Tiada shift diluluskan — guna anggaran mingguan');
      }
    } else {
      shiftPay = tier.weekly * 4;
      payBasis = `4 minggu × RM ${tier.weekly.toFixed(2)}/minggu`;
    }
  } else if (staff.weekly_amount != null) {
    shiftPay = Number(staff.weekly_amount);
    payBasis = 'Kadar mingguan rekod staf';
    flags.push('Shift jam tidak ditetapkan');
  } else {
    flags.push('Shift jam & kadar mingguan tiada');
  }

  const otRule = rules.find(
    (r) => r.worker_type === 'FOREIGN' && r.period === 'HOURLY' && r.component?.includes('OT')
  );
  const otPay = round2(otHours * (otRule?.rate ?? 0));
  const gross = round2(shiftPay + otPay);
  if (otHours > 0) payBasis += ` + OT ${otHours}j`;

  return {
    staff_id: staff.id,
    staff_code: staff.staff_code,
    full_name: staff.full_name,
    branch_name: staff.branch_name,
    profile_id: staff.profile_id,
    worker_type: 'FOREIGN',
    shift_hours: shiftHours,
    shifts_in_period: shiftsInPeriod,
    ot_hours: otHours,
    basic_salary: 0,
    attendance_allowance: 0,
    shift_pay: shiftPay,
    ot_pay: otPay,
    commission: 0,
    epf: 0,
    socso: 0,
    eis: 0,
    gross_pay: gross,
    net_pay: gross,
    pay_basis: payBasis,
    flags,
  };
}

export async function generateAiPayrollProposal(
  supabase: SupabaseClient,
  organizationId: string,
  rules: PayrollRule[],
  periodStart: string,
  periodEnd: string,
  periodLabel: string,
  periodType: ProposalPeriodType
): Promise<AiPayrollProposal> {
  const dashboard = await getCompanyPayrollDashboard(supabase, organizationId, rules);
  const allStaffIds = dashboard.companies.flatMap((c) => c.staff.map((s) => s.id));

  const { data: staffMeta } = await supabase
    .from('staff')
    .select('id, profile_id')
    .in('id', allStaffIds.length ? allStaffIds : ['00000000-0000-0000-0000-000000000000']);

  const profileByStaff = new Map(
    (staffMeta ?? []).map((s) => [s.id as string, s.profile_id as string | null])
  );

  const { data: tierRows } = await supabase
    .from('commission_tiers')
    .select('id, tier_from, tier_to, commission_amount, formula_description, status')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE');

  const tiers = (tierRows ?? []) as CommissionTier[];

  const shiftAggs = await loadShiftAggregates(supabase, allStaffIds, periodStart, periodEnd);
  const salesMap = await loadSalesByStaff(supabase, allStaffIds, periodStart, periodEnd);

  const companies: CompanyPayrollProposal[] = [];
  let foreignCount = 0;
  let localCount = 0;
  let totalGross = 0;
  let totalNet = 0;
  let withoutPortal = 0;
  const warnings: string[] = [];

  for (const company of dashboard.companies) {
    const foreign_lines: PayrollProposalLine[] = [];
    const local_lines: PayrollProposalLine[] = [];

    for (const s of company.staff) {
      const profileId = profileByStaff.get(s.id) ?? null;
      const branch_name = s.branch_name;
      const base = {
        id: s.id,
        staff_code: s.staff_code,
        full_name: s.full_name,
        profile_id: profileId,
        branch_name,
      };

      if (!profileId) {
        withoutPortal += 1;
        warnings.push(`${s.staff_code} ${s.full_name} — tiada akaun portal, slip tidak boleh dihantar.`);
      }

      if (s.worker_type === 'FOREIGN' && periodType === 'MONTHLY') continue;
      if (s.worker_type === 'LOCAL' && periodType === 'WEEKLY') continue;

      if (s.worker_type === 'FOREIGN') {
        foreign_lines.push(
          buildForeignLine(
            {
              ...base,
              shift_hours: s.shift_hours,
              shifts_per_week: s.shifts_per_week,
              weekly_amount: s.weekly_amount,
            },
            rules,
            shiftAggs.get(s.id),
            periodType
          )
        );
        foreignCount += 1;
      } else {
        local_lines.push(
          buildLocalLine(
            { ...base, monthly_amount: s.monthly_amount },
            company.code,
            rules,
            tiers,
            salesMap.get(s.id) ?? 0,
            periodStart,
            periodEnd
          )
        );
        localCount += 1;
      }
    }

    const foreign_total_net = round2(foreign_lines.reduce((sum, l) => sum + l.net_pay, 0));
    const local_total_net = round2(local_lines.reduce((sum, l) => sum + l.net_pay, 0));
    const total_gross = round2(
      foreign_lines.reduce((s, l) => s + l.gross_pay, 0) +
        local_lines.reduce((s, l) => s + l.gross_pay, 0)
    );
    totalGross += total_gross;
    totalNet += foreign_total_net + local_total_net;

    companies.push({
      company_id: company.id,
      company_code: company.code,
      company_name: company.legal_name,
      foreign_lines,
      local_lines,
      foreign_total_net,
      local_total_net,
      total_net: round2(foreign_total_net + local_total_net),
      total_gross,
    });
  }

  const totals = {
    staff_count: foreignCount + localCount,
    foreign_count: foreignCount,
    local_count: localCount,
    gross: round2(totalGross),
    net: round2(totalNet),
    without_portal: withoutPortal,
  };

  return {
    period_start: periodStart,
    period_end: periodEnd,
    period_label: periodLabel,
    period_type: periodType,
    generated_at: new Date().toISOString(),
    summary: buildNarrativeSummary(periodType, periodLabel, companies, totals),
    insights: buildInsights(companies),
    warnings,
    companies,
    totals,
  };
}

export function flattenProposalLines(proposal: AiPayrollProposal): PayrollProposalLine[] {
  return proposal.companies.flatMap((c) => [...c.foreign_lines, ...c.local_lines]);
}

export function companyForLine(
  proposal: AiPayrollProposal,
  staffId: string
): CompanyPayrollProposal | undefined {
  return proposal.companies.find(
    (c) =>
      c.foreign_lines.some((l) => l.staff_id === staffId) ||
      c.local_lines.some((l) => l.staff_id === staffId)
  );
}

function sumNet(lines: PayrollProposalLine[]) {
  return round2(lines.reduce((s, l) => s + l.net_pay, 0));
}

function sumGross(lines: PayrollProposalLine[]) {
  return round2(lines.reduce((s, l) => s + l.gross_pay, 0));
}

export function recalculateCompanyTotals(company: CompanyPayrollProposal): CompanyPayrollProposal {
  const foreign_total_net = sumNet(company.foreign_lines);
  const local_total_net = sumNet(company.local_lines);
  return {
    ...company,
    foreign_total_net,
    local_total_net,
    total_net: round2(foreign_total_net + local_total_net),
    total_gross: sumGross([...company.foreign_lines, ...company.local_lines]),
  };
}

export function recalculateProposalTotals(proposal: AiPayrollProposal): AiPayrollProposal {
  const companies = proposal.companies.map(recalculateCompanyTotals);
  let foreignCount = 0;
  let localCount = 0;
  let gross = 0;
  let net = 0;

  for (const c of companies) {
    foreignCount += c.foreign_lines.length;
    localCount += c.local_lines.length;
    gross += c.total_gross;
    net += c.total_net;
  }

  return {
    ...proposal,
    companies,
    totals: {
      ...proposal.totals,
      staff_count: foreignCount + localCount,
      foreign_count: foreignCount,
      local_count: localCount,
      gross: round2(gross),
      net: round2(net),
    },
  };
}

export function applyProposalLineNetEdit(line: PayrollProposalLine, netPay: number): PayrollProposalLine {
  const net = round2(Math.max(0, netPay));
  if (line.worker_type === 'FOREIGN') {
    return {
      ...line,
      net_pay: net,
      gross_pay: net,
      shift_pay: round2(net - line.ot_pay),
      edited: true,
      pay_basis: `${line.pay_basis.replace(/ · disemak manual$/, '')} · disemak manual`,
    };
  }
  const deductions = line.epf + line.socso + line.eis;
  return {
    ...line,
    net_pay: net,
    gross_pay: round2(net + deductions),
    edited: true,
    pay_basis: `${line.pay_basis.replace(/ · disemak manual$/, '')} · disemak manual`,
  };
}

export function applyProposalLineGrossEdit(line: PayrollProposalLine, grossPay: number): PayrollProposalLine {
  const gross = round2(Math.max(0, grossPay));
  if (line.worker_type === 'FOREIGN') {
    return applyProposalLineNetEdit(line, gross);
  }
  const epf = round2(gross * 0.11);
  const socso = round2(Math.min(gross, 6000) * 0.005);
  const eis = round2(gross * 0.002);
  const net = round2(gross - epf - socso - eis);
  return {
    ...line,
    gross_pay: gross,
    net_pay: net,
    epf,
    socso,
    eis,
    basic_salary: line.pay_model === 'FIXED_RECORD' ? gross : line.basic_salary,
    edited: true,
    pay_basis: `${line.pay_basis.replace(/ · disemak manual$/, '')} · disemak manual`,
  };
}

export function updateProposalLine(
  proposal: AiPayrollProposal,
  staffId: string,
  field: 'net_pay' | 'gross_pay',
  value: number
): AiPayrollProposal {
  const companies = proposal.companies.map((company) => {
    const patch = (lines: PayrollProposalLine[]) =>
      lines.map((line) => {
        if (line.staff_id !== staffId) return line;
        return field === 'net_pay'
          ? applyProposalLineNetEdit(line, value)
          : applyProposalLineGrossEdit(line, value);
      });

    return recalculateCompanyTotals({
      ...company,
      foreign_lines: patch(company.foreign_lines),
      local_lines: patch(company.local_lines),
    });
  });

  return recalculateProposalTotals({ ...proposal, companies });
}
