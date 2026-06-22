import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
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

  const supabase = await createClient();
  const scope = await resolveScopedBranches(supabase, profile);
  const branchIds = scope.branchIds ?? [];

  const statuses = await getRosterStatusForBranches(
    supabase,
    profile.organization_id,
    branchIds
  );

  const result = await syncRosterReminders(
    supabase,
    profile.organization_id,
    profile.id,
    statuses
  );

  return NextResponse.json(result);
}
