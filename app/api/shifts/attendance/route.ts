import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const requestedBranchId = new URL(request.url).searchParams.get('branch_id');
  const supabase = await createClient();

  let scope;
  try {
    scope = await resolveScopedBranches(
      supabase,
      profile,
      requestedBranchId ?? profile.branch_id
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }

  let query = supabase
    .from('attendance_records')
    .select(`
      id, attendance_date, clock_in, clock_out, hours_worked, ot_hours,
      staff:staff(staff_code, full_name)
    `)
    .eq('organization_id', profile.organization_id)
    .order('attendance_date', { ascending: false })
    .limit(50);

  query = applyBranchIdsFilter(query, 'branch_id', scope.branchIds);

  const { data } = await query;
  return NextResponse.json({ attendance: data ?? [] });
}
