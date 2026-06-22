import type { SupabaseClient } from '@supabase/supabase-js';
import {
  daysUntilDeadline,
  getNextWeekStart,
  getThisWeekStart,
  formatWeekRange,
  isRosterOverdue,
  shiftDateForWeek,
  DAY_LABELS_FULL,
  shouldRemindRoster,
} from '@/lib/roster/week-utils';
import type { RosterBranchStatus, RosterEntryInput, StaffScheduleWeek } from '@/lib/roster/types';

const WORK_DAYS = 7;

export async function getOrCreateRosterPlan(
  supabase: SupabaseClient,
  orgId: string,
  branchId: string,
  weekStart: string,
  createdBy: string
) {
  const { data: existing } = await supabase
    .from('weekly_roster_plans')
    .select('*, branch:branches(branch_code, branch_name)')
    .eq('organization_id', orgId)
    .eq('branch_id', branchId)
    .eq('week_start_date', weekStart)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('weekly_roster_plans')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      week_start_date: weekStart,
      created_by: createdBy,
    })
    .select('*, branch:branches(branch_code, branch_name)')
    .single();

  if (error) throw new Error(error.message);
  return created;
}

export async function loadRosterPlanWithEntries(
  supabase: SupabaseClient,
  planId: string
) {
  const { data: plan, error } = await supabase
    .from('weekly_roster_plans')
    .select('*, branch:branches(branch_code, branch_name)')
    .eq('id', planId)
    .single();

  if (error) throw new Error(error.message);

  const { data: entries } = await supabase
    .from('weekly_roster_entries')
    .select('*')
    .eq('plan_id', planId)
    .order('day_index');

  return { ...plan, entries: entries ?? [] };
}

export async function saveRosterEntries(
  supabase: SupabaseClient,
  planId: string,
  entries: RosterEntryInput[]
) {
  const { data: plan } = await supabase
    .from('weekly_roster_plans')
    .select('status')
    .eq('id', planId)
    .single();

  if (plan?.status === 'PUBLISHED') {
    throw new Error('Jadual sudah diterbitkan — tidak boleh edit');
  }

  if (entries.length === 0) return;

  const rows = entries.map((e) => ({
    plan_id: planId,
    staff_id: e.staff_id,
    day_index: e.day_index,
    is_off: e.is_off,
    template_id: e.template_id || null,
    scheduled_start: e.scheduled_start || null,
    scheduled_end: e.scheduled_end || null,
    notes: e.notes || null,
  }));

  const { error } = await supabase.from('weekly_roster_entries').upsert(rows, {
    onConflict: 'plan_id,staff_id,day_index',
  });

  if (error) throw new Error(error.message);
}

export async function getRosterStatusForBranches(
  supabase: SupabaseClient,
  orgId: string,
  branchIds: string[],
  weekStart?: string
): Promise<RosterBranchStatus[]> {
  if (!branchIds.length) return [];

  const targetWeek = weekStart ?? getNextWeekStart();

  const { data: plansData } = await supabase
    .from('weekly_roster_plans')
    .select('id, branch_id, status')
    .eq('organization_id', orgId)
    .eq('week_start_date', targetWeek)
    .in('branch_id', branchIds);

  const planIds = (plansData ?? []).map((p) => p.id);

  const [branchesRes, staffRes, entriesRes] = await Promise.all([
    supabase
      .from('branches')
      .select('id, branch_code, branch_name')
      .eq('organization_id', orgId)
      .in('id', branchIds)
      .eq('status', 'ACTIVE')
      .order('branch_code'),
    supabase
      .from('staff')
      .select('branch_id')
      .eq('organization_id', orgId)
      .eq('status', 'ACTIVE')
      .in('branch_id', branchIds),
    planIds.length
      ? supabase.from('weekly_roster_entries').select('plan_id').in('plan_id', planIds)
      : Promise.resolve({ data: [] as { plan_id: string }[] }),
  ]);

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
  weekStart?: string
): Promise<StaffScheduleWeek | null> {
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, branch_id, branch:branches(branch_code, branch_name)')
    .eq('profile_id', profileId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!staffRow) return null;

  const week = weekStart ?? getThisWeekStart();
  const branchRaw = staffRow.branch;
  const branch = (Array.isArray(branchRaw) ? branchRaw[0] : branchRaw) as {
    branch_code: string;
    branch_name: string;
  } | null;

  const { data: plan } = await supabase
    .from('weekly_roster_plans')
    .select('id, status, week_start_date')
    .eq('branch_id', staffRow.branch_id)
    .eq('week_start_date', week)
    .eq('status', 'PUBLISHED')
    .maybeSingle();

  const days = Array.from({ length: WORK_DAYS }, (_, i) => ({
    day_index: i,
    day_label: DAY_LABELS_FULL[i],
    shift_date: shiftDateForWeek(week, i),
    is_off: true,
    template_name: null as string | null,
    scheduled_start: null as string | null,
    scheduled_end: null as string | null,
    notes: null as string | null,
  }));

  if (plan) {
    const { data: entries } = await supabase
      .from('weekly_roster_entries')
      .select(
        `
        day_index, is_off, scheduled_start, scheduled_end, notes,
        template:shift_templates(name)
      `
      )
      .eq('plan_id', plan.id)
      .eq('staff_id', staffRow.id);

    for (const e of entries ?? []) {
      const slot = days[e.day_index];
      if (!slot) continue;
      slot.is_off = e.is_off;
      slot.scheduled_start = e.scheduled_start;
      slot.scheduled_end = e.scheduled_end;
      slot.notes = e.notes;
      const tplRaw = e.template;
      const tpl = (Array.isArray(tplRaw) ? tplRaw[0] : tplRaw) as { name: string } | null;
      slot.template_name = tpl?.name ?? null;
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
  branchStatuses: RosterBranchStatus[]
) {
  const today = new Date().toISOString().slice(0, 10);
  const targetWeek = branchStatuses[0]?.week_start_date ?? getNextWeekStart();

  if (!shouldRemindRoster(targetWeek)) return { sent: 0 };

  const pending = branchStatuses.filter(
    (b) => b.status !== 'PUBLISHED' && b.staff_count > 0
  );
  if (!pending.length) return { sent: 0 };

  let sent = 0;
  for (const b of pending) {
    const { data: existing } = await supabase
      .from('weekly_roster_reminder_log')
      .select('id')
      .eq('branch_id', b.branch_id)
      .eq('week_start_date', targetWeek)
      .eq('reminder_date', today)
      .maybeSingle();

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
      message: `Minggu ${formatWeekRange(targetWeek)} — ${urgency}. Siapkan sebelum Ahad.`,
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
