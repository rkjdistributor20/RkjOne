-- Store foreign shift tier and computed pay snapshots on staff records.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS shift_hours INT,
  ADD COLUMN IF NOT EXISTS shifts_per_week INT,
  ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(10, 2);

COMMENT ON COLUMN staff.shift_hours IS 'Foreign worker shift tier hours (8, 9, 12, 16) matching payroll_rules';
COMMENT ON COLUMN staff.shifts_per_week IS 'Foreign worker shifts per week used for weekly_amount';
COMMENT ON COLUMN staff.monthly_amount IS 'Local worker monthly pay snapshot (gaji pokok + elaun bulanan)';
