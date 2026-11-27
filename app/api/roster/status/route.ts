import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getRosterStatusForBranches } from '@/lib/roster/queries';
import { getNextWeekStart } from '@/lib/roster/week-utils';
import { requireRosterManager, rosterErrorResponse, rosterScope, rosterWeek } from '@/lib/roster/server';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
  requireRosterManager(profile.role);
  const weekStart = rosterWeek(new URL(request.url).searchParams.get('week_start') ?? getNextWeekStart());
  const supabase = await createClient();
  const branchIds = await rosterScope(supabase, profile);
  const statuses = await getRosterStatusForBranches(supabase, profile.organization_id, branchIds, weekStart);
  return NextResponse.json({ week_start: weekStart, branches: statuses });
 } catch (error) {
  return rosterErrorResponse(error);
 }
}
