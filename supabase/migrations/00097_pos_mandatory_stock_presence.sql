-- POS SOP enforcement: mandatory shift stock checks and kiosk presence logs
-- Migration 00097

CREATE TABLE IF NOT EXISTS pos_shift_stock_check_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 shift_id UUID NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
 stock_count_id UUID REFERENCES stock_counts(id) ON DELETE SET NULL,
 check_type TEXT NOT NULL CHECK (check_type IN ('OPENING', 'MID_SHIFT', 'CLOSE_SHIFT')),
 production_date DATE NOT NULL,
 notes TEXT,
 completed_by UUID NOT NULL REFERENCES profiles(id),
 completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_shift_stock_check_once
 ON pos_shift_stock_check_logs(shift_id, check_type);
CREATE INDEX IF NOT EXISTS idx_pos_shift_stock_check_branch
 ON pos_shift_stock_check_logs(branch_id, shift_id, check_type);

CREATE TABLE IF NOT EXISTS pos_staff_presence_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 shift_id UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
 staff_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
 reason TEXT NOT NULL CHECK (reason IN ('REST', 'MEAL', 'PRAYER', 'TOILET', 'STOCK_PICKUP', 'OTHER')),
 notes TEXT,
 status TEXT NOT NULL DEFAULT 'OUT' CHECK (status IN ('OUT', 'RETURNED')),
 left_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 returned_at TIMESTAMPTZ,
 duration_minutes NUMERIC(10, 2),
 payroll_deductible BOOLEAN NOT NULL DEFAULT true,
 excess_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_staff_presence_branch_date
 ON pos_staff_presence_logs(branch_id, left_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_staff_presence_staff_date
 ON pos_staff_presence_logs(staff_profile_id, left_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_staff_presence_open
 ON pos_staff_presence_logs(staff_profile_id, status)
 WHERE status = 'OUT';

ALTER TABLE pos_shift_stock_check_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_staff_presence_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_shift_stock_check_scope ON pos_shift_stock_check_logs;
CREATE POLICY pos_shift_stock_check_scope ON pos_shift_stock_check_logs
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 ) WITH CHECK (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

DROP POLICY IF EXISTS pos_staff_presence_scope ON pos_staff_presence_logs;
CREATE POLICY pos_staff_presence_scope ON pos_staff_presence_logs
 FOR ALL USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 ) WITH CHECK (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

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
 'recent_leaves', v_recent_leaves
 );
END;
$$;

CREATE OR REPLACE FUNCTION pos_staff_leave_start(
 p_branch_id UUID,
 p_shift_id UUID,
 p_reason TEXT,
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
 v_log_id UUID;
 v_reason TEXT;
 v_deductible BOOLEAN;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'Tiada akses cawangan'; END IF;

 IF EXISTS (
 SELECT 1 FROM pos_staff_presence_logs
 WHERE staff_profile_id = v_user_id AND status = 'OUT'
 ) THEN
 RAISE EXCEPTION 'Anda masih direkod keluar kiosk. Tekan kembali dahulu.';
 END IF;

 SELECT organization_id INTO v_org_id FROM branches WHERE id = p_branch_id;
 SELECT id INTO v_staff_id FROM staff WHERE profile_id = v_user_id AND organization_id = v_org_id LIMIT 1;
 v_reason := upper(COALESCE(p_reason, 'OTHER'));
 IF v_reason NOT IN ('REST', 'MEAL', 'PRAYER', 'TOILET', 'STOCK_PICKUP', 'OTHER') THEN
 v_reason := 'OTHER';
 END IF;
 v_deductible := v_reason <> 'STOCK_PICKUP';

 INSERT INTO pos_staff_presence_logs (
 organization_id, branch_id, shift_id, staff_profile_id, staff_id,
 reason, notes, payroll_deductible
 ) VALUES (
 v_org_id, p_branch_id, p_shift_id, v_user_id, v_staff_id,
 v_reason, p_notes, v_deductible
 ) RETURNING id INTO v_log_id;

 RETURN jsonb_build_object('presence_id', v_log_id, 'status', 'OUT', 'payroll_deductible', v_deductible);
END;
$$;

CREATE OR REPLACE FUNCTION pos_staff_leave_return(p_presence_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_log RECORD;
 v_duration NUMERIC;
 v_used_before NUMERIC;
 v_excess NUMERIC;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_log
 FROM pos_staff_presence_logs
 WHERE id = p_presence_id
 AND staff_profile_id = v_user_id
 AND status = 'OUT';

 IF NOT FOUND THEN RAISE EXCEPTION 'Log keluar kiosk tidak dijumpai'; END IF;

 v_duration := ROUND((EXTRACT(EPOCH FROM (now() - v_log.left_at)) / 60.0)::numeric, 2);

 SELECT COALESCE(SUM(duration_minutes), 0) INTO v_used_before
 FROM pos_staff_presence_logs
 WHERE staff_profile_id = v_user_id
 AND branch_id = v_log.branch_id
 AND payroll_deductible = true
 AND left_at::date = v_log.left_at::date
 AND status = 'RETURNED';

 IF v_log.payroll_deductible THEN
 v_excess := GREATEST(COALESCE(v_used_before, 0) + v_duration - 60, 0);
 ELSE
 v_excess := 0;
 END IF;

 UPDATE pos_staff_presence_logs
 SET status = 'RETURNED',
 returned_at = now(),
 duration_minutes = v_duration,
 excess_minutes = v_excess,
 updated_at = now()
 WHERE id = p_presence_id;

 RETURN jsonb_build_object(
 'presence_id', p_presence_id,
 'status', 'RETURNED',
 'duration_minutes', v_duration,
 'excess_minutes', v_excess,
 'payroll_deductible', v_log.payroll_deductible
 );
END;
$$;

GRANT EXECUTE ON FUNCTION pos_sop_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_staff_leave_start(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pos_staff_leave_return(UUID) TO authenticated;
