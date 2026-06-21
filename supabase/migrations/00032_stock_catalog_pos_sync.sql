-- 00032: Selaraskan 9 item stok dengan POS (catalog rasmi)
-- Roti Kaya 1 bag=20pcs, Kelapa 28, Kacang 24, Benggali 2
-- Kaya 1 tong=5kg, Butter 1 tong=4.8kg, Plastic S/M/B 1 bag=100pcs

UPDATE stock_items SET name='Roti Kaya', category='Roti', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 20 pcs', pack_quantity=20, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-PLANTA';
UPDATE stock_items SET name='Roti Kelapa', category='Roti', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 28 pcs', pack_quantity=28, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-KELAPA';
UPDATE stock_items SET name='Roti Kacang', category='Roti', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 24 pcs', pack_quantity=24, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-KACANG';
UPDATE stock_items SET name='Roti Benggali', category='Roti', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 2 pcs', pack_quantity=2, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-BENGGALI';
UPDATE stock_items SET name='Kaya', category='Bahan', base_unit='GRAM', storage_unit='Tong/Kg/Gram', conversion_text='1 tong = 5kg', pack_quantity=5000, pack_unit='TONG', status='ACTIVE', updated_at=now() WHERE item_code='ST-KAYA';
UPDATE stock_items SET name='Butter', category='Bahan', base_unit='GRAM', storage_unit='Tong/Kg/Gram', conversion_text='1 tong = 4.8kg', pack_quantity=4800, pack_unit='TONG', status='ACTIVE', updated_at=now() WHERE item_code='ST-BUTTER';
UPDATE stock_items SET name='Plastic S', category='Packaging', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 100 pcs', pack_quantity=100, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-PLASTIC-S';
UPDATE stock_items SET name='Plastic M', category='Packaging', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 100 pcs', pack_quantity=100, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-PLASTIC-M';
UPDATE stock_items SET name='Plastic B', category='Packaging', base_unit='PCS', storage_unit='Bag/Pcs', conversion_text='1 bag = 100 pcs', pack_quantity=100, pack_unit='BAG', status='ACTIVE', updated_at=now() WHERE item_code='ST-PLASTIC-B';

UPDATE stock_items SET status='INACTIVE', updated_at=now()
WHERE item_code IN ('STK001','STK002','STK003','STK004','STK005','STK006','PKG001','PKG002','PKG003');
