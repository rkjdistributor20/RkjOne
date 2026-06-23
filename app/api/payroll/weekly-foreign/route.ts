import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCompanyPayrollDashboard } from '@/lib/payroll/company-payroll';
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
  const week = body.period_start && body.period_end
    ? { period_start: body.period_start, period_end: body.period_end, label: `${body.period_start} — ${body.period_end}` }
    : getPreviousCompleteWeek();

  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: runResult, error: runErr } = await inventoryRpc(supabase, 'generate_payroll_run', {
    p_period_start: week.period_start,
    p_period_end: week.period_end,
    p_branch_id: body.branch_id ?? null,
  });

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 400 });

  const runId = (runResult as { run_id?: string })?.run_id;
  if (runId) {
    await (service as SupabaseClient)
      .from('payroll_runs')
      .update({ report_type: 'WEEKLY_FOREIGN' })
      .eq('id', runId);
  }

  const { data: rules } = await supabase
    .from('payroll_rules')
    .select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE');

  const companyData = await getCompanyPayrollDashboard(
    service,
    profile.organization_id,
    (rules ?? []) as PayrollRule[]
  );

  const foreignByBranch = companyData.companies.flatMap((company) =>
    company.staff
      .filter((s) => s.worker_type === 'FOREIGN')
      .map((s) => ({
        syarikat: company.code,
        cawangan: s.branch_name ?? '—',
        kod_staf: s.staff_code,
        nama: s.full_name,
        shift_jam: s.shift_hours,
        hari_minggu: s.shifts_per_week,
        gaji_mingguan: s.weekly_amount ?? s.computed_weekly,
      }))
  );

  return NextResponse.json({
    result: runResult,
    week,
    report_type: 'WEEKLY_FOREIGN',
    foreign_workers: foreignByBranch.length,
    branch_report: foreignByBranch,
    companies: companyData.companies.map((c) => ({
      code: c.code,
      legal_name: c.legal_name,
      foreign_count: c.foreign_count,
      weekly_total: c.weekly_payroll_total,
    })),
  });
}
