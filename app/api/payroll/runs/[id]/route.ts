import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

const RUN_SELECT = `
 id, run_number, period_start, period_end, status,
 total_gross, total_deductions, total_net, created_at,
 payroll_line_items(
 id, staff_id, worker_type, basic_salary, attendance_allowance,
 shift_pay, ot_pay, commission, contract_bonus, epf, socso, eis,
 gross_pay, net_pay, sales_total, hours_worked, ot_hours,
 staff:staff(staff_code, full_name, branch:branches(branch_name)))
`;

export async function GET(
 _request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await params;
 const supabase = await createClient();

 const { data, error } = await supabase.from('payroll_runs').select(RUN_SELECT).eq('id', id).single();

 if (error) return NextResponse.json({ error: error.message }, { status: 404 });
 return NextResponse.json({ run: data });
}
