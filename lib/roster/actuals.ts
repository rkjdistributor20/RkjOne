import type { PlannedShift, ScheduleActual, ScheduleComparison } from './types';
import { crossesMidnight, malaysiaRosterDate, rosterTimestamp, shiftDateForWeek } from './week-utils';

export function matchScheduleActuals(
 actuals: ScheduleActual[],
 plannedShifts: PlannedShift[],
 branchLabels: ReadonlyMap<string, string>,
 staffNames: ReadonlyMap<string, string>,
): ScheduleComparison[] {
 const byStaffDay = new Map<string, { starts: number; ends: number }[]>();
 const key = (branch: string, staff: string, date: string) => `${branch}:${staff}:${date}`;
 for (const shift of plannedShifts) {
  const { scheduled_start: start, scheduled_end: end } = shift;
  if (!start || !end || start === end) continue;
  const starts = rosterTimestamp(shift.shift_date, start).getTime();
  const endDate = shiftDateForWeek(shift.shift_date, crossesMidnight(start, end) ? 1 : 0);
  const ends = rosterTimestamp(endDate, end).getTime();
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts >= ends) continue;
  const k = key(shift.branch_id, shift.staff_id, shift.shift_date);
  const slots = byStaffDay.get(k) ?? [];
  slots.push({ starts, ends });
  byStaffDay.set(k, slots);
 }

 return actuals.map((actual) => {
  const opened = new Date(actual.opened_at);
  const ms = opened.getTime();
  const day = malaysiaRosterDate(opened);
  let slot: { starts: number; ends: number } | undefined;
  if (actual.staff_id) {
   const today = byStaffDay.get(key(actual.branch_id, actual.staff_id, day)) ?? [];
   const previous = byStaffDay.get(key(actual.branch_id, actual.staff_id, shiftDateForWeek(day, -1))) ?? [];
   const covering = [...today, ...previous].filter((p) => p.starts <= ms && ms < p.ends);
   // Prefer the actual opening window (including last night's shift), otherwise
   // the closest plan starting on the opening's own local date.
   slot = (covering.length ? covering : today).reduce<typeof slot>(
    (best, item) => !best || Math.abs(item.starts - ms) < Math.abs(best.starts - ms) ? item : best,
    undefined,
   );
  }
  const minute = (timestamp: number) => Math.floor(timestamp / 60_000);
  return {
   ...actual,
   branch_label: branchLabels.get(actual.branch_id) ?? 'Cawangan',
   staff_name: actual.staff_id ? staffNames.get(actual.staff_id) ?? null : null,
   planned: slot ? { starts_at: new Date(slot.starts).toISOString(), ends_at: new Date(slot.ends).toISOString() } : null,
   comparison: !actual.staff_id ? 'UNATTRIBUTED' : !slot ? 'UNSCHEDULED'
    : minute(ms) !== minute(slot.starts) || (actual.closed_at && minute(Date.parse(actual.closed_at)) !== minute(slot.ends))
     ? 'DIFFERENT' : 'MATCH',
  };
 });
}
