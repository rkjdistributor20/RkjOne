import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getCompanyPayrollDashboard } from '@/lib/payroll/company-payroll';
import type { PayrollRule } from '@/lib/payroll/types';

const PAYROLL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'];

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!PAYROLL_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: rules, error: rulesErr } = await supabase
    .from('payroll_rules')
    .select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE');

  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

  const data = await getCompanyPayrollDashboard(
    supabase,
    profile.organization_id,
    (rules ?? []) as PayrollRule[]
  );
  return NextResponse.json(data);
}
