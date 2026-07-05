-- POS: validate kiosk stock before sale (bekalan HQ/kilang → kiosk → jualan)

CREATE OR REPLACE FUNCTION validate_pos_sale_stock(
 p_location_id UUID,
 p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
 v_line RECORD;
 v_bom RECORD;
 v_balance NUMERIC;
 v_need NUMERIC;
 v_product_name TEXT;
BEGIN
 FOR v_line IN
 SELECT (elem->>'product_id')::uuid AS product_id,
 SUM((elem->>'quantity')::int) AS qty
 FROM jsonb_array_elements(p_items) AS elem
 GROUP BY 1
 LOOP
 SELECT name INTO v_product_name FROM products WHERE id = v_line.product_id;

 FOR v_bom IN
 SELECT pb.quantity, pb.unit, pb.stock_item_id, si.name AS item_name
 FROM product_bom pb
 JOIN stock_items si ON si.id = pb.stock_item_id
 WHERE pb.product_id = v_line.product_id AND pb.auto_deduct = true
 LOOP
 v_need := v_bom.quantity * v_line.qty;

 SELECT COALESCE(quantity, 0) INTO v_balance
 FROM inventory_balances
 WHERE location_id = p_location_id AND stock_item_id = v_bom.stock_item_id;

 IF v_balance < v_need THEN
 RAISE EXCEPTION 'Stok tidak mencukupi: % — % (perlukan % %, baki kiosk % %)',
 COALESCE(v_product_name, 'Produk'),
 v_bom.item_name,
 v_need,
 v_bom.unit,
 v_balance,
 v_bom.unit;
 END IF;
 END LOOP;
 END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION get_pos_product_availability(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_location_id UUID;
 v_org_id UUID;
 v_result JSONB := '{}'::jsonb;
 v_product RECORD;
 v_bom RECORD;
 v_balance NUMERIC;
 v_max INT;
 v_product_max INT;
BEGIN
 SELECT il.id, il.organization_id INTO v_location_id, v_org_id
 FROM inventory_locations il
 WHERE il.branch_id = p_branch_id AND il.location_type = 'BRANCH_KIOSK'
 LIMIT 1;

 IF v_location_id IS NULL THEN
 RETURN '{}'::jsonb;
 END IF;

 FOR v_product IN
 SELECT id FROM products
 WHERE organization_id = v_org_id AND status = 'ACTIVE'
 LOOP
 v_product_max := NULL;

 FOR v_bom IN
 SELECT pb.quantity, pb.stock_item_id
 FROM product_bom pb
 WHERE pb.product_id = v_product.id AND pb.auto_deduct = true
 LOOP
 SELECT COALESCE(quantity, 0) INTO v_balance
 FROM inventory_balances
 WHERE location_id = v_location_id AND stock_item_id = v_bom.stock_item_id;

 IF v_bom.quantity > 0 THEN
 v_max := FLOOR(v_balance / v_bom.quantity)::int;
 v_product_max := CASE
 WHEN v_product_max IS NULL THEN v_max
 ELSE LEAST(v_product_max, v_max)
 END;
 END IF;
 END LOOP;

 IF v_product_max IS NOT NULL THEN
 v_result := v_result || jsonb_build_object(
 v_product.id::text,
 jsonb_build_object(
 'available', v_product_max,
 'status', CASE
 WHEN v_product_max <= 0 THEN 'OUT'
 WHEN v_product_max <= 5 THEN 'LOW'
 ELSE 'OK'
 END
 )
 );
 END IF;
 END LOOP;

 RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pos_product_availability(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_pos_sale_stock(UUID, JSONB) TO authenticated;

-- Patch process_pos_sale: require kiosk location + validate stock before jualan
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

 IF v_location_id IS NULL THEN
 RAISE EXCEPTION 'Stok kiosk belum disediakan untuk cawangan ini. Hubungi HQ/operasi.';
 END IF;

 PERFORM validate_pos_sale_stock(v_location_id, p_items);

 v_tx_number := generate_pos_number('TX', v_org_id);
 v_receipt_number := generate_pos_number('RC', v_org_id);

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
 END LOOP;

 IF p_payment_method IN ('CASH', 'MIXED') AND COALESCE(p_cash_amount, 0) > 0 THEN
 INSERT INTO pos_payments (transaction_id, payment_method, amount)
 VALUES (v_tx_id, 'CASH', COALESCE(p_cash_amount, 0));
 END IF;

 IF p_payment_method IN ('QR', 'MIXED') AND COALESCE(p_qr_amount, 0) > 0 THEN
 INSERT INTO pos_payments (transaction_id, payment_method, amount)
 VALUES (v_tx_id, 'QR', COALESCE(p_qr_amount, 0));
 END IF;

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

 UPDATE pos_shifts SET
 total_sales = total_sales + v_total,
 total_cash = total_cash + CASE WHEN p_payment_method IN ('CASH', 'MIXED') THEN LEAST(COALESCE(p_cash_amount, 0), v_total) ELSE 0 END,
 total_qr = total_qr + CASE WHEN p_payment_method IN ('QR', 'MIXED') THEN COALESCE(p_qr_amount, 0) ELSE 0 END,
 transaction_count = transaction_count + 1,
 updated_at = now()
 WHERE id = p_shift_id;

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
