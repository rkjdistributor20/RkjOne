-- POS stock count approval resolution
-- When a staff stock count differs from AI estimate, AM/OM approval must apply the count as official stock.

CREATE OR REPLACE FUNCTION resolve_approval_request(
 p_request_id UUID,
 p_action TEXT,
 p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_req RECORD;
 v_result JSONB;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_req FROM approval_requests
 WHERE id = p_request_id AND organization_id = public.organization_id() AND status = 'PENDING';

 IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found'; END IF;

 IF NOT (
 public.is_admin()
 OR public.user_role() IN ('HR', 'FINANCE', 'OPERATION_MANAGER', 'CEO_FACTORY', 'AREA_MANAGER')
 OR (v_req.branch_id IS NOT NULL AND public.has_branch_access(v_req.branch_id))
 ) THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 IF upper(p_action) = 'APPROVE' THEN
 CASE v_req.entity_type
 WHEN 'SHIFT' THEN
 v_result := approve_staff_shift(v_req.entity_id);
 WHEN 'PAYROLL' THEN
 v_result := approve_payroll_run(v_req.entity_id);
 WHEN 'STOCK_ADJUSTMENT' THEN
 v_result := approve_stock_adjustment(v_req.entity_id);
 WHEN 'STOCK_WRITE_OFF' THEN
 v_result := approve_stock_write_off(v_req.entity_id);
 WHEN 'CASH_RECONCILIATION' THEN
 v_result := approve_cash_reconciliation(v_req.entity_id);
 WHEN 'STOCK_TRANSFER' THEN
 IF EXISTS (SELECT 1 FROM pos_stock_receipts WHERE id = v_req.entity_id) THEN
 v_result := approve_pos_stock_receipt(v_req.entity_id);
 ELSIF EXISTS (SELECT 1 FROM pos_branch_supply_requests WHERE id = v_req.entity_id) THEN
 v_result := approve_pos_branch_supply_request(v_req.entity_id);
 ELSIF EXISTS (SELECT 1 FROM stock_counts WHERE id = v_req.entity_id) THEN
 v_result := approve_stock_count(v_req.entity_id);
 ELSE
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'APPROVED');
 END IF;
 ELSE
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'APPROVED');
 END CASE;

 UPDATE approval_requests SET
 status = 'APPROVED',
 approved_by = v_user_id,
 resolved_at = now()
 WHERE id = p_request_id;
 ELSIF upper(p_action) = 'REJECT' THEN
 CASE v_req.entity_type
 WHEN 'STOCK_TRANSFER' THEN
 IF EXISTS (SELECT 1 FROM pos_stock_receipts WHERE id = v_req.entity_id) THEN
 v_result := reject_pos_stock_receipt(v_req.entity_id, p_reason);
 ELSIF EXISTS (SELECT 1 FROM pos_branch_supply_requests WHERE id = v_req.entity_id) THEN
 v_result := reject_pos_branch_supply_request(v_req.entity_id, p_reason);
 ELSIF EXISTS (SELECT 1 FROM stock_counts WHERE id = v_req.entity_id) THEN
 UPDATE stock_counts
 SET status = 'REJECTED'
 WHERE id = v_req.entity_id AND status = 'PENDING';
 v_result := jsonb_build_object('count_id', v_req.entity_id, 'status', 'REJECTED');
 ELSE
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 END IF;
 WHEN 'SHIFT' THEN
 UPDATE staff_shifts SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'PAYROLL' THEN
 UPDATE payroll_runs SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'STOCK_ADJUSTMENT' THEN
 UPDATE stock_adjustments SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'STOCK_WRITE_OFF' THEN
 UPDATE stock_write_offs SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 WHEN 'CASH_RECONCILIATION' THEN
 UPDATE cash_reconciliations SET status = 'REJECTED' WHERE id = v_req.entity_id;
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 ELSE
 v_result := jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
 END CASE;

 UPDATE approval_requests SET
 status = 'REJECTED',
 rejected_by = v_user_id,
 rejection_reason = p_reason,
 resolved_at = now()
 WHERE id = p_request_id;
 ELSE
 RAISE EXCEPTION 'Invalid action - use APPROVE or REJECT';
 END IF;

 RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_approval_request(UUID, TEXT, TEXT) TO authenticated;
