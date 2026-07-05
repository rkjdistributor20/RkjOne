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
