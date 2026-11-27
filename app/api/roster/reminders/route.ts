import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { rosterErrorResponse, rosterScope } from '@/lib/roster/server';
import {
 getRosterStatusForBranches,
 syncRosterReminders,
} from '@/lib/roster/queries';

export async function POST() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 if (profile.role !== 'AREA_MANAGER') {
 return NextResponse.json({ ok: true, sent: 0 });
 }

 try {
  const supabase = await createClient();
  const branchIds = await rosterScope(supabase, profile);
  const statuses = await getRosterStatusForBranches(supabase, profile.organization_id, branchIds ?? []);
  const result = await syncRosterReminders(supabase, profile.organization_id, profile.id, statuses);
  return NextResponse.json(result);
 } catch (error) {
  return rosterErrorResponse(error);
 }
}
