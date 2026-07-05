import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { getRosterStatusForBranches } from '@/lib/roster/queries';
import { getNextWeekStart } from '@/lib/roster/week-utils';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const weekStart =
 new URL(request.url).searchParams.get('week_start') ?? getNextWeekStart();

 const supabase = await createClient();
 const scope = await resolveScopedBranches(supabase, profile);
 const branchIds = scope.branchIds ?? [];

 const statuses = await getRosterStatusForBranches(
 supabase,
 profile.organization_id,
 branchIds,
 weekStart);

 return NextResponse.json({ week_start: weekStart, branches: statuses });
}
