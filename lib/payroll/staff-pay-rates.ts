import type { PayrollRule } from './types';

export const DEFAULT_SHIFTS_PER_WEEK = 6;

export function getForeignShiftTiers(rules: PayrollRule[]) {
  return rules
    .filter(
      (r) =>
        r.worker_type === 'FOREIGN' &&
        r.period === 'PER_SHIFT' &&
        r.shift_hours != null &&
        r.status === 'ACTIVE'
    )
    .sort((a, b) => (a.shift_hours ?? 0) - (b.shift_hours ?? 0));
}

export function computeForeignWeeklyPay(
  rules: PayrollRule[],
  shiftHours: number,
  shiftsPerWeek: number
) {
  const tier = getForeignShiftTiers(rules).find((r) => r.shift_hours === shiftHours);
  const perShift = tier?.rate ?? 0;
  const weekly = Math.round(perShift * shiftsPerWeek * 100) / 100;
  return {
    perShift,
    weekly,
    component: tier?.component ?? '',
    shiftHours,
    shiftsPerWeek,
  };
}

export function computeLocalMonthlyPay(rules: PayrollRule[]) {
  const monthly = rules.filter(
    (r) =>
      r.worker_type === 'LOCAL' &&
      r.period === 'MONTHLY' &&
      r.rate != null &&
      r.status === 'ACTIVE'
  );
  const breakdown = monthly.map((r) => ({
    component: r.component,
    amount: r.rate ?? 0,
  }));
  const total = Math.round(breakdown.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return { breakdown, total };
}

export function formatPayAmount(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function workerTypeLabel(type: 'LOCAL' | 'FOREIGN' | null | undefined) {
  if (type === 'LOCAL') return 'Staf Tempatan';
  if (type === 'FOREIGN') return 'Pekerja Asing';
  return 'Belum ditetapkan';
}

export function workerTypePayPeriod(type: 'LOCAL' | 'FOREIGN' | null | undefined) {
  if (type === 'LOCAL') return 'Bulanan';
  if (type === 'FOREIGN') return 'Mingguan';
  return null;
}

export function inferWorkerType(staff: {
  worker_type?: 'LOCAL' | 'FOREIGN' | null;
  weekly_amount?: number | null;
  monthly_amount?: number | null;
}): 'LOCAL' | 'FOREIGN' {
  if (staff.worker_type === 'LOCAL') return 'LOCAL';
  if (staff.worker_type === 'FOREIGN') return 'FOREIGN';
  if (staff.monthly_amount != null && Number(staff.monthly_amount) > 0) return 'LOCAL';
  // Semua staf kiosk berdaftar ialah pekerja asing
  return 'FOREIGN';
}

export function staffPayDisplay(staff: {
  worker_type?: 'LOCAL' | 'FOREIGN' | null;
  weekly_amount?: number | null;
  monthly_amount?: number | null;
  shift_hours?: number | null;
  shifts_per_week?: number | null;
}): string | null {
  const type = inferWorkerType(staff);
  if (type === 'LOCAL' && staff.monthly_amount != null) {
    return `${formatPayAmount(Number(staff.monthly_amount))}/bulan`;
  }
  if (type === 'FOREIGN' && staff.weekly_amount != null) {
    const tier = staff.shift_hours != null ? ` · ${staff.shift_hours}j/shift` : '';
    const days =
      staff.shifts_per_week != null ? ` · ${staff.shifts_per_week} hari/mgg` : '';
    return `${formatPayAmount(Number(staff.weekly_amount))}/minggu${tier}${days}`;
  }
  if (type === 'FOREIGN') {
    return 'Gaji mingguan (pekerja asing)';
  }
  return null;
}
