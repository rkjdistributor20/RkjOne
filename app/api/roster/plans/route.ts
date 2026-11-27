import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { loadRosterPlanner } from '@/lib/roster/queries';
import {
 requireRosterManager, rosterErrorResponse, rosterId, rosterSavePayload, rosterScope, rosterWeek, rosterWriteError,
} from '@/lib/roster/server';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 try {
  requireRosterManager(profile.role);
  const { searchParams } = new URL(request.url);
  const branchId = rosterId(searchParams.get('branch_id'), 'Cawangan');
  const weekStart = rosterWeek(searchParams.get('week_start'));
  const supabase = await createClient();
  await rosterScope(supabase, profile, branchId);
  return NextResponse.json(await loadRosterPlanner(supabase, profile.organization_id, branchId, weekStart));
 } catch (error) {
  return rosterErrorResponse(error);
 }
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 try {
  requireRosterManager(profile.role);
  const { branchId, weekStart, copyFrom, entries } = rosterSavePayload(await request.json());
  const supabase = await createClient();
  await rosterScope(supabase, profile, branchId);
  const { data: planId, error } = await (supabase as SupabaseClient).rpc('save_weekly_roster', {
   p_branch_id: branchId, p_week_start: weekStart, p_entries: entries, p_copy_from_week: copyFrom,
  });
  if (error) rosterWriteError(error);
  return NextResponse.json({ plan_id: planId });
 } catch (error) {
  return rosterErrorResponse(error);
 }
}
