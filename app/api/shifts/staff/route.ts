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
 requestedBranchId ?? profile.branch_id);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let query = supabase.from('staff').select('id, staff_code, full_name').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('full_name');

 query = applyBranchIdsFilter(query, 'branch_id', scope.branchIds);

 const { data } = await query;
 return NextResponse.json({ staff: data ?? [] });
}
