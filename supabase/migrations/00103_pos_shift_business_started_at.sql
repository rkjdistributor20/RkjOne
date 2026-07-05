-- Record the exact time staff finishes opening SOP and starts business.
-- This is separate from shift opening time and first transaction time.
ALTER TABLE pos_shifts
 ADD COLUMN IF NOT EXISTS business_started_at TIMESTAMPTZ;

COMMENT ON COLUMN pos_shifts.business_started_at IS
 'Time staff completed opening POS SOP and kiosk business was allowed to start.';

UPDATE pos_shifts ps
SET business_started_at = opening.completed_at
FROM (
 SELECT DISTINCT ON (shift_id) shift_id, completed_at
 FROM pos_shift_stock_check_logs
 WHERE check_type = 'OPENING'
 ORDER BY shift_id, completed_at ASC
) opening
WHERE opening.shift_id = ps.id
 AND ps.business_started_at IS NULL;
