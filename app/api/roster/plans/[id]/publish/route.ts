import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { requireRosterManager, RosterError, rosterErrorResponse, rosterId, rosterScope, rosterWriteError } from '@/lib/roster/server';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 try {
  requireRosterManager(profile.role);
  const id = rosterId((await params).id, 'Jadual');
  const supabase: SupabaseClient = await createClient();
  const { data: plan, error: planError } = await supabase.from('weekly_roster_plans').select('branch_id')
   .eq('id', id).eq('organization_id', profile.organization_id).maybeSingle();
  if (planError) throw planError;
  if (!plan) throw new RosterError('Jadual di luar kawasan anda atau tidak dijumpai', 404);
  await rosterScope(supabase, profile, plan.branch_id);
  const { data, error } = await supabase.rpc('publish_weekly_roster', { p_plan_id: id });
  if (error) rosterWriteError(error);
  return NextResponse.json(data);
 } catch (error) {
  return rosterErrorResponse(error);
 }
}
