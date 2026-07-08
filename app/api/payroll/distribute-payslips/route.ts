import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import {
 generateAiPayrollProposal,
 type AiPayrollProposal,
 type ProposalPeriodType,
} from '@/lib/payroll/ai-proposal';
import { distributePayslipsFromProposal } from '@/lib/payroll/distribute-payslips';
import { getPreviousCompleteMonth } from '@/lib/payroll/period-ranges';
import { getPreviousCompleteWeek } from '@/lib/payroll/weekly-report';
import type { PayrollRule } from '@/lib/payroll/types';

const PAYROLL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!PAYROLL_ROLES.includes(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const body = await request.json().catch(() => ({}));
 const periodType = (body.period_type ?? 'WEEKLY') as ProposalPeriodType;
 const createRun = body.create_payroll_run !== false;

 const period =
 body.period_start && body.period_end
 ? {
 period_start: body.period_start,
 period_end: body.period_end,
 label: body.period_label ?? `${body.period_start} - ${body.period_end}`,
 }
 : periodType === 'MONTHLY'
 ? getPreviousCompleteMonth()
 : getPreviousCompleteWeek();

 const supabase = await createClient();
 const service = await createServiceClient();

 const { data: rules, error: rulesErr } = await supabase.from('payroll_rules').select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE');

 if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

 const proposal: AiPayrollProposal =
 body.proposal ??
 (await generateAiPayrollProposal(
 service,
 profile.organization_id,
 (rules ?? []) as PayrollRule[],
 period.period_start,
 period.period_end,
 period.label,
 periodType));

 let payrollRunId: string | null = null;
 if (createRun) {
 const { data: runResult, error: runErr } = await inventoryRpc(supabase, 'generate_payroll_run', {
 p_period_start: period.period_start,
 p_period_end: period.period_end,
 p_branch_id: body.branch_id ?? null,
 });
 if (runErr) return NextResponse.json({ error: runErr.message }, { status: 400 });
 payrollRunId = (runResult as { run_id?: string })?.run_id ?? null;
 if (payrollRunId) {
 await (service as SupabaseClient).from('payroll_runs').update({
 report_type: periodType === 'WEEKLY' ? 'WEEKLY_FOREIGN' : 'MONTHLY_LOCAL',
 }).eq('id', payrollRunId);
 }
 }

 const result = await distributePayslipsFromProposal(
 service,
 profile.organization_id,
 proposal,
 profile.id,
 payrollRunId);

 return NextResponse.json({
 proposal_summary: proposal.summary,
 period,
 period_type: periodType,
 payroll_run_id: payrollRunId,...result,
 });
}
