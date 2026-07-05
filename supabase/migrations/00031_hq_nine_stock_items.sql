-- Gudang HQ: 9 jenis stok sahaja + gabung duplikat STK/PKG
-- Roti Kaya (ST-PLANTA): 1 bag = 20 pcs

-- Pastikan 9 item rasmi betul (nama, penukaran bag/pcs)
UPDATE stock_items SET
 name = 'Roti Kaya',
 category = 'Roti',
 base_unit = 'PCS',
 storage_unit = 'Bag/Pcs',
 conversion_text = '1 bag = 20 pcs',
 pack_quantity = 20,
 pack_unit = 'BAG',
 notes = 'Stok roti asas menu Roti Kaya (nama kilang: Planta)',
 status = 'ACTIVE',
 updated_at = now()
WHERE item_code = 'ST-PLANTA';

UPDATE stock_items SET
 name = 'Roti Kelapa', category = 'Roti', base_unit = 'PCS',
 storage_unit = 'Bag/Pcs', conversion_text = '1 bag = 28 pcs',
 pack_quantity = 28, pack_unit = 'BAG', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-KELAPA';

UPDATE stock_items SET
 name = 'Roti Kacang', category = 'Roti', base_unit = 'PCS',
 storage_unit = 'Bag/Pcs', conversion_text = '1 bag = 24 pcs',
 pack_quantity = 24, pack_unit = 'BAG', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-KACANG';

UPDATE stock_items SET
 name = 'Roti Benggali', category = 'Roti', base_unit = 'PCS',
 storage_unit = 'Bag/Pcs', conversion_text = '1 bag = 2 pcs',
 pack_quantity = 2, pack_unit = 'BAG', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-BENGGALI';

UPDATE stock_items SET
 name = 'Kaya', category = 'Bahan', base_unit = 'GRAM',
 storage_unit = 'Tong/Kg/Gram', conversion_text = '1 tong = 5kg = 5000g',
 pack_quantity = 5000, pack_unit = 'TONG', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-KAYA';

UPDATE stock_items SET
 name = 'Butter', category = 'Bahan', base_unit = 'GRAM',
 storage_unit = 'Tong/Kg/Gram', conversion_text = '1 tong = 4.8kg = 4800g',
 pack_quantity = 4800, pack_unit = 'TONG', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-BUTTER';

UPDATE stock_items SET
 name = 'Plastic Small', category = 'Packaging', base_unit = 'PCS',
 storage_unit = 'Pack/Pcs', conversion_text = '1 pack = 100 pcs',
 pack_quantity = 100, pack_unit = 'PACK', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-PLASTIC-S';

UPDATE stock_items SET
 name = 'Plastic Medium', category = 'Packaging', base_unit = 'PCS',
 storage_unit = 'Pack/Pcs', conversion_text = '1 pack = 100 pcs',
 pack_quantity = 100, pack_unit = 'PACK', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-PLASTIC-M';

UPDATE stock_items SET
 name = 'Plastic Big', category = 'Packaging', base_unit = 'PCS',
 storage_unit = 'Pack/Pcs', conversion_text = '1 pack = 100 pcs',
 pack_quantity = 100, pack_unit = 'PACK', status = 'ACTIVE', updated_at = now()
WHERE item_code = 'ST-PLASTIC-B';

-- Gabung baki duplikat → item rasmi (STK001→ST-PLANTA, PKG001→ST-PLASTIC-S, dll.)
DO $$
DECLARE
 v_org UUID;
 v_dup RECORD;
 v_canonical UUID;
 v_dup_bal RECORD;
BEGIN
 SELECT id INTO v_org FROM organizations WHERE code = 'RKJ' LIMIT 1;
 IF v_org IS NULL THEN RETURN; END IF;

 FOR v_dup IN
 SELECT * FROM (VALUES
 ('STK001', 'ST-PLANTA'),
 ('STK002', 'ST-KELAPA'),
 ('STK003', 'ST-KACANG'),
 ('STK004', 'ST-BENGGALI'),
 ('STK005', 'ST-KAYA'),
 ('STK006', 'ST-BUTTER'),
 ('PKG001', 'ST-PLASTIC-S'),
 ('PKG002', 'ST-PLASTIC-M'),
 ('PKG003', 'ST-PLASTIC-B')
 ) AS t(dup_code, canon_code)
 LOOP
 SELECT id INTO v_canonical FROM stock_items
 WHERE organization_id = v_org AND item_code = v_dup.canon_code;

 IF v_canonical IS NULL THEN CONTINUE; END IF;

 FOR v_dup_bal IN
 SELECT ib.* FROM inventory_balances ib
 JOIN stock_items si ON si.id = ib.stock_item_id
 WHERE si.organization_id = v_org AND si.item_code = v_dup.dup_code
 LOOP
 INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
 VALUES (v_dup_bal.organization_id, v_dup_bal.location_id, v_canonical, v_dup_bal.quantity, v_dup_bal.unit)
 ON CONFLICT (location_id, stock_item_id) DO UPDATE SET
 quantity = inventory_balances.quantity + EXCLUDED.quantity,
 updated_at = now();

 DELETE FROM inventory_balances WHERE id = v_dup_bal.id;
 END LOOP;

 -- Alih BOM ke item rasmi (abaikan jika sudah wujud)
 UPDATE product_bom pb SET stock_item_id = v_canonical, updated_at = now()
 FROM stock_items si
 WHERE pb.stock_item_id = si.id
 AND si.organization_id = v_org
 AND si.item_code = v_dup.dup_code
 AND NOT EXISTS (
 SELECT 1 FROM product_bom pb2
 WHERE pb2.product_id = pb.product_id AND pb2.stock_item_id = v_canonical
 );

 DELETE FROM product_bom pb
 USING stock_items si
 WHERE pb.stock_item_id = si.id
 AND si.organization_id = v_org
 AND si.item_code = v_dup.dup_code;

 UPDATE stock_items SET status = 'INACTIVE', updated_at = now()
 WHERE organization_id = v_org AND item_code = v_dup.dup_code;
 END LOOP;
END $$;

-- Buang baki HQ untuk item bukan 9 jenis rasmi
DELETE FROM inventory_balances ib
USING inventory_locations il, stock_items si
WHERE ib.location_id = il.id
 AND ib.stock_item_id = si.id
 AND il.location_type = 'HQ_WAREHOUSE'
 AND si.item_code NOT IN (
 'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
 'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
 );

-- Pastikan 9 baki wujud di HQ (jika tiada selepas gabung)
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
 AND si.status = 'ACTIVE'
ON CONFLICT (location_id, stock_item_id) DO NOTHING;
