import type { SupabaseClient } from '@supabase/supabase-js';
import {
 daysUntilDeadline,
 getNextWeekStart,
 getThisWeekStart,
 malaysiaRosterDate,
 formatWeekRange,
 isRosterOverdue,
 shiftDateForWeek,
 DAY_LABELS_FULL,
 shouldRemindRoster,
} from '@/lib/roster/week-utils';
import type { RosterBranchStatus, RosterPlannerData, RosterPlanRow, StaffScheduleWeek } from '@/lib/roster/types';

const WORK_DAYS = 7;

export async function loadRosterPlanner(
 supabase: SupabaseClient,
 orgId: string,
 branchId: string,
 weekStart: string,
): Promise<RosterPlannerData> {
 const [planRes, staffRes, templatesRes] = await Promise.all([
  supabase.from('weekly_roster_plans').select('id, branch_id, week_start_date, status, published_at')
   .eq('organization_id', orgId).eq('branch_id', branchId).eq('week_start_date', weekStart).maybeSingle(),
  supabase.from('staff').select('id, staff_code, full_name')
   .eq('organization_id', orgId).eq('branch_id', branchId).eq('status', 'ACTIVE').order('full_name'),
  supabase.from('shift_templates').select('id, name, start_time, end_time')
   .eq('organization_id', orgId).eq('status', 'ACTIVE').order('name'),
 ]);
 if (planRes.error || staffRes.error || templatesRes.error) throw planRes.error ?? staffRes.error ?? templatesRes.error;
 const plan = planRes.data as Omit<RosterPlanRow, 'entries'> | null;
 let entries: RosterPlanRow['entries'] = [];
 if (plan) {
  const res = await supabase.from('weekly_roster_entries')
   .select('id, plan_id, staff_id, day_index, is_off, template_id, scheduled_start, scheduled_end, notes')
   .eq('plan_id', plan.id).order('day_index');
  if (res.error) throw res.error;
  entries = res.data;
 }
 return { plan: plan ? { ...plan, entries } : null, staff: staffRes.data, templates: templatesRes.data };
}

export async function getRosterStatusForBranches(
 supabase: SupabaseClient,
 orgId: string,
 branchIds: string[] | null,
 weekStart?: string): Promise<RosterBranchStatus[]> {
 if (branchIds?.length === 0) return [];

 const targetWeek = weekStart ?? getNextWeekStart();

 const plansQuery = supabase.from('weekly_roster_plans').select('id, branch_id, status')
  .eq('organization_id', orgId).eq('week_start_date', targetWeek);
 const { data: plansData, error: plansError } = await (branchIds ? plansQuery.in('branch_id', branchIds) : plansQuery);
 if (plansError) throw plansError;

 const planIds = (plansData ?? []).map((p) => p.id);

 const branchesQuery = supabase.from('branches').select('id, branch_code, branch_name')
  .eq('organization_id', orgId).eq('status', 'ACTIVE').order('branch_code');
 const staffQuery = supabase.from('staff').select('branch_id').eq('organization_id', orgId).eq('status', 'ACTIVE');
 const [branchesRes, staffRes, entriesRes] = await Promise.all([
 branchIds ? branchesQuery.in('id', branchIds) : branchesQuery,
 branchIds ? staffQuery.in('branch_id', branchIds) : staffQuery,
 planIds.length
 ? supabase.from('weekly_roster_entries').select('plan_id').in('plan_id', planIds)
 : Promise.resolve({ data: [] as { plan_id: string }[], error: null }),
 ]);
 if (branchesRes.error || staffRes.error || entriesRes.error) {
  throw branchesRes.error ?? staffRes.error ?? entriesRes.error;
 }

 const planMap = new Map((plansData ?? []).map((p) => [p.branch_id, p]));
 const staffCount = new Map<string, number>();
 for (const s of staffRes.data ?? []) {
 if (!s.branch_id) continue;
 staffCount.set(s.branch_id, (staffCount.get(s.branch_id) ?? 0) + 1);
 }

 const entryCount = new Map<string, number>();
 for (const e of entriesRes.data ?? []) {
 entryCount.set(e.plan_id, (entryCount.get(e.plan_id) ?? 0) + 1);
 }

 return (branchesRes.data ?? []).map((b) => {
 const plan = planMap.get(b.id);
 const sc = staffCount.get(b.id) ?? 0;
 const expected = sc * WORK_DAYS;
 const ec = plan ? (entryCount.get(plan.id) ?? 0) : 0;
 const status = plan?.status ?? 'MISSING';

 return {
 branch_id: b.id,
 branch_code: b.branch_code,
 branch_name: b.branch_name,
 week_start_date: targetWeek,
 status: status as RosterBranchStatus['status'],
 staff_count: sc,
 entries_count: ec,
 expected_entries: expected,
 is_complete: status === 'PUBLISHED' || (ec >= expected && expected > 0),
 days_until_deadline: daysUntilDeadline(targetWeek),
 is_overdue: isRosterOverdue(targetWeek),
 };
 });
}

export async function getStaffScheduleForProfile(
 supabase: SupabaseClient,
 profileId: string,
 orgId: string,
 weekStart?: string): Promise<StaffScheduleWeek | null> {
 const { data: staffRow, error: staffError } = await supabase.from('staff')
  .select('id, branch_id, branch:branches(branch_code, branch_name)')
  .eq('profile_id', profileId).eq('organization_id', orgId).eq('status', 'ACTIVE').maybeSingle();
 if (staffError) throw staffError;

 if (!staffRow) return null;

 const week = weekStart ?? getThisWeekStart();
 const branchRaw = staffRow.branch;
 const branch = (Array.isArray(branchRaw) ? branchRaw[0] : branchRaw) as {
 branch_code: string;
 branch_name: string;
 } | null;

 const { data: plan, error: planError } = staffRow.branch_id
  ? await supabase.from('weekly_roster_plans').select('id, status, week_start_date')
   .eq('organization_id', orgId).eq('branch_id', staffRow.branch_id).eq('week_start_date', week).eq('status', 'PUBLISHED').maybeSingle()
  : { data: null, error: null };
 if (planError) throw planError;

 const days: StaffScheduleWeek['days'] = Array.from({ length: WORK_DAYS }, (_, i) => ({
 day_index: i,
 day_label: DAY_LABELS_FULL[i],
 shift_date: shiftDateForWeek(week, i),
 is_off: null,
 template_name: null,
 scheduled_start: null,
 scheduled_end: null,
 notes: null,
 }));

 if (plan) {
 const { data: entries, error } = await supabase.from('weekly_roster_entries').select(
 `
 day_index, is_off, scheduled_start, scheduled_end, notes,
 template:shift_templates(name, start_time, end_time)
 `).eq('plan_id', plan.id).eq('staff_id', staffRow.id);
 if (error) throw error;

 for (const e of entries ?? []) {
 const slot = days[e.day_index];
 if (!slot) continue;
 slot.is_off = e.is_off;
 slot.notes = e.notes;
 const tplRaw = e.template;
 const tpl = (Array.isArray(tplRaw) ? tplRaw[0] : tplRaw) as {
  name: string; start_time: string | null; end_time: string | null;
 } | null;
 slot.scheduled_start = e.is_off ? null : e.scheduled_start ?? tpl?.start_time ?? null;
 slot.scheduled_end = e.is_off ? null : e.scheduled_end ?? tpl?.end_time ?? null;
 slot.template_name = e.is_off ? null : tpl?.name ?? null;
 }
 }

 return {
 week_start_date: week,
 week_range: formatWeekRange(week),
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 status: plan?.status ?? null,
 days,
 };
}

export async function syncRosterReminders(
 supabase: SupabaseClient,
 orgId: string,
 managerProfileId: string,
 branchStatuses: RosterBranchStatus[]) {
 const today = malaysiaRosterDate();
 const targetWeek = branchStatuses[0]?.week_start_date ?? getNextWeekStart();

 if (!shouldRemindRoster(targetWeek)) return { sent: 0 };

 const pending = branchStatuses.filter(
 (b) => b.status !== 'PUBLISHED' && b.staff_count > 0);
 if (!pending.length) return { sent: 0 };

 let sent = 0;
 for (const b of pending) {
 const { data: existing } = await supabase.from('weekly_roster_reminder_log').select('id').eq('branch_id', b.branch_id).eq('week_start_date', targetWeek).eq('reminder_date', today).maybeSingle();

 if (existing) continue;

 const urgency = b.is_overdue
 ? 'LEWAT'
 : b.days_until_deadline <= 1
 ? 'ESOK DEADLINE'
 : `${b.days_until_deadline} hari lagi`;

 await supabase.from('notifications').insert({
 organization_id: orgId,
 recipient_id: managerProfileId,
 type: 'ROSTER_DUE',
 title: `Jadual staf ${b.branch_code} belum siap`,
 message: `Minggu ${formatWeekRange(targetWeek)} - ${urgency}. Siapkan sebelum Ahad.`,
 link: `/shifts?tab=roster&branch=${b.branch_id}&week=${targetWeek}`,
 });

 await supabase.from('weekly_roster_reminder_log').insert({
 organization_id: orgId,
 branch_id: b.branch_id,
 week_start_date: targetWeek,
 manager_profile_id: managerProfileId,
 reminder_date: today,
 });

 sent += 1;
 }

 return { sent };
}
