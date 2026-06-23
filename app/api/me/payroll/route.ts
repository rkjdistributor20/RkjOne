import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getMyPayrollDashboard } from '@/lib/payroll/my-payroll';
import type { PayrollRule } from '@/lib/payroll/types';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  const { data: rules, error: rulesErr } = await service
    .from('payroll_rules')
    .select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE');

  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

  const data = await getMyPayrollDashboard(
    service,
    profile.id,
    profile.organization_id,
    (rules ?? []) as PayrollRule[]
  );

  for (const slip of data.payslips) {
    const row = data.payslips.find((p) => p.id === slip.id);
    if (!row) continue;
    const { data: meta } = await (service as SupabaseClient)
      .from('staff_payslips')
      .select('storage_path')
      .eq('id', slip.id)
      .maybeSingle();
    if (meta?.storage_path) {
      const { data: signed } = await service.storage
        .from('staff-payslips')
        .createSignedUrl(meta.storage_path, 3600);
      slip.download_url = signed?.signedUrl ?? null;
    }
  }

  return NextResponse.json({ payroll: data });
}
