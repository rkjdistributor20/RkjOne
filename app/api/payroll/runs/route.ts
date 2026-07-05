import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

const RUN_SELECT = `
 id, run_number, period_start, period_end, status,
 total_gross, total_deductions, total_net, created_at,
 payroll_line_items(
 id, staff_id, worker_type, basic_salary, attendance_allowance,
 shift_pay, ot_pay, commission, contract_bonus, epf, socso, eis,
 kiosk_excess_minutes, kiosk_deduction,
 gross_pay, net_pay, sales_total, hours_worked, ot_hours,
 staff:staff(staff_code, full_name, branch:branches(branch_name)))
`;

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('payroll_runs').select(RUN_SELECT).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(20);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ runs: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'generate_payroll_run', {
 p_period_start: body.period_start,
 p_period_end: body.period_end,
 p_branch_id: body.branch_id ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
