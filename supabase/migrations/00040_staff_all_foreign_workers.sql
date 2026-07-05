-- Semua staf kiosk berdaftar ialah pekerja asing (gaji mingguan).
-- Backfill worker_type + infer shift tier dari weekly_amount.

ALTER TABLE staff
 ALTER COLUMN worker_type SET DEFAULT 'FOREIGN';

UPDATE staff
SET worker_type = 'FOREIGN'
WHERE worker_type IS NULL;

UPDATE staff
SET shifts_per_week = 6
WHERE worker_type = 'FOREIGN'
 AND (shifts_per_week IS NULL OR shifts_per_week <= 0);

-- Taksir jam shift dari kadar mingguan / hari bekerja
UPDATE staff s
SET shift_hours = picked.shift_hours
FROM (
 SELECT
 s2.id,
 (
 SELECT pr.shift_hours
 FROM payroll_rules pr
 WHERE pr.organization_id = s2.organization_id
 AND pr.worker_type = 'FOREIGN'
 AND pr.period = 'PER_SHIFT'
 AND pr.shift_hours IS NOT NULL
 AND pr.status = 'ACTIVE'
 ORDER BY ABS(
 pr.rate - (s2.weekly_amount / COALESCE(NULLIF(s2.shifts_per_week, 0), 6))
 )
 LIMIT 1
 ) AS shift_hours
 FROM staff s2
 WHERE s2.worker_type = 'FOREIGN'
 AND s2.shift_hours IS NULL
 AND s2.weekly_amount IS NOT NULL
 AND s2.weekly_amount > 0
) picked
WHERE s.id = picked.id
 AND picked.shift_hours IS NOT NULL;

UPDATE staff
SET shift_hours = 8
WHERE worker_type = 'FOREIGN'
 AND shift_hours IS NULL;

-- Payroll: default worker_type pekerja asing (bukan tempatan)
CREATE OR REPLACE FUNCTION generate_payroll_run(
 p_period_start DATE,
 p_period_end DATE,
 p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_run_id UUID;
 v_run_number TEXT;
 v_staff RECORD;
 v_shift_pay NUMERIC := 0;
 v_ot_hours NUMERIC := 0;
 v_ot_rate NUMERIC := 0;
 v_ot_pay NUMERIC := 0;
 v_basic_rate NUMERIC := 0;
 v_allowance_rate NUMERIC := 0;
 v_basic NUMERIC := 0;
 v_allowance NUMERIC := 0;
 v_commission NUMERIC := 0;
 v_sales NUMERIC := 0;
 v_hours NUMERIC := 0;
 v_days INT := 0;
 v_period_days INT;
 v_gross NUMERIC := 0;
 v_epf NUMERIC := 0;
 v_socso NUMERIC := 0;
 v_eis NUMERIC := 0;
 v_net NUMERIC := 0;
 v_total_gross NUMERIC := 0;
 v_total_ded NUMERIC := 0;
 v_total_net NUMERIC := 0;
 v_shift RECORD;
 v_worker worker_type;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'HR') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 v_org_id := public.organization_id();
 IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

 IF p_period_end < p_period_start THEN
 RAISE EXCEPTION 'Invalid period';
 END IF;

 v_period_days := (p_period_end - p_period_start + 1);
 v_run_number := generate_doc_number('PR', v_org_id);

 INSERT INTO payroll_runs (
 organization_id, run_number, period_start, period_end, status, processed_by
 ) VALUES (
 v_org_id, v_run_number, p_period_start, p_period_end, 'PENDING', v_user_id
 ) RETURNING id INTO v_run_id;

 SELECT rate INTO v_ot_rate
 FROM payroll_rules
 WHERE organization_id = v_org_id AND worker_type = 'FOREIGN'
 AND component = 'OT' AND period = 'HOURLY' AND status = 'ACTIVE'
 LIMIT 1;

 SELECT rate INTO v_basic_rate
 FROM payroll_rules
 WHERE organization_id = v_org_id AND worker_type = 'LOCAL'
 AND component = 'Gaji Pokok' AND period = 'MONTHLY' AND status = 'ACTIVE'
 LIMIT 1;

 SELECT rate INTO v_allowance_rate
 FROM payroll_rules
 WHERE organization_id = v_org_id AND worker_type = 'LOCAL'
 AND component = 'Elaun Kehadiran' AND period = 'MONTHLY' AND status = 'ACTIVE'
 LIMIT 1;

 FOR v_staff IN
 SELECT * FROM staff
 WHERE organization_id = v_org_id
 AND status = 'ACTIVE'
 AND NOT on_hold
 AND (p_branch_id IS NULL OR branch_id = p_branch_id)
 LOOP
 v_worker := COALESCE(v_staff.worker_type, 'FOREIGN');
 v_shift_pay := 0;
 v_ot_hours := 0;
 v_ot_pay := 0;
 v_basic := 0;
 v_allowance := 0;
 v_commission := 0;
 v_sales := 0;
 v_hours := 0;
 v_days := 0;
 v_gross := 0;
 v_epf := 0;
 v_socso := 0;
 v_eis := 0;

 SELECT COUNT(*) INTO v_days
 FROM attendance_records
 WHERE staff_id = v_staff.id
 AND attendance_date BETWEEN p_period_start AND p_period_end
 AND NOT is_absent;

 SELECT COALESCE(SUM(hours_worked), 0), COALESCE(SUM(ot_hours), 0)
 INTO v_hours, v_ot_hours
 FROM attendance_records
 WHERE staff_id = v_staff.id
 AND attendance_date BETWEEN p_period_start AND p_period_end;

 IF v_worker = 'FOREIGN' THEN
 FOR v_shift IN
 SELECT COALESCE(actual_hours, scheduled_hours, 8) AS hrs, ot_hours
 FROM staff_shifts
 WHERE staff_id = v_staff.id
 AND status = 'APPROVED'
 AND shift_date BETWEEN p_period_start AND p_period_end
 LOOP
 v_shift_pay := v_shift_pay + calculate_foreign_shift_pay(v_org_id, v_shift.hrs);
 v_ot_hours := v_ot_hours + COALESCE(v_shift.ot_hours, 0);
 END LOOP;

 v_ot_pay := v_ot_hours * COALESCE(v_ot_rate, 0);
 v_gross := v_shift_pay + v_ot_pay;
 v_net := v_gross;
 ELSE
 IF v_days > 0 THEN
 v_basic := ROUND(COALESCE(v_basic_rate, 0) * (v_period_days::numeric / 30.0), 2);
 v_allowance := COALESCE(v_allowance_rate, 0);
 END IF;

 SELECT COALESCE(SUM(ps.total_sales), 0) INTO v_sales
 FROM pos_shifts ps
 WHERE ps.staff_id = v_staff.id
 AND ps.status = 'CLOSED'
 AND ps.closed_at::date BETWEEN p_period_start AND p_period_end;

 v_commission := calculate_commission(v_org_id, v_sales);
 v_gross := v_basic + v_allowance + v_commission + v_ot_pay;
 v_epf := ROUND(v_gross * 0.11, 2);
 v_socso := ROUND(LEAST(v_gross, 6000) * 0.005, 2);
 v_eis := ROUND(v_gross * 0.002, 2);
 v_net := v_gross - v_epf - v_socso - v_eis;
 END IF;

 IF v_gross > 0 OR v_days > 0 THEN
 INSERT INTO payroll_line_items (
 payroll_run_id, staff_id, worker_type,
 basic_salary, attendance_allowance, shift_pay, ot_pay, commission,
 epf, socso, eis, gross_pay, net_pay,
 sales_total, hours_worked, ot_hours
 ) VALUES (
 v_run_id, v_staff.id, v_worker,
 v_basic, v_allowance, v_shift_pay, v_ot_pay, v_commission,
 v_epf, v_socso, v_eis, v_gross, v_net,
 NULLIF(v_sales, 0), NULLIF(v_hours, 0), NULLIF(v_ot_hours, 0)
 );

 v_total_gross := v_total_gross + v_gross;
 v_total_ded := v_total_ded + v_epf + v_socso + v_eis;
 v_total_net := v_total_net + v_net;
 END IF;
 END LOOP;

 UPDATE payroll_runs SET
 total_gross = v_total_gross,
 total_deductions = v_total_ded,
 total_net = v_total_net
 WHERE id = v_run_id;

 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, status, requested_by
 ) VALUES (
 v_org_id, 'PAYROLL', v_run_id,
 'Payroll run ' || v_run_number || ' (' || p_period_start || ' to ' || p_period_end || ')',
 'PENDING', v_user_id
 );

 RETURN jsonb_build_object(
 'run_id', v_run_id,
 'run_number', v_run_number,
 'total_gross', v_total_gross,
 'total_net', v_total_net,
 'line_count', (SELECT COUNT(*) FROM payroll_line_items WHERE payroll_run_id = v_run_id)
 );
END;
$$;
