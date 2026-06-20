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
      { status: 403 }
    );
  }

  let query = supabase
    .from('branches')
    .select('id, branch_code, branch_name, status, region:regions(name, manager_name)')
    .eq('organization_id', profile.organization_id)
    .order('branch_code');

  query = applyBranchIdsFilter(query, 'id', scope.branchIds);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branches: data ?? [] });
}
