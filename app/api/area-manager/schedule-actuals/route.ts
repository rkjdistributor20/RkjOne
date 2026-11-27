import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { matchScheduleActuals } from '@/lib/roster/actuals';
import { requireRosterManager, rosterErrorResponse, rosterId, rosterScope, rosterWeek } from '@/lib/roster/server';
import { rosterTimestamp, shiftDateForWeek } from '@/lib/roster/week-utils';

const PAGE = 500;

async function loadPages<T>(
 page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
 const rows: T[] = [];
 for (let from = 0; ; from += PAGE) {
  const { data, error } = await page(from, from + PAGE - 1);
  if (error) throw error;
  rows.push(...(data ?? []));
  if (!data || data.length < PAGE) return rows;
 }
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 try {
  requireRosterManager(profile.role);
  const { searchParams } = new URL(request.url);
  const requestedBranch = searchParams.get('branch_id');
  const branchId = requestedBranch === null ? undefined : rosterId(requestedBranch, 'Cawangan');
  const week = rosterWeek(searchParams.get('week_start'));
  const nextWeek = shiftDateForWeek(week, 7);
  const supabase = await createClient();
  const branchIds = await rosterScope(supabase, profile, branchId);
  if (branchIds?.length === 0) return NextResponse.json({ actuals: [] });

  const actuals = await loadPages((from, to) => {
   // Existing operational view excludes verified trial shifts.
   const query = supabase.from('pos_operational_shifts')
    .select('id, branch_id, staff_id, shift_number, opened_at, closed_at')
    .eq('organization_id', profile.organization_id)
    .gte('opened_at', rosterTimestamp(week).toISOString())
    .lt('opened_at', rosterTimestamp(nextWeek).toISOString())
    .order('opened_at', { ascending: false }).order('id').range(from, to);
   return branchIds ? query.in('branch_id', branchIds) : query;
  });
  if (!actuals.length) return NextResponse.json({ actuals: [] });

  const actualBranchIds = [...new Set(actuals.map((row) => row.branch_id))];
  const staffIds = [...new Set(actuals.flatMap((row) => row.staff_id ? [row.staff_id] : []))];
  const [planned, branches, staff] = await Promise.all([
   loadPages((from, to) => supabase.from('staff_shifts')
    .select('id, branch_id, staff_id, shift_date, scheduled_start, scheduled_end')
    .eq('organization_id', profile.organization_id).in('branch_id', actualBranchIds).eq('status', 'APPROVED')
    .gte('shift_date', shiftDateForWeek(week, -1)).lt('shift_date', nextWeek)
    .order('shift_date').order('id').range(from, to)),
   supabase.from('branches').select('id, branch_code, branch_name')
    .eq('organization_id', profile.organization_id).in('id', actualBranchIds),
   staffIds.length ? supabase.from('staff').select('id, full_name')
    .eq('organization_id', profile.organization_id).in('id', staffIds)
    : Promise.resolve({ data: [], error: null }),
  ]);
  if (branches.error || staff.error) throw branches.error ?? staff.error;
  return NextResponse.json({
   actuals: matchScheduleActuals(actuals, planned,
    new Map(branches.data?.map((b) => [b.id, `${b.branch_code} · ${b.branch_name}`])),
    new Map(staff.data?.map((s) => [s.id, s.full_name]))),
  });
 } catch (error) {
  return rosterErrorResponse(error);
 }
}
