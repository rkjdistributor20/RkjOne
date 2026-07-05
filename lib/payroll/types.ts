export type WorkerType = 'FOREIGN' | 'LOCAL';
export type PayrollPeriod = 'PER_SHIFT' | 'HOURLY' | 'MONTHLY' | 'ONE_TIME';

export interface PayrollRule {
 id: string;
 rule_code: string;
 worker_type: WorkerType;
 component: string;
 rate: number | null;
 period: PayrollPeriod;
 shift_hours: number | null;
 status: string;
 notes: string | null;
}

export interface CommissionTier {
 id: string;
 tier_from: number;
 tier_to: number | null;
 commission_amount: number;
 formula_description: string | null;
 status: string;
}

export interface PayrollLineItem {
 id: string;
 staff_id: string;
 worker_type: WorkerType;
 basic_salary: number;
 attendance_allowance: number;
 shift_pay: number;
 ot_pay: number;
 commission: number;
 contract_bonus: number;
 epf: number;
 socso: number;
 eis: number;
 kiosk_excess_minutes?: number | null;
 kiosk_deduction?: number | null;
 gross_pay: number;
 net_pay: number;
 sales_total: number | null;
 hours_worked: number | null;
 ot_hours: number | null;
 staff: { staff_code: string; full_name: string; branch?: { branch_name: string } | null };
}

export interface PayrollRun {
 id: string;
 run_number: string;
 period_start: string;
 period_end: string;
 status: string;
 total_gross: number;
 total_deductions: number;
 total_net: number;
 created_at: string;
 payroll_line_items?: PayrollLineItem[];
}

export interface PayrollStaffRow {
 id: string;
 staff_code: string;
 full_name: string;
 worker_type: WorkerType | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 branch: { branch_name: string; branch_code?: string } | null;
}
