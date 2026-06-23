import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import type { CommissionTier, PayrollRule } from '@/lib/payroll/types';
import { periodDays } from '@/lib/payroll/period-ranges';
import { computeLocalMonthlyPay } from '@/lib/payroll/staff-pay-rates';

/** Staf jualan kiosk Roti Kaya Junus — gaji ikut peraturan PR + komisen POS */
export function usesRetailLocalPayRules(companyCode: string | null | undefined): boolean {
  return companyCode === 'RKJ';
}

export function roundPay(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcStatutoryDeductions(gross: number) {
  const epf = roundPay(gross * 0.11);
  const socso = roundPay(Math.min(gross, 6000) * 0.005);
  const eis = roundPay(gross * 0.002);
  return { epf, socso, eis, net: roundPay(gross - epf - socso - eis) };
}

function calcCommission(tiers: CommissionTier[], sales: number): number {
  const match = tiers
    .filter((t) => t.status === 'ACTIVE' && sales >= t.tier_from && (t.tier_to == null || sales <= t.tier_to))
    .sort((a, b) => b.tier_from - a.tier_from)[0];
  return match?.commission_amount ?? 0;
}

export type LocalPayComputation = {
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
  pay_model: 'RETAIL_RULES' | 'FIXED_RECORD';
};

/** Gaji tempatan RKJ — peraturan payroll + komisen jualan */
export function computeRkjSalesLocalPay(
  rules: PayrollRule[],
  tiers: CommissionTier[],
  sales: number,
  periodStart: string,
  periodEnd: string
): LocalPayComputation {
  const localPay = computeLocalMonthlyPay(rules);
  const days = periodDays(periodStart, periodEnd);
  const basicRule = localPay.breakdown.find((b) => b.component.includes('Pokok'));
  const allowanceRule = localPay.breakdown.find((b) => b.component.includes('Elaun'));
  const basic = roundPay((basicRule?.amount ?? 0) * (days / 30));
  const allowance = allowanceRule?.amount ?? 0;
  const commission = calcCommission(tiers, sales);
  const gross = roundPay(basic + allowance + commission);
  const { epf, socso, eis, net } = calcStatutoryDeductions(gross);

  return {
    basic_salary: basic,
    attendance_allowance: allowance,
    shift_pay: 0,
    ot_pay: 0,
    commission,
    epf,
    socso,
    eis,
    gross_pay: gross,
    net_pay: net,
    pay_basis: `Staf jualan RKJ — gaji pokok + elaun + komisen (jualan RM ${sales.toFixed(2)})`,
    pay_model: 'RETAIL_RULES',
  };
}

/** Gaji tempatan RKJ Distributor / Manufacturing — ikut monthly_amount rekod staf */
export function computeFixedCompanyLocalPay(
  companyCode: LegalEntityCode,
  monthlyAmount: number | null,
  periodStart: string,
  periodEnd: string
): LocalPayComputation {
  const days = periodDays(periodStart, periodEnd);
  const monthly = Number(monthlyAmount ?? 0);
  const basic = roundPay(monthly * (days / 30));
  const gross = basic;
  const { epf, socso, eis, net } = calcStatutoryDeductions(gross);
  const label =
    companyCode === 'RKJ_DIST'
      ? 'RKJ Distributor Sdn Bhd'
      : 'Roti Kaya Junus Manufacturing Sdn Bhd';

  return {
    basic_salary: basic,
    attendance_allowance: 0,
    shift_pay: 0,
    ot_pay: 0,
    commission: 0,
    epf,
    socso,
    eis,
    gross_pay: gross,
    net_pay: net,
    pay_basis: `${label} — gaji bulanan rekod RM ${monthly.toFixed(2)}`,
    pay_model: 'FIXED_RECORD',
  };
}
