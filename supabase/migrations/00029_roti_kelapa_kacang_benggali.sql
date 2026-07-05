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
