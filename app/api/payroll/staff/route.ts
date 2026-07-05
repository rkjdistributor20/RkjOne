import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let query = supabase.from('staff').select(
 'id, staff_code, full_name, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, branch:branches(branch_name, branch_code)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('full_name');

 query = applyBranchIdsFilter(query, 'branch_id', scope.branchIds);

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ staff: data ?? [] });
}
