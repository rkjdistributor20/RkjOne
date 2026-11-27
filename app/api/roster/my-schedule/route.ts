import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getStaffScheduleForProfile } from '@/lib/roster/queries';
import { rosterErrorResponse, rosterWeek } from '@/lib/roster/server';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
  const requested = new URL(request.url).searchParams.get('week_start');
  const weekStart = requested === null ? undefined : rosterWeek(requested);
  const supabase = await createClient();
  const schedule = await getStaffScheduleForProfile(supabase, profile.id, profile.organization_id, weekStart);
  return NextResponse.json(schedule ? { schedule } : {
   schedule: null,
   message: 'Rekod staf tidak dijumpai - hubungi pengurus',
  });
 } catch (error) {
  return rosterErrorResponse(error);
 }
}
