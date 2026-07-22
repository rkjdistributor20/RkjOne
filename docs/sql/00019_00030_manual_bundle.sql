-- RKJ One - Manual migration bundle (00019-00030)
-- Tarikh jana: 2026-07-02
--
-- Guna jika: supabase db push gagal (remote/local history mismatch)
-- Cara: Supabase Dashboard ke SQL Editor ke paste & Run
--
-- PERINGATAN: Pastikan migration 00001-00018 sudah applied sebelum ini.
-- Jalankan sekali sahaja. Semak supabase_migrations.schema_migrations selepas berjaya.


-- ============================================================
-- 00019_fleet_master_rls.sql
-- ============================================================

-- RKJ One: RLS read policies for fleet master data
-- Migration 00019

CREATE POLICY vehicles_org_read ON vehicles
 FOR SELECT USING (organization_id = public.organization_id());

CREATE POLICY drivers_org_read ON drivers
 FOR SELECT USING (organization_id = public.organization_id());

CREATE POLICY driver_vehicle_assignments_org_read ON driver_vehicle_assignments
 FOR SELECT USING (organization_id = public.organization_id());


-- ============================================================
-- 00020_branch_status_rls.sql
-- ============================================================

-- Allow admins and area managers to update branch status (e.g. tutup sementara)
-- Migration 00020

CREATE POLICY org_admin_branches_update ON branches
 FOR UPDATE USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND region_id = (
 SELECT region_id FROM profiles WHERE id = auth.uid()
 )
 )
 )
 )
 WITH CHECK (organization_id = public.organization_id());


-- ============================================================
-- 00021_pos_opening_stock.sql
-- ============================================================

-- Opening inventory for HQ warehouse and branch kiosks (POS stock deduction)
-- Migration 00021 — idempotent: skips rows that already exist

-- HQ Warehouse — bulk stock
INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
SELECT il.organization_id, il.id, si.id,
 CASE si.item_code
 WHEN 'ST-PLANTA' THEN 1000
 WHEN 'ST-KELAPA' THEN 840
 WHEN 'ST-KACANG' THEN 720
 WHEN 'ST-BENGGALI' THEN 100
 WHEN 'ST-KAYA' THEN 50000
 WHEN 'ST-BUTTER' THEN 48000
 WHEN 'ST-PLASTIC-S' THEN 500
 WHEN 'ST-PLASTIC-M' THEN 500
 WHEN 'ST-PLASTIC-B' THEN 200
 ELSE 0
 END,
 si.base_unit
FROM inventory_locations il
JOIN organizations o ON o.id = il.organization_id AND o.code = 'RKJ'
JOIN stock_items si ON si.organization_id = o.id
WHERE il.location_type = 'HQ_WAREHOUSE'
 AND si.item_code IN (
 'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
 'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
 )
ON CONFLICT (location_id, stock_item_id) DO NOTHING;

-- Branch kiosks — retail-ready stock per cawangan
INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
SELECT il.organization_id, il.id, si.id,
 CASE si.item_code
 WHEN 'ST-PLANTA' THEN 60
 WHEN 'ST-KELAPA' THEN 56
 WHEN 'ST-KACANG' THEN 48
 WHEN 'ST-BENGGALI' THEN 10
 WHEN 'ST-KAYA' THEN 2000
 WHEN 'ST-BUTTER' THEN 1500
 WHEN 'ST-PLASTIC-S' THEN 50
 WHEN 'ST-PLASTIC-M' THEN 50
 WHEN 'ST-PLASTIC-B' THEN 20
 ELSE 0
 END,
 si.base_unit
FROM inventory_locations il
JOIN organizations o ON o.id = il.organization_id AND o.code = 'RKJ'
JOIN stock_items si ON si.organization_id = o.id
WHERE il.location_type = 'BRANCH_KIOSK'
 AND il.branch_id IS NOT NULL
 AND si.item_code IN (
 'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
 'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
 )
ON CONFLICT (location_id, stock_item_id) DO NOTHING;

GRANT SELECT ON dashboard_stats TO authenticated;


-- ============================================================
-- 00022_missing_staff.sql
-- ============================================================

-- Historical no-op. Operational staff and banking records are imported from
-- a private file and are intentionally excluded from this source bundle.


-- ============================================================
-- 00023_pos_stock_validation.sql
-- ============================================================

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


-- ============================================================
-- 00024_benggali_category_rename.sql
-- ============================================================

-- Kategori & nama menu Benggali → Roti Benggali

UPDATE products
SET category = 'Roti Benggali'
WHERE category = 'Benggali';

UPDATE products
SET name = 'Roti Benggali - Kaya In Cup'
WHERE sku = 'KAYA-CUP' AND name = 'Kaya In Cup';


-- ============================================================
-- 00025_regions_rls_read.sql
-- ============================================================

-- Allow org members to read regions (fixes profile embed / dashboard queries)

CREATE POLICY org_read_regions ON regions
 FOR SELECT USING (organization_id = public.organization_id());


-- ============================================================
-- 00026_product_prices.sql
-- ============================================================

-- Pastikan harga POS ikut senarai rasmi (jika rekod wujud tanpa harga / RM 0)

UPDATE products p
SET price = v.price, updated_at = now()
FROM organizations o,
 (VALUES
 ('RK-KB-3', 10.0),
 ('RK-KB-1', 3.5),
 ('RK-KO-3', 7.0),
 ('RK-KO-1', 2.5),
 ('RKEL-K-3', 10.0),
 ('RKEL-K-1', 3.5),
 ('RKEL-3', 7.0),
 ('RKEL-1', 2.5),
 ('RKAC-K-3', 11.0),
 ('RKAC-K-1', 4.0),
 ('RKAC-3', 8.0),
 ('RKAC-1', 3.0),
 ('BENG-KB', 12.5),
 ('BENG-KO', 9.0),
 ('BENG-PL', 7.0),
 ('KAYA-CUP', 5.0)
 ) AS v(sku, price)
WHERE p.organization_id = o.id
 AND o.code = 'RKJ'
 AND p.sku = v.sku
 AND (p.price IS NULL OR p.price = 0);


-- ============================================================
-- 00027_planta_roti_kaya_bom.sql
-- ============================================================

-- Stok roti asas menu Roti Kaya (dahulu Planta) + lengkapkan BOM

UPDATE stock_items
SET
 name = 'Roti Kaya',
 category = 'Roti',
 notes = 'Stok roti asas menu Roti Kaya (nama kilang: Planta)',
 updated_at = now()
WHERE item_code = 'ST-PLANTA';

INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, v.qty, v.unit::stock_unit, v.min_q, v.max_q, true, v.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN (VALUES
 ('RK-KB-3','ST-PLANTA',3,'PCS',3::numeric,3::numeric,'Stok roti menu Roti Kaya'),
 ('RK-KB-1','ST-PLANTA',1,'PCS',1,1,'Stok roti menu Roti Kaya'),
 ('RK-KB-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RK-KB-1','ST-BUTTER',4,'GRAM',4,4,NULL),
 ('RK-KB-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RK-KO-3','ST-PLANTA',3,'PCS',3,3,'Stok roti menu Roti Kaya'),
 ('RK-KO-3','ST-KAYA',12,'GRAM',10,12,NULL),
 ('RK-KO-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RK-KO-1','ST-PLANTA',1,'PCS',1,1,'Stok roti menu Roti Kaya'),
 ('RK-KO-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RK-KO-1','ST-PLASTIC-S',1,'PCS',1,1,NULL)
) AS v(sku, item_code, qty, unit, min_q, max_q, notes)
 ON p.sku = v.sku AND si.item_code = v.item_code
WHERE o.code = 'RKJ'
ON CONFLICT (product_id, stock_item_id) DO UPDATE SET
 quantity = EXCLUDED.quantity,
 min_qty = EXCLUDED.min_qty,
 max_qty = EXCLUDED.max_qty,
 notes = EXCLUDED.notes,
 updated_at = now();

UPDATE product_bom pb
SET notes = 'Stok roti menu Roti Kaya', updated_at = now()
FROM products p, stock_items si
WHERE pb.product_id = p.id
 AND pb.stock_item_id = si.id
 AND si.item_code = 'ST-PLANTA'
 AND p.sku IN ('RK-KB-3','RK-KB-1','RK-KO-3','RK-KO-1');


-- ============================================================
-- 00028_planta_to_roti_kaya_stock.sql
-- ============================================================

-- Planta = stok roti asas menu Roti Kaya → namakan Roti Kaya

UPDATE stock_items
SET
 name = 'Roti Kaya',
 category = 'Roti',
 notes = 'Stok roti asas menu Roti Kaya (nama kilang: Planta)',
 updated_at = now()
WHERE item_code = 'ST-PLANTA';

UPDATE product_bom pb
SET notes = 'Stok roti menu Roti Kaya', updated_at = now()
FROM products p, stock_items si
WHERE pb.product_id = p.id
 AND pb.stock_item_id = si.id
 AND si.item_code = 'ST-PLANTA'
 AND p.sku IN ('RK-KB-3','RK-KB-1','RK-KO-3','RK-KO-1');


-- ============================================================
-- 00029_roti_kelapa_kacang_benggali.sql
-- ============================================================

-- Stok roti: Kelapa, Kacang, Benggali — nama dengan awalan Roti + BOM lengkap

UPDATE stock_items SET
 name = 'Roti Kelapa',
 category = 'Roti',
 notes = 'Stok roti asas menu Roti Kelapa',
 updated_at = now()
WHERE item_code = 'ST-KELAPA'
 OR name IN ('Kelapa', 'Roti Kelapa');

UPDATE stock_items SET
 name = 'Roti Kacang',
 category = 'Roti',
 notes = 'Stok roti asas menu Roti Kacang',
 updated_at = now()
WHERE item_code = 'ST-KACANG'
 OR name IN ('Kacang', 'Roti Kacang');

UPDATE stock_items SET
 name = 'Roti Benggali',
 category = 'Roti',
 notes = 'Stok roti asas menu Roti Benggali',
 updated_at = now()
WHERE item_code = 'ST-BENGGALI'
 OR name IN ('Benggali', 'Roti Benggali');

UPDATE products SET category = 'Roti Kelapa' WHERE category = 'Kelapa';
UPDATE products SET category = 'Roti Kacang' WHERE category = 'Kacang';
UPDATE products SET category = 'Roti Benggali' WHERE category = 'Benggali';

INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, v.qty, v.unit::stock_unit, v.min_q, v.max_q, true, v.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN (VALUES
 ('RKEL-K-3','ST-KELAPA',3,'PCS',3::numeric,3::numeric,'Stok roti menu Roti Kelapa'),
 ('RKEL-K-1','ST-KELAPA',1,'PCS',1,1,'Stok roti menu Roti Kelapa'),
 ('RKEL-K-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RKEL-K-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKEL-3','ST-KELAPA',3,'PCS',3,3,'Stok roti menu Roti Kelapa'),
 ('RKEL-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKEL-1','ST-KELAPA',1,'PCS',1,1,'Stok roti menu Roti Kelapa'),
 ('RKEL-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKAC-K-3','ST-KACANG',3,'PCS',3,3,'Stok roti menu Roti Kacang'),
 ('RKAC-K-3','ST-KAYA',12,'GRAM',10,12,NULL),
 ('RKAC-K-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKAC-K-1','ST-KACANG',1,'PCS',1,1,'Stok roti menu Roti Kacang'),
 ('RKAC-K-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RKAC-K-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKAC-3','ST-KACANG',3,'PCS',3,3,'Stok roti menu Roti Kacang'),
 ('RKAC-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKAC-1','ST-KACANG',1,'PCS',1,1,'Stok roti menu Roti Kacang'),
 ('RKAC-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('BENG-KO','ST-BENGGALI',1,'PCS',1,1,'Stok roti menu Roti Benggali'),
 ('BENG-KO','ST-KAYA',40,'GRAM',35,40,NULL),
 ('BENG-KO','ST-PLASTIC-B',1,'PCS',1,1,NULL),
 ('BENG-PL','ST-BENGGALI',1,'PCS',1,1,'Stok roti menu Roti Benggali'),
 ('BENG-PL','ST-PLASTIC-B',1,'PCS',1,1,NULL),
 ('KAYA-CUP','ST-KAYA',50,'GRAM',45,50,NULL)
) AS v(sku, item_code, qty, unit, min_q, max_q, notes)
 ON p.sku = v.sku AND si.item_code = v.item_code
WHERE o.code = 'RKJ'
ON CONFLICT (product_id, stock_item_id) DO UPDATE SET
 quantity = EXCLUDED.quantity,
 min_qty = EXCLUDED.min_qty,
 max_qty = EXCLUDED.max_qty,
 notes = EXCLUDED.notes,
 updated_at = now();

UPDATE product_bom pb SET notes = 'Stok roti menu Roti Kelapa', updated_at = now()
FROM products p, stock_items si
WHERE pb.product_id = p.id AND pb.stock_item_id = si.id
 AND si.item_code = 'ST-KELAPA';

UPDATE product_bom pb SET notes = 'Stok roti menu Roti Kacang', updated_at = now()
FROM products p, stock_items si
WHERE pb.product_id = p.id AND pb.stock_item_id = si.id
 AND si.item_code = 'ST-KACANG';

UPDATE product_bom pb SET notes = 'Stok roti menu Roti Benggali', updated_at = now()
FROM products p, stock_items si
WHERE pb.product_id = p.id AND pb.stock_item_id = si.id
 AND si.item_code = 'ST-BENGGALI';


-- ============================================================
-- 00030_four_menus_only.sql
-- ============================================================

-- Hanya 4 menu rasmi di POS; stok Packaging/Bahan/Roti kekal untuk inventory & BOM

UPDATE products
SET status = 'INACTIVE'::entity_status, updated_at = now()
WHERE category IS NOT NULL
 AND category NOT IN (
 'Roti Kaya', 'Roti Kacang', 'Roti Kelapa', 'Roti Benggali',
 'Kaya', 'Kacang', 'Kelapa', 'Benggali', 'Planta'
 );

UPDATE products SET category = 'Roti Kaya' WHERE category IN ('Kaya', 'Planta');
UPDATE products SET category = 'Roti Kacang' WHERE category = 'Kacang';
UPDATE products SET category = 'Roti Kelapa' WHERE category = 'Kelapa';
UPDATE products SET category = 'Roti Benggali' WHERE category = 'Benggali';

-- ============================================================
-- Rekod manual (optional - skip jika sudah wujud dalam schema_migrations)
-- ============================================================
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
 ('00019_fleet_master_rls'),
 ('00020_branch_status_rls'),
 ('00021_pos_opening_stock'),
 ('00022_missing_staff'),
 ('00023_pos_stock_validation'),
 ('00024_benggali_category_rename'),
 ('00025_regions_rls_read'),
 ('00026_product_prices'),
 ('00027_planta_roti_kaya_bom'),
 ('00028_planta_to_roti_kaya_stock'),
 ('00029_roti_kelapa_kacang_benggali'),
 ('00030_four_menus_only')
ON CONFLICT (version) DO NOTHING;
