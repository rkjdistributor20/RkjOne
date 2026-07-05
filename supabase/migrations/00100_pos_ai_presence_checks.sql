CREATE TABLE IF NOT EXISTS pos_staff_presence_checks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 shift_id UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
 staff_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
 check_type TEXT NOT NULL DEFAULT 'IDLE_POS' CHECK (check_type IN ('IDLE_POS', 'MANUAL')),
 status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'MISSED')),
 prompt_reason TEXT,
 prompted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 confirmed_at TIMESTAMPTZ,
 response_seconds NUMERIC(10, 2),
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_presence_checks_branch_date
 ON pos_staff_presence_checks(branch_id, prompted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_presence_checks_staff_date
 ON pos_staff_presence_checks(staff_profile_id, prompted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_presence_checks_status
 ON pos_staff_presence_checks(branch_id, status, prompted_at DESC);

ALTER TABLE pos_staff_presence_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_staff_presence_checks_scope ON pos_staff_presence_checks;
CREATE POLICY pos_staff_presence_checks_scope ON pos_staff_presence_checks
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 ) WITH CHECK (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

CREATE OR REPLACE FUNCTION pos_staff_presence_check(
 p_branch_id UUID,
 p_shift_id UUID,
 p_status TEXT DEFAULT 'CONFIRMED',
 p_prompt_reason TEXT DEFAULT 'IDLE_POS',
 p_prompted_at TIMESTAMPTZ DEFAULT NULL,
 p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_staff_id UUID;
 v_status TEXT;
 v_prompted_at TIMESTAMPTZ;
 v_confirmed_at TIMESTAMPTZ;
 v_response_seconds NUMERIC;
 v_check_id UUID;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'Tiada akses cawangan'; END IF;

 SELECT organization_id INTO v_org_id
 FROM branches
 WHERE id = p_branch_id;

 IF v_org_id IS NULL THEN RAISE EXCEPTION 'Cawangan tidak dijumpai'; END IF;

 SELECT id INTO v_staff_id
 FROM staff
 WHERE profile_id = v_user_id
 AND organization_id = v_org_id
 ORDER BY created_at DESC
 LIMIT 1;

 v_status := UPPER(COALESCE(NULLIF(p_status, ''), 'CONFIRMED'));
 IF v_status NOT IN ('CONFIRMED', 'MISSED') THEN
 RAISE EXCEPTION 'Status presence check tidak sah';
 END IF;

 v_prompted_at := COALESCE(p_prompted_at, now());
 v_confirmed_at := CASE WHEN v_status = 'CONFIRMED' THEN now() ELSE NULL END;
 v_response_seconds := CASE
 WHEN v_status = 'CONFIRMED' THEN GREATEST(EXTRACT(EPOCH FROM (now() - v_prompted_at)), 0)
 ELSE NULL
 END;

 INSERT INTO pos_staff_presence_checks (
 organization_id,
 branch_id,
 shift_id,
 staff_profile_id,
 staff_id,
 check_type,
 status,
 prompt_reason,
 prompted_at,
 confirmed_at,
 response_seconds,
 notes
 ) VALUES (
 v_org_id,
 p_branch_id,
 p_shift_id,
 v_user_id,
 v_staff_id,
 'IDLE_POS',
 v_status,
 p_prompt_reason,
 v_prompted_at,
 v_confirmed_at,
 v_response_seconds,
 p_notes
 )
 RETURNING id INTO v_check_id;

 RETURN jsonb_build_object(
 'id', v_check_id,
 'status', v_status,
 'response_seconds', v_response_seconds,
 'prompted_at', v_prompted_at,
 'confirmed_at', v_confirmed_at
 );
END;
$$;

CREATE OR REPLACE FUNCTION pos_sop_status(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_shift RECORD;
 v_has_shift BOOLEAN := false;
 v_opening_done BOOLEAN := false;
 v_mid_done BOOLEAN := false;
 v_close_done BOOLEAN := false;
 v_mid_due BOOLEAN := false;
 v_shift_minutes NUMERIC := 0;
 v_delivery_pending INT := 0;
 v_required TEXT := NULL;
 v_break_used NUMERIC := 0;
 v_active_leave JSONB := NULL;
 v_recent_leaves JSONB := '[]'::jsonb;
 v_presence_check_today INT := 0;
 v_presence_check_missed INT := 0;
 v_last_presence_check JSONB := NULL;
 v_recent_presence_checks JSONB := '[]'::jsonb;
BEGIN
 IF NOT public.has_branch_access(p_branch_id) THEN
 RAISE EXCEPTION 'Tiada akses cawangan';
 END IF;

 SELECT * INTO v_shift
 FROM pos_shifts
 WHERE branch_id = p_branch_id AND status = 'OPEN'
 ORDER BY opened_at DESC
 LIMIT 1;
 v_has_shift := FOUND;

 IF v_has_shift THEN
 v_shift_minutes := EXTRACT(EPOCH FROM (now() - v_shift.opened_at)) / 60.0;
 v_mid_due := v_shift_minutes >= 240;

 SELECT EXISTS (
 SELECT 1 FROM pos_shift_stock_check_logs
 WHERE shift_id = v_shift.id AND check_type = 'OPENING'
 ) INTO v_opening_done;

 SELECT EXISTS (
 SELECT 1 FROM pos_shift_stock_check_logs
 WHERE shift_id = v_shift.id AND check_type = 'MID_SHIFT'
 ) INTO v_mid_done;

 SELECT EXISTS (
 SELECT 1 FROM pos_shift_stock_check_logs
 WHERE shift_id = v_shift.id AND check_type = 'CLOSE_SHIFT'
 ) INTO v_close_done;
 END IF;

 SELECT COUNT(*) INTO v_delivery_pending
 FROM pos_stock_receipts
 WHERE branch_id = p_branch_id
 AND status IN ('DRIVER_DROPPED', 'DISCREPANCY_PENDING_APPROVAL');

 SELECT COALESCE(SUM(duration_minutes), 0) INTO v_break_used
 FROM pos_staff_presence_logs
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 AND payroll_deductible = true
 AND left_at::date = CURRENT_DATE
 AND status = 'RETURNED';

 SELECT jsonb_build_object(
 'id', id,
 'reason', reason,
 'notes', notes,
 'left_at', left_at,
 'minutes_now', ROUND((EXTRACT(EPOCH FROM (now() - left_at)) / 60.0)::numeric, 2),
 'payroll_deductible', payroll_deductible
 )
 INTO v_active_leave
 FROM pos_staff_presence_logs
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 AND status = 'OUT'
 ORDER BY left_at DESC
 LIMIT 1;

 SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.left_at DESC), '[]'::jsonb)
 INTO v_recent_leaves
 FROM (
 SELECT id, reason, notes, status, left_at, returned_at, duration_minutes, payroll_deductible, excess_minutes
 FROM pos_staff_presence_logs
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 AND left_at::date = CURRENT_DATE
 ORDER BY left_at DESC
 LIMIT 8
 ) x;

 SELECT COUNT(*) INTO v_presence_check_today
 FROM pos_staff_presence_checks
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 AND prompted_at::date = CURRENT_DATE;

 SELECT COUNT(*) INTO v_presence_check_missed
 FROM pos_staff_presence_checks
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 AND prompted_at::date = CURRENT_DATE
 AND status = 'MISSED';

 SELECT jsonb_build_object(
 'id', id,
 'check_type', check_type,
 'status', status,
 'prompt_reason', prompt_reason,
 'prompted_at', prompted_at,
 'confirmed_at', confirmed_at,
 'response_seconds', response_seconds,
 'notes', notes
 )
 INTO v_last_presence_check
 FROM pos_staff_presence_checks
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 ORDER BY prompted_at DESC
 LIMIT 1;

 SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.prompted_at DESC), '[]'::jsonb)
 INTO v_recent_presence_checks
 FROM (
 SELECT id, check_type, status, prompt_reason, prompted_at, confirmed_at, response_seconds, notes
 FROM pos_staff_presence_checks
 WHERE staff_profile_id = auth.uid()
 AND branch_id = p_branch_id
 AND prompted_at::date = CURRENT_DATE
 ORDER BY prompted_at DESC
 LIMIT 8
 ) x;

 IF v_has_shift THEN
 IF NOT v_opening_done THEN
 v_required := 'OPENING';
 ELSIF v_mid_due AND NOT v_mid_done THEN
 v_required := 'MID_SHIFT';
 END IF;
 END IF;

 RETURN jsonb_build_object(
 'shift_id', CASE WHEN v_has_shift THEN v_shift.id ELSE NULL END,
 'shift_opened_at', CASE WHEN v_has_shift THEN v_shift.opened_at ELSE NULL END,
 'shift_minutes', ROUND(COALESCE(v_shift_minutes, 0)::numeric, 2),
 'opening_done', v_opening_done,
 'mid_shift_done', v_mid_done,
 'close_shift_done', v_close_done,
 'mid_shift_due', v_mid_due,
 'required_stock_check', v_required,
 'delivery_pending_count', v_delivery_pending,
 'sales_blocked', COALESCE(v_delivery_pending, 0) > 0 OR v_required IS NOT NULL OR v_active_leave IS NOT NULL,
 'break_allowance_minutes', 60,
 'break_used_minutes', ROUND(COALESCE(v_break_used, 0)::numeric, 2),
 'break_balance_minutes', GREATEST(60 - COALESCE(v_break_used, 0), 0),
 'active_leave', v_active_leave,
 'recent_leaves', v_recent_leaves,
 'presence_check_today_count', v_presence_check_today,
 'presence_check_missed_count', v_presence_check_missed,
 'last_presence_check', v_last_presence_check,
 'recent_presence_checks', v_recent_presence_checks
 );
END;
$$;

GRANT EXECUTE ON FUNCTION pos_staff_presence_check(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_sop_status(UUID) TO authenticated;
