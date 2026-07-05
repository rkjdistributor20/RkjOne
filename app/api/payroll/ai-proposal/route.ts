import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { generateAiPayrollProposal, type ProposalPeriodType } from '@/lib/payroll/ai-proposal';
import { getPreviousCompleteMonth } from '@/lib/payroll/period-ranges';
import { getPreviousCompleteWeek } from '@/lib/payroll/weekly-report';
import type { PayrollRule } from '@/lib/payroll/types';

const PAYROLL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'];

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!PAYROLL_ROLES.includes(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const url = new URL(request.url);
 const periodType = (url.searchParams.get('period_type') ?? 'WEEKLY') as ProposalPeriodType;
 const customStart = url.searchParams.get('period_start');
 const customEnd = url.searchParams.get('period_end');

 const period =
 customStart && customEnd
 ? {
 period_start: customStart,
 period_end: customEnd,
 label: `${customStart} - ${customEnd}`,
 }
 : periodType === 'MONTHLY'
 ? getPreviousCompleteMonth()
 : getPreviousCompleteWeek();

 const supabase = await createClient();
 const service = await createServiceClient();

 const { data: rules, error: rulesErr } = await supabase.from('payroll_rules').select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE');

 if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

 const proposal = await generateAiPayrollProposal(
 service,
 profile.organization_id,
 (rules ?? []) as PayrollRule[],
 period.period_start,
 period.period_end,
 period.label,
 periodType);

 return NextResponse.json({ proposal });
}

export async function POST(request: Request) {
 return GET(
 new Request(request.url, {
 method: 'GET',
 headers: request.headers,
 }));
}
