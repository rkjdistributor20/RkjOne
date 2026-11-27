export type WeeklyRosterStatus = 'DRAFT' | 'PUBLISHED';

export type RosterEntryInput = {
 staff_id: string;
 day_index: number;
 is_off: boolean;
 template_id?: string | null;
 scheduled_start?: string | null;
 scheduled_end?: string | null;
 notes?: string | null;
};

export type RosterEntryRow = RosterEntryInput & {
 id: string;
 plan_id: string;
};

export type RosterPlanRow = {
 id: string;
 branch_id: string;
 week_start_date: string;
 status: WeeklyRosterStatus;
 published_at: string | null;
 entries: RosterEntryRow[];
};

export type RosterStaff = { id: string; staff_code: string; full_name: string };
export type RosterTemplate = { id: string; name: string; start_time: string | null; end_time: string | null };
export type RosterPlannerData = { plan: RosterPlanRow | null; staff: RosterStaff[]; templates: RosterTemplate[] };

export type ScheduleActual = {
 id: string;
 branch_id: string;
 staff_id: string | null;
 shift_number: string;
 opened_at: string;
 closed_at: string | null;
};

export type PlannedShift = {
 id: string;
 branch_id: string;
 staff_id: string;
 shift_date: string;
 scheduled_start: string | null;
 scheduled_end: string | null;
};

export type ScheduleComparison = ScheduleActual & {
 branch_label: string;
 staff_name: string | null;
 planned: { starts_at: string; ends_at: string } | null;
 comparison: 'MATCH' | 'DIFFERENT' | 'UNSCHEDULED' | 'UNATTRIBUTED';
};

export type StaffScheduleDay = {
 day_index: number;
 day_label: string;
 shift_date: string;
 /** null means no slot was set; it is not an explicit day off. */
 is_off: boolean | null;
 template_name: string | null;
 scheduled_start: string | null;
 scheduled_end: string | null;
 notes: string | null;
};

export type StaffScheduleWeek = {
 week_start_date: string;
 week_range: string;
 branch_code: string | null;
 branch_name: string | null;
 status: WeeklyRosterStatus | null;
 days: StaffScheduleDay[];
};

export type RosterBranchStatus = {
 branch_id: string;
 branch_code: string;
 branch_name: string;
 week_start_date: string;
 status: WeeklyRosterStatus | 'MISSING';
 staff_count: number;
 entries_count: number;
 expected_entries: number;
 is_complete: boolean;
 days_until_deadline: number;
 is_overdue: boolean;
};
