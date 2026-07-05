-- Track the payroll start and the staff-confirmed actual work end time for POS shifts.
ALTER TABLE pos_shifts
 ADD COLUMN IF NOT EXISTS payroll_started_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS actual_work_ended_at TIMESTAMPTZ;

COMMENT ON COLUMN pos_shifts.payroll_started_at IS
 'Time payroll counting starts for the POS staff shift, normally after opening stock SOP is confirmed.';

COMMENT ON COLUMN pos_shifts.actual_work_ended_at IS
 'Staff-entered actual work end time when closing the POS shift.';

UPDATE pos_shifts
SET payroll_started_at = COALESCE(business_started_at, opened_at)
WHERE payroll_started_at IS NULL;

UPDATE pos_shifts
SET actual_work_ended_at = closed_at
WHERE actual_work_ended_at IS NULL
 AND closed_at IS NOT NULL;
