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

export type CompanyPayrollStaffRow = {
 id: string;
 staff_code: string;
 full_name: string;
 worker_type: 'LOCAL' | 'FOREIGN';
 branch_code: string | null;
 branch_name: string | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 computed_weekly: number | null;
 computed_monthly: number | null;
 pay_label: string | null;
};

export type CompanyPayrollGroup = {
 id: string;
 code: LegalEntityCode;
 legal_name: string;
 scope: string | null;
 foreign_count: number;
 local_count: number;
 weekly_payroll_total: number;
 monthly_payroll_total: number;
 staff: CompanyPayrollStaffRow[];
};

export type CompanyPayrollDashboard = {
 companies: CompanyPayrollGroup[];
 summary: {
 total_staff: number;
 foreign_staff: number;
 local_staff: number;
 weekly_total: number;
 monthly_total: number;
 };
 rules_applied: boolean;
};

type StaffDbRow = {
 id: string;
 staff_code: string;
 full_name: string;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 legal_entity_id: string | null;
 branch: { branch_code: string; branch_name: string } | { branch_code: string; branch_name: string }[] | null;
 legal_entity: { id: string; code: string; legal_name: string; scope: string | null } | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
 if (Array.isArray(v)) return v[0] ?? null;
 return v ?? null;
}

export async function getCompanyPayrollDashboard(
 supabase: SupabaseClient,
 organizationId: string,
 rules: PayrollRule[]): Promise<CompanyPayrollDashboard> {
 const { data: legalRows } = await supabase.from('legal_entities').select('id, code, name, legal_name, scope, sort_order').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('sort_order');

 const { data: staffRows, error } = await supabase.from('staff').select(
 'id, staff_code, full_name, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, legal_entity_id, branch:branches(branch_code, branch_name), legal_entity:legal_entities(id, code, legal_name, scope)').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('staff_code');

 if (error) throw new Error(error.message);

 const companies = new Map<string, CompanyPayrollGroup>();
 for (const entity of legalRows ?? []) {
 const code = entity.code as LegalEntityCode;
 companies.set(entity.id, {
 id: entity.id,
 code,
 legal_name: legalEntityLabel(code, entity.legal_name),
 scope: entity.scope,
 foreign_count: 0,
 local_count: 0,
 weekly_payroll_total: 0,
 monthly_payroll_total: 0,
 staff: [],
 });
 }

 let totalStaff = 0;
 let foreignStaff = 0;
 let localStaff = 0;
 let weeklyTotal = 0;
 let monthlyTotal = 0;

 for (const row of (staffRows ?? []) as unknown as StaffDbRow[]) {
 const branch = one(row.branch);
 const entity = row.legal_entity ?? (row.legal_entity_id ? companies.get(row.legal_entity_id) : null);
 const companyId = entity && 'id' in entity ? entity.id : row.legal_entity_id;
 const group = companyId ? companies.get(companyId) : null;
 if (!group) continue;

 const workerType = inferWorkerType(row);
 const companyCode = (entity && 'code' in entity ? entity.code : group.code) as LegalEntityCode;
 let computedWeekly: number | null = null;
 let computedMonthly: number | null = null;

 if (workerType === 'FOREIGN' && row.shift_hours != null) {
 const pay = computeForeignWeeklyPay(
 rules,
 Number(row.shift_hours),
 row.shifts_per_week ?? DEFAULT_SHIFTS_PER_WEEK);
 computedWeekly = pay.weekly;
 }
 if (workerType === 'LOCAL') {
 computedMonthly = usesRetailLocalPayRules(companyCode)
 ? computeLocalMonthlyPay(rules).total
 : row.monthly_amount != null
 ? Number(row.monthly_amount)
 : null;
 }

 const weeklyAmt =
 workerType === 'FOREIGN'
 ? Number(row.weekly_amount ?? computedWeekly ?? 0)
 : 0;
 const monthlyAmt =
 workerType === 'LOCAL'
 ? Number(row.monthly_amount ?? computedMonthly ?? 0)
 : 0;

 const staffRow: CompanyPayrollStaffRow = {
 id: row.id,
 staff_code: row.staff_code,
 full_name: row.full_name,
 worker_type: workerType,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 shift_hours: row.shift_hours,
 shifts_per_week: row.shifts_per_week,
 weekly_amount: row.weekly_amount,
 monthly_amount: row.monthly_amount,
 computed_weekly: computedWeekly,
 computed_monthly: computedMonthly,
 pay_label: staffPayDisplay(row),
 };

 group.staff.push(staffRow);
 if (workerType === 'FOREIGN') {
 group.foreign_count += 1;
 group.weekly_payroll_total += weeklyAmt;
 foreignStaff += 1;
 weeklyTotal += weeklyAmt;
 } else {
 group.local_count += 1;
 group.monthly_payroll_total += monthlyAmt;
 localStaff += 1;
 monthlyTotal += monthlyAmt;
 }
 totalStaff += 1;
 }

 const companyList = [...companies.values()].map((c) => ({...c,
 weekly_payroll_total: Math.round(c.weekly_payroll_total * 100) / 100,
 monthly_payroll_total: Math.round(c.monthly_payroll_total * 100) / 100,
 staff: c.staff.sort((a, b) => a.full_name.localeCompare(b.full_name)),
 })).sort(
 (a, b) =>
 LEGAL_ENTITIES.findIndex((e) => e.code === a.code) -
 LEGAL_ENTITIES.findIndex((e) => e.code === b.code));

 return {
 companies: companyList,
 summary: {
 total_staff: totalStaff,
 foreign_staff: foreignStaff,
 local_staff: localStaff,
 weekly_total: Math.round(weeklyTotal * 100) / 100,
 monthly_total: Math.round(monthlyTotal * 100) / 100,
 },
 rules_applied: rules.length > 0,
 };
}
