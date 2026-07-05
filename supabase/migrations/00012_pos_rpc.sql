-- RKJ One: POS RPC functions (atomic sale, void, refund, close shift)
-- Migration 00012

-- ============================================================
-- Helper: generate POS document number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_pos_number(p_prefix TEXT, p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
 v_date TEXT;
 v_count INT;
BEGIN
 v_date := to_char(now(), 'YYYYMMDD');
 SELECT COUNT(*) + 1 INTO v_count
 FROM pos_transactions
 WHERE organization_id = p_org_id
 AND created_at::date = CURRENT_DATE;
 RETURN p_prefix || '-' || v_date || '-' || lpad(v_count::text, 5, '0');
END;
$$;

-- ============================================================
-- PROCESS POS SALE
-- ============================================================

CREATE OR REPLACE FUNCTION process_pos_sale(
 p_shift_id UUID,
 p_branch_id UUID,
 p_items JSONB,
 p_payment_method payment_method,
 p_cash_amount NUMERIC,
 p_qr_amount NUMERIC,
 p_discount NUMERIC DEFAULT 0,
 p_offline_id TEXT DEFAULT NULL,
 p_receipt_email TEXT DEFAULT NULL,
 p_receipt_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_shift RECORD;
 v_item JSONB;
 v_product RECORD;
 v_tx_id UUID;
 v_tx_number TEXT;
 v_receipt_number TEXT;
 v_subtotal NUMERIC := 0;
 v_total NUMERIC := 0;
 v_change NUMERIC := 0;
 v_tx_item_id UUID;
 v_location_id UUID;
 v_bom RECORD;
 v_movement_id UUID;
 v_deduct_qty NUMERIC;
 v_receipt_items JSONB := '[]'::jsonb;
 v_paid NUMERIC;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN
 RAISE EXCEPTION 'Not authenticated';
 END IF;

 IF NOT public.has_branch_access(p_branch_id) THEN
 RAISE EXCEPTION 'No branch access';
 END IF;

 SELECT * INTO v_shift FROM pos_shifts
 WHERE id = p_shift_id AND branch_id = p_branch_id AND status = 'OPEN';

 IF NOT FOUND THEN
 RAISE EXCEPTION 'No open shift found';
 END IF;

 v_org_id := v_shift.organization_id;

 SELECT id INTO v_location_id FROM inventory_locations
 WHERE branch_id = p_branch_id AND location_type = 'BRANCH_KIOSK' LIMIT 1;

 v_tx_number := generate_pos_number('TX', v_org_id);
 v_receipt_number := generate_pos_number('RC', v_org_id);

 -- Calculate subtotal
 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_product FROM products
 WHERE id = (v_item->>'product_id')::uuid AND organization_id = v_org_id AND status = 'ACTIVE';

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Product not found: %', v_item->>'product_id';
 END IF;

 v_subtotal := v_subtotal + (v_product.price * (v_item->>'quantity')::int);
 END LOOP;

 v_total := v_subtotal - COALESCE(p_discount, 0);
 v_paid := COALESCE(p_cash_amount, 0) + COALESCE(p_qr_amount, 0);

 IF v_paid < v_total THEN
 RAISE EXCEPTION 'Insufficient payment amount';
 END IF;

 IF p_payment_method = 'CASH' THEN
 v_change := COALESCE(p_cash_amount, 0) - v_total;
 ELSIF p_payment_method = 'MIXED' THEN
 v_change := GREATEST(COALESCE(p_cash_amount, 0) - (v_total - COALESCE(p_qr_amount, 0)), 0);
 END IF;

 -- Create transaction
 INSERT INTO pos_transactions (
 organization_id, branch_id, shift_id, transaction_number,
 status, subtotal, discount, total, payment_method,
 cash_amount, qr_amount, change_amount,
 offline_id, synced_at, receipt_email, receipt_phone, created_by
 ) VALUES (
 v_org_id, p_branch_id, p_shift_id, v_tx_number,
 'COMPLETED', v_subtotal, COALESCE(p_discount, 0), v_total, p_payment_method,
 COALESCE(p_cash_amount, 0), COALESCE(p_qr_amount, 0), v_change,
 p_offline_id, CASE WHEN p_offline_id IS NOT NULL THEN now() ELSE NULL END,
 p_receipt_email, p_receipt_phone, v_user_id
 ) RETURNING id INTO v_tx_id;

 -- Line items + BOM deduction
 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_product FROM products
 WHERE id = (v_item->>'product_id')::uuid;

 INSERT INTO pos_transaction_items (
 transaction_id, product_id, product_name, sku, quantity, unit_price, line_total
 ) VALUES (
 v_tx_id, v_product.id, v_product.name, v_product.sku,
 (v_item->>'quantity')::int, v_product.price,
 v_product.price * (v_item->>'quantity')::int
 ) RETURNING id INTO v_tx_item_id;

 v_receipt_items := v_receipt_items || jsonb_build_object(
 'name', v_product.name,
 'sku', v_product.sku,
 'quantity', (v_item->>'quantity')::int,
 'unit_price', v_product.price,
 'line_total', v_product.price * (v_item->>'quantity')::int
 );

 -- BOM stock deduction
 IF v_location_id IS NOT NULL THEN
 FOR v_bom IN
 SELECT pb.*, si.name AS item_name
 FROM product_bom pb
 JOIN stock_items si ON si.id = pb.stock_item_id
 WHERE pb.product_id = v_product.id AND pb.auto_deduct = true
 LOOP
 v_deduct_qty := v_bom.quantity * (v_item->>'quantity')::int;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, created_by
 ) VALUES (
 v_org_id, 'SALE_DEDUCT', v_location_id, v_bom.stock_item_id,
 -v_deduct_qty, v_bom.unit, 'pos_transaction', v_tx_id, v_user_id
 ) RETURNING id INTO v_movement_id;

 INSERT INTO pos_stock_deductions (
 transaction_id, transaction_item_id, stock_item_id,
 quantity, unit, location_id, movement_id
 ) VALUES (
 v_tx_id, v_tx_item_id, v_bom.stock_item_id,
 v_deduct_qty, v_bom.unit, v_location_id, v_movement_id
 );
 END LOOP;
 END IF;
 END LOOP;

 -- Payment records
 IF p_payment_method IN ('CASH', 'MIXED') AND COALESCE(p_cash_amount, 0) > 0 THEN
 INSERT INTO pos_payments (transaction_id, payment_method, amount)
 VALUES (v_tx_id, 'CASH', COALESCE(p_cash_amount, 0));
 END IF;

 IF p_payment_method IN ('QR', 'MIXED') AND COALESCE(p_qr_amount, 0) > 0 THEN
 INSERT INTO pos_payments (transaction_id, payment_method, amount)
 VALUES (v_tx_id, 'QR', COALESCE(p_qr_amount, 0));
 END IF;

 -- Receipt
 INSERT INTO pos_receipts (transaction_id, receipt_number, receipt_data)
 VALUES (
 v_tx_id, v_receipt_number,
 jsonb_build_object(
 'receipt_number', v_receipt_number,
 'transaction_number', v_tx_number,
 'branch_id', p_branch_id,
 'items', v_receipt_items,
 'subtotal', v_subtotal,
 'discount', COALESCE(p_discount, 0),
 'total', v_total,
 'payment_method', p_payment_method,
 'cash_amount', COALESCE(p_cash_amount, 0),
 'qr_amount', COALESCE(p_qr_amount, 0),
 'change_amount', v_change,
 'created_at', now()
 )
 );

 -- Update shift totals
 UPDATE pos_shifts SET
 total_sales = total_sales + v_total,
 total_cash = total_cash + CASE WHEN p_payment_method IN ('CASH', 'MIXED') THEN LEAST(COALESCE(p_cash_amount, 0), v_total) ELSE 0 END,
 total_qr = total_qr + CASE WHEN p_payment_method IN ('QR', 'MIXED') THEN COALESCE(p_qr_amount, 0) ELSE 0 END,
 transaction_count = transaction_count + 1,
 updated_at = now()
 WHERE id = p_shift_id;

 -- Refresh daily summary
 PERFORM refresh_pos_daily_summary(v_org_id, p_branch_id, CURRENT_DATE);

 RETURN jsonb_build_object(
 'transaction_id', v_tx_id,
 'transaction_number', v_tx_number,
 'receipt_number', v_receipt_number,
 'subtotal', v_subtotal,
 'discount', COALESCE(p_discount, 0),
 'total', v_total,
 'change_amount', v_change,
 'items', v_receipt_items
 );
END;
$$;

-- ============================================================
-- VOID POS TRANSACTION
-- ============================================================

CREATE OR REPLACE FUNCTION void_pos_transaction(
 p_transaction_id UUID,
 p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_tx RECORD;
 v_deduction RECORD;
 v_movement_id UUID;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_tx FROM pos_transactions WHERE id = p_transaction_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
 IF v_tx.status != 'COMPLETED' THEN RAISE EXCEPTION 'Only completed transactions can be voided'; END IF;
 IF NOT public.has_branch_access(v_tx.branch_id) THEN RAISE EXCEPTION 'No branch access'; END IF;

 UPDATE pos_transactions SET
 status = 'VOIDED',
 void_reason = p_reason,
 voided_by = v_user_id,
 voided_at = now(),
 updated_at = now()
 WHERE id = p_transaction_id;

 -- Restore stock
 FOR v_deduction IN
 SELECT * FROM pos_stock_deductions WHERE transaction_id = p_transaction_id
 LOOP
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_tx.organization_id, 'ADJUSTMENT', v_deduction.location_id, v_deduction.stock_item_id,
 v_deduction.quantity, v_deduction.unit, 'void_transaction', p_transaction_id,
 'Void restore: ' || p_reason, v_user_id
 );
 END LOOP;

 UPDATE pos_shifts SET
 total_sales = total_sales - v_tx.total,
 total_cash = total_cash - v_tx.cash_amount,
 total_qr = total_qr - v_tx.qr_amount,
 transaction_count = GREATEST(transaction_count - 1, 0),
 updated_at = now()
 WHERE id = v_tx.shift_id;

 PERFORM refresh_pos_daily_summary(v_tx.organization_id, v_tx.branch_id, v_tx.created_at::date);

 RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id);
END;
$$;

-- ============================================================
-- REFUND POS TRANSACTION
-- ============================================================

CREATE OR REPLACE FUNCTION refund_pos_transaction(
 p_transaction_id UUID,
 p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_tx RECORD;
 v_deduction RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_tx FROM pos_transactions WHERE id = p_transaction_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
 IF v_tx.status != 'COMPLETED' THEN RAISE EXCEPTION 'Only completed transactions can be refunded'; END IF;
 IF NOT public.has_branch_access(v_tx.branch_id) THEN RAISE EXCEPTION 'No branch access'; END IF;

 UPDATE pos_transactions SET
 status = 'REFUNDED',
 refund_reason = p_reason,
 refunded_by = v_user_id,
 refunded_at = now(),
 updated_at = now()
 WHERE id = p_transaction_id;

 FOR v_deduction IN
 SELECT * FROM pos_stock_deductions WHERE transaction_id = p_transaction_id
 LOOP
 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by
 ) VALUES (
 v_tx.organization_id, 'ADJUSTMENT', v_deduction.location_id, v_deduction.stock_item_id,
 v_deduction.quantity, v_deduction.unit, 'refund_transaction', p_transaction_id,
 'Refund restore: ' || p_reason, v_user_id
 );
 END LOOP;

 UPDATE pos_shifts SET
 total_sales = total_sales - v_tx.total,
 total_cash = total_cash - v_tx.cash_amount,
 total_qr = total_qr - v_tx.qr_amount,
 updated_at = now()
 WHERE id = v_tx.shift_id;

 PERFORM refresh_pos_daily_summary(v_tx.organization_id, v_tx.branch_id, v_tx.created_at::date);

 RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id);
END;
$$;

-- ============================================================
-- CLOSE POS SHIFT
-- ============================================================

CREATE OR REPLACE FUNCTION close_pos_shift(
 p_shift_id UUID,
 p_closing_cash NUMERIC,
 p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_shift RECORD;
 v_expected NUMERIC;
 v_variance NUMERIC;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_shift FROM pos_shifts WHERE id = p_shift_id AND status = 'OPEN';
 IF NOT FOUND THEN RAISE EXCEPTION 'Open shift not found'; END IF;
 IF NOT public.has_branch_access(v_shift.branch_id) THEN RAISE EXCEPTION 'No branch access'; END IF;

 v_expected := v_shift.opening_cash + v_shift.total_cash;
 v_variance := p_closing_cash - v_expected;

 UPDATE pos_shifts SET
 status = 'CLOSED',
 closed_by = v_user_id,
 closing_cash = p_closing_cash,
 expected_cash = v_expected,
 cash_variance = v_variance,
 closed_at = now(),
 notes = p_notes,
 updated_at = now()
 WHERE id = p_shift_id;

 UPDATE pos_daily_summaries SET shift_count = shift_count + 1
 WHERE organization_id = v_shift.organization_id
 AND branch_id = v_shift.branch_id
 AND summary_date = CURRENT_DATE;

 RETURN jsonb_build_object(
 'shift_id', p_shift_id,
 'expected_cash', v_expected,
 'closing_cash', p_closing_cash,
 'variance', v_variance,
 'total_sales', v_shift.total_sales,
 'transaction_count', v_shift.transaction_count
 );
END;
$$;

-- ============================================================
-- OPEN POS SHIFT
-- ============================================================

CREATE OR REPLACE FUNCTION open_pos_shift(
 p_branch_id UUID,
 p_opening_cash NUMERIC DEFAULT 0,
 p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_shift_id UUID;
 v_shift_number TEXT;
 v_existing UUID;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'No branch access'; END IF;

 SELECT id INTO v_existing FROM pos_shifts
 WHERE branch_id = p_branch_id AND status = 'OPEN' LIMIT 1;

 IF v_existing IS NOT NULL THEN
 RAISE EXCEPTION 'Shift already open for this branch';
 END IF;

 SELECT organization_id INTO v_org_id FROM branches WHERE id = p_branch_id;
 v_shift_number := 'SH-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(
 (SELECT COUNT(*) + 1 FROM pos_shifts WHERE organization_id = v_org_id AND opened_at::date = CURRENT_DATE)::text,
 4, '0'
 );

 INSERT INTO pos_shifts (
 organization_id, branch_id, shift_number, staff_id,
 opened_by, opening_cash, status
 ) VALUES (
 v_org_id, p_branch_id, v_shift_number, p_staff_id,
 v_user_id, COALESCE(p_opening_cash, 0), 'OPEN'
 ) RETURNING id INTO v_shift_id;

 RETURN jsonb_build_object(
 'shift_id', v_shift_id,
 'shift_number', v_shift_number,
 'opening_cash', COALESCE(p_opening_cash, 0)
 );
END;
$$;

GRANT EXECUTE ON FUNCTION process_pos_sale TO authenticated;
GRANT EXECUTE ON FUNCTION void_pos_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION refund_pos_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION close_pos_shift TO authenticated;
GRANT EXECUTE ON FUNCTION open_pos_shift TO authenticated;

-- Additional RLS for POS child tables
CREATE POLICY pos_payments_via_tx ON pos_payments
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM pos_transactions t
 WHERE t.id = transaction_id
 AND t.organization_id = public.organization_id()
 AND public.has_branch_access(t.branch_id)
 )
 );

CREATE POLICY pos_receipts_via_tx ON pos_receipts
 FOR ALL USING (
 EXISTS (
 SELECT 1 FROM pos_transactions t
 WHERE t.id = transaction_id
 AND t.organization_id = public.organization_id()
 AND public.has_branch_access(t.branch_id)
 )
 );

CREATE POLICY pos_daily_summary_branch ON pos_daily_summaries
 FOR SELECT USING (
 organization_id = public.organization_id()
 AND public.has_branch_access(branch_id)
 );

CREATE POLICY stock_movements_insert ON stock_movements
 FOR INSERT WITH CHECK (
 organization_id = public.organization_id()
 );

ALTER TABLE pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_daily_summaries ENABLE ROW LEVEL SECURITY;
