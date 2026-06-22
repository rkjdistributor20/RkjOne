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
  branch?: { branch_code: string; branch_name: string };
  entries?: RosterEntryRow[];
};

export type StaffScheduleDay = {
  day_index: number;
  day_label: string;
  shift_date: string;
  is_off: boolean;
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
