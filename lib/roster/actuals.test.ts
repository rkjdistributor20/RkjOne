import { describe, expect, it } from 'vitest';
import { matchScheduleActuals } from './actuals';
import type { PlannedShift, ScheduleActual } from './types';
import { getRosterDeadline, getThisWeekStart, isRosterWeek, shiftDateForWeek } from './week-utils';

const overnight: PlannedShift = {
 id: 'plan', staff_id: 'staff', branch_id: 'A', shift_date: '2026-11-29',
 scheduled_start: '22:00:00', scheduled_end: '06:00:00',
};
const actual: ScheduleActual = {
 id: 'actual', staff_id: 'staff', branch_id: 'A', shift_number: 'POS1',
 opened_at: '2026-11-29T14:00:35Z', closed_at: '2026-11-29T22:00:02Z',
};
const compare = (row: ScheduleActual, plans = [overnight]) => matchScheduleActuals(
 [row], plans, new Map([['A', 'Branch A']]), new Map([['staff', 'Staff A']]),
)[0];

describe('MYT roster dates', () => {
 it('rolls the roster week at Malaysian midnight rather than UTC midnight', () => {
  expect(getThisWeekStart(new Date('2026-11-29T15:59:59Z'))).toBe('2026-11-23');
  expect(getThisWeekStart(new Date('2026-11-29T16:00:00Z'))).toBe('2026-11-30');
  expect(getRosterDeadline('2026-11-30').toISOString()).toBe('2026-11-29T15:59:59.999Z');
  expect(shiftDateForWeek('2026-12-28', 7)).toBe('2027-01-04');
 });

 it('accepts only real calendar Mondays', () => {
  expect(isRosterWeek('2026-11-30')).toBe(true);
  expect(isRosterWeek('2026-11-29')).toBe(false);
  expect(isRosterWeek('2024-02-30')).toBe(false);
  expect(isRosterWeek('2026-13-01')).toBe(false);
 });
});

describe('actual opening / closing compared to approved planning', () => {
 it('matches an overnight shift at minute precision and retains the original timestamps', () => {
  expect(compare(actual)).toMatchObject({
   branch_label: 'Branch A', staff_name: 'Staff A', closed_at: actual.closed_at,
   planned: { starts_at: '2026-11-29T14:00:00.000Z', ends_at: '2026-11-29T22:00:00.000Z' },
   comparison: 'MATCH',
  });
 });

 it('uses the previous Sunday plan when an opening lands after midnight Monday', () => {
  const monday = { ...overnight, id: 'monday', shift_date: '2026-11-30' };
  expect(compare({ ...actual, opened_at: '2026-11-29T18:00:00Z' }, [overnight, monday])).toMatchObject({
   planned: { starts_at: '2026-11-29T14:00:00.000Z' }, comparison: 'DIFFERENT',
  });
 });

 it('distinguishes differences, open shifts, unscheduled shifts and missing staff links', () => {
  expect(compare({ ...actual, closed_at: '2026-11-29T22:15:00Z' }).comparison).toBe('DIFFERENT');
  expect(compare({ ...actual, closed_at: null }).comparison).toBe('MATCH');
  expect(compare({ ...actual, branch_id: 'B' }).comparison).toBe('UNSCHEDULED');
  expect(compare({ ...actual, staff_id: 'other' }).comparison).toBe('UNSCHEDULED');
  expect(compare({ ...actual, staff_id: null }).comparison).toBe('UNATTRIBUTED');
  expect(compare(actual, [{ ...overnight, scheduled_end: null }]).comparison).toBe('UNSCHEDULED');
 });
});
