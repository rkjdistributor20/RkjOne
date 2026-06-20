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
