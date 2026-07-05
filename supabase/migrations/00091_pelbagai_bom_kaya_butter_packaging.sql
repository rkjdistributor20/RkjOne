-- Pelbagai POS BOM: roti kiosk + kaya + butter + packaging.
-- Formula ini menyelaraskan tolakan stok POS supaya setiap jualan Pelbagai
-- menolak bahan sebenar yang digunakan oleh cawangan.

WITH product_updates(sku, name, notes) AS (
 VALUES
 ('PLG-KBS-3', 'Roti Kaya (Butter Sahaja) - 3 pcs', 'Tolak 3 Roti Kaya, 12g butter, 1 plastik M'),
 ('PLG-KBS-1', 'Roti Kaya (Butter Sahaja) - 1 pcs', 'Tolak 1 Roti Kaya, 4g butter, 1 plastik S'),
 ('PLG-SCKB-111', 'Set Campur Kaya Butter - 1+1+1', 'Tolak 1 Kaya, 1 Kelapa, 1 Kacang, 12g kaya, 4g butter, 1 plastik M'),
 ('PLG-SCKB-211', 'Set Campur Kaya Butter - 2K+1Kel', 'Tolak 2 Kaya, 1 Kelapa, 12g kaya, 8g butter, 1 plastik M'),
 ('PLG-SCKB-212', 'Set Campur Kaya Butter - 2K+1Kac', 'Tolak 2 Kaya, 1 Kacang, 12g kaya, 8g butter, 1 plastik M'),
 ('PLG-SCKB-121', 'Set Campur Kaya Butter - 2Kel+1Kac', 'Tolak 2 Kelapa, 1 Kacang, 12g kaya, 1 plastik M'),
 ('PLG-SCKB-112', 'Set Campur Kaya Butter - 2Kac+1K', 'Tolak 2 Kacang, 1 Kaya, 12g kaya, 4g butter, 1 plastik M'),
 ('PLG-SCK-111', 'Set Campur Kaya - 1+1+1', 'Tolak 1 Kaya, 1 Kelapa, 1 Kacang, 12g kaya, 1 plastik M'),
 ('PLG-SCK-211', 'Set Campur Kaya - 2K+1Kel', 'Tolak 2 Kaya, 1 Kelapa, 12g kaya, 1 plastik M'),
 ('PLG-SCK-212', 'Set Campur Kaya - 2K+1Kac', 'Tolak 2 Kaya, 1 Kacang, 12g kaya, 1 plastik M'),
 ('PLG-SCK-121', 'Set Campur Kaya - 2Kel+1Kac', 'Tolak 2 Kelapa, 1 Kacang, 12g kaya, 1 plastik M'),
 ('PLG-SCK-112', 'Set Campur Kaya - 2Kac+1K (RM8)', 'Tolak 2 Kacang, 1 Kaya, 12g kaya, 1 plastik M'),
 ('PLG-SCK-113', 'Set Campur Kaya - 2Kac+1K (RM9)', 'Tolak 2 Kacang, 1 Kaya, 12g kaya, 1 plastik M'),
 ('PLG-BSEP', 'Set Benggali Separuh', 'Tolak 1 Benggali, 42.5g kaya, 22.5g butter, 1 plastik B'),
 ('PLG-BBO', 'Set Benggali Butter Only', 'Tolak 1 Benggali, 45g butter, 1 plastik B'),
 ('PLG-BHKB', 'Set Separuh Benggali Kaya Butter', 'Tolak 0.5 Benggali, 22.5g kaya, 22.5g butter, 1 plastik B'),
 ('PLG-BHK', 'Set Separuh Benggali Kaya Sahaja', 'Tolak 0.5 Benggali, 20g kaya, 1 plastik B'),
 ('PLG-KACB-1', 'Set Kacang Butter - 1 pcs', 'Tolak 1 Kacang, 4g butter, 1 plastik S'),
 ('PLG-KACB-3', 'Set Kacang Butter - 3 pcs', 'Tolak 3 Kacang, 12g butter, 1 plastik M'),
 ('PLG-KELB-1', 'Set Kelapa Butter - 1 pcs', 'Tolak 1 Kelapa, 4g butter, 1 plastik S'),
 ('PLG-KELB-3', 'Set Kelapa Butter - 3 pcs', 'Tolak 3 Kelapa, 12g butter, 1 plastik M')
)
UPDATE products p
SET name = u.name,
 notes = u.notes,
 updated_at = now()
FROM organizations o, product_updates u
WHERE p.organization_id = o.id
 AND o.code = 'RKJ'
 AND p.category = 'Pelbagai'
 AND p.sku = u.sku;

WITH expected_bom(sku, item_code, qty, unit, notes) AS (
 VALUES
 ('PLG-KBS-3', 'ST-PLANTA', 3::numeric, 'PCS', 'Pelbagai: 3 Roti Kaya'),
 ('PLG-KBS-3', 'ST-BUTTER', 12::numeric, 'GRAM', 'Pelbagai: 12g butter'),
 ('PLG-KBS-3', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-KBS-1', 'ST-PLANTA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kaya'),
 ('PLG-KBS-1', 'ST-BUTTER', 4::numeric, 'GRAM', 'Pelbagai: 4g butter'),
 ('PLG-KBS-1', 'ST-PLASTIC-S', 1::numeric, 'PCS', 'Pelbagai: 1 plastik S'),
 ('PLG-SCKB-111', 'ST-PLANTA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kaya Butter'),
 ('PLG-SCKB-111', 'ST-KELAPA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kelapa'),
 ('PLG-SCKB-111', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-SCKB-111', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCKB-111', 'ST-BUTTER', 4::numeric, 'GRAM', 'Pelbagai: 4g butter'),
 ('PLG-SCKB-111', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCKB-211', 'ST-PLANTA', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kaya Butter'),
 ('PLG-SCKB-211', 'ST-KELAPA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kelapa'),
 ('PLG-SCKB-211', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCKB-211', 'ST-BUTTER', 8::numeric, 'GRAM', 'Pelbagai: 8g butter'),
 ('PLG-SCKB-211', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCKB-212', 'ST-PLANTA', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kaya Butter'),
 ('PLG-SCKB-212', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-SCKB-212', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCKB-212', 'ST-BUTTER', 8::numeric, 'GRAM', 'Pelbagai: 8g butter'),
 ('PLG-SCKB-212', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCKB-121', 'ST-KELAPA', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kelapa'),
 ('PLG-SCKB-121', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-SCKB-121', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCKB-121', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCKB-112', 'ST-KACANG', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kacang'),
 ('PLG-SCKB-112', 'ST-PLANTA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kaya Butter'),
 ('PLG-SCKB-112', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCKB-112', 'ST-BUTTER', 4::numeric, 'GRAM', 'Pelbagai: 4g butter'),
 ('PLG-SCKB-112', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCK-111', 'ST-PLANTA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kaya'),
 ('PLG-SCK-111', 'ST-KELAPA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kelapa'),
 ('PLG-SCK-111', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-SCK-111', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCK-111', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCK-211', 'ST-PLANTA', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kaya'),
 ('PLG-SCK-211', 'ST-KELAPA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kelapa'),
 ('PLG-SCK-211', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCK-211', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCK-212', 'ST-PLANTA', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kaya'),
 ('PLG-SCK-212', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-SCK-212', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCK-212', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCK-121', 'ST-KELAPA', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kelapa'),
 ('PLG-SCK-121', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-SCK-121', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCK-121', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCK-112', 'ST-KACANG', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kacang'),
 ('PLG-SCK-112', 'ST-PLANTA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kaya'),
 ('PLG-SCK-112', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCK-112', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-SCK-113', 'ST-KACANG', 2::numeric, 'PCS', 'Pelbagai: 2 Roti Kacang'),
 ('PLG-SCK-113', 'ST-PLANTA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kaya'),
 ('PLG-SCK-113', 'ST-KAYA', 12::numeric, 'GRAM', 'Pelbagai: 12g kaya'),
 ('PLG-SCK-113', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-BSEP', 'ST-BENGGALI', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Benggali'),
 ('PLG-BSEP', 'ST-KAYA', 42.5::numeric, 'GRAM', 'Pelbagai: 42.5g kaya'),
 ('PLG-BSEP', 'ST-BUTTER', 22.5::numeric, 'GRAM', 'Pelbagai: 22.5g butter'),
 ('PLG-BSEP', 'ST-PLASTIC-B', 1::numeric, 'PCS', 'Pelbagai: 1 plastik B'),
 ('PLG-BBO', 'ST-BENGGALI', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Benggali'),
 ('PLG-BBO', 'ST-BUTTER', 45::numeric, 'GRAM', 'Pelbagai: 45g butter'),
 ('PLG-BBO', 'ST-PLASTIC-B', 1::numeric, 'PCS', 'Pelbagai: 1 plastik B'),
 ('PLG-BHKB', 'ST-BENGGALI', 0.5::numeric, 'PCS', 'Pelbagai: 0.5 Roti Benggali'),
 ('PLG-BHKB', 'ST-KAYA', 22.5::numeric, 'GRAM', 'Pelbagai: 22.5g kaya'),
 ('PLG-BHKB', 'ST-BUTTER', 22.5::numeric, 'GRAM', 'Pelbagai: 22.5g butter'),
 ('PLG-BHKB', 'ST-PLASTIC-B', 1::numeric, 'PCS', 'Pelbagai: 1 plastik B'),
 ('PLG-BHK', 'ST-BENGGALI', 0.5::numeric, 'PCS', 'Pelbagai: 0.5 Roti Benggali'),
 ('PLG-BHK', 'ST-KAYA', 20::numeric, 'GRAM', 'Pelbagai: 20g kaya'),
 ('PLG-BHK', 'ST-PLASTIC-B', 1::numeric, 'PCS', 'Pelbagai: 1 plastik B'),
 ('PLG-KACB-1', 'ST-KACANG', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kacang'),
 ('PLG-KACB-1', 'ST-BUTTER', 4::numeric, 'GRAM', 'Pelbagai: 4g butter'),
 ('PLG-KACB-1', 'ST-PLASTIC-S', 1::numeric, 'PCS', 'Pelbagai: 1 plastik S'),
 ('PLG-KACB-3', 'ST-KACANG', 3::numeric, 'PCS', 'Pelbagai: 3 Roti Kacang'),
 ('PLG-KACB-3', 'ST-BUTTER', 12::numeric, 'GRAM', 'Pelbagai: 12g butter'),
 ('PLG-KACB-3', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M'),
 ('PLG-KELB-1', 'ST-KELAPA', 1::numeric, 'PCS', 'Pelbagai: 1 Roti Kelapa'),
 ('PLG-KELB-1', 'ST-BUTTER', 4::numeric, 'GRAM', 'Pelbagai: 4g butter'),
 ('PLG-KELB-1', 'ST-PLASTIC-S', 1::numeric, 'PCS', 'Pelbagai: 1 plastik S'),
 ('PLG-KELB-3', 'ST-KELAPA', 3::numeric, 'PCS', 'Pelbagai: 3 Roti Kelapa'),
 ('PLG-KELB-3', 'ST-BUTTER', 12::numeric, 'GRAM', 'Pelbagai: 12g butter'),
 ('PLG-KELB-3', 'ST-PLASTIC-M', 1::numeric, 'PCS', 'Pelbagai: 1 plastik M')
)
INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, e.qty, e.unit::stock_unit, e.qty, e.qty, true, e.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN expected_bom e ON p.sku = e.sku AND si.item_code = e.item_code
WHERE o.code = 'RKJ'
 AND p.category = 'Pelbagai'
ON CONFLICT (product_id, stock_item_id) DO UPDATE SET
 quantity = EXCLUDED.quantity,
 unit = EXCLUDED.unit,
 min_qty = EXCLUDED.min_qty,
 max_qty = EXCLUDED.max_qty,
 notes = EXCLUDED.notes,
 auto_deduct = true,
 updated_at = now();

WITH expected_bom(sku, item_code) AS (
 VALUES
 ('PLG-KBS-3', 'ST-PLANTA'), ('PLG-KBS-3', 'ST-BUTTER'), ('PLG-KBS-3', 'ST-PLASTIC-M'),
 ('PLG-KBS-1', 'ST-PLANTA'), ('PLG-KBS-1', 'ST-BUTTER'), ('PLG-KBS-1', 'ST-PLASTIC-S'),
 ('PLG-SCKB-111', 'ST-PLANTA'), ('PLG-SCKB-111', 'ST-KELAPA'), ('PLG-SCKB-111', 'ST-KACANG'), ('PLG-SCKB-111', 'ST-KAYA'), ('PLG-SCKB-111', 'ST-BUTTER'), ('PLG-SCKB-111', 'ST-PLASTIC-M'),
 ('PLG-SCKB-211', 'ST-PLANTA'), ('PLG-SCKB-211', 'ST-KELAPA'), ('PLG-SCKB-211', 'ST-KAYA'), ('PLG-SCKB-211', 'ST-BUTTER'), ('PLG-SCKB-211', 'ST-PLASTIC-M'),
 ('PLG-SCKB-212', 'ST-PLANTA'), ('PLG-SCKB-212', 'ST-KACANG'), ('PLG-SCKB-212', 'ST-KAYA'), ('PLG-SCKB-212', 'ST-BUTTER'), ('PLG-SCKB-212', 'ST-PLASTIC-M'),
 ('PLG-SCKB-121', 'ST-KELAPA'), ('PLG-SCKB-121', 'ST-KACANG'), ('PLG-SCKB-121', 'ST-KAYA'), ('PLG-SCKB-121', 'ST-PLASTIC-M'),
 ('PLG-SCKB-112', 'ST-KACANG'), ('PLG-SCKB-112', 'ST-PLANTA'), ('PLG-SCKB-112', 'ST-KAYA'), ('PLG-SCKB-112', 'ST-BUTTER'), ('PLG-SCKB-112', 'ST-PLASTIC-M'),
 ('PLG-SCK-111', 'ST-PLANTA'), ('PLG-SCK-111', 'ST-KELAPA'), ('PLG-SCK-111', 'ST-KACANG'), ('PLG-SCK-111', 'ST-KAYA'), ('PLG-SCK-111', 'ST-PLASTIC-M'),
 ('PLG-SCK-211', 'ST-PLANTA'), ('PLG-SCK-211', 'ST-KELAPA'), ('PLG-SCK-211', 'ST-KAYA'), ('PLG-SCK-211', 'ST-PLASTIC-M'),
 ('PLG-SCK-212', 'ST-PLANTA'), ('PLG-SCK-212', 'ST-KACANG'), ('PLG-SCK-212', 'ST-KAYA'), ('PLG-SCK-212', 'ST-PLASTIC-M'),
 ('PLG-SCK-121', 'ST-KELAPA'), ('PLG-SCK-121', 'ST-KACANG'), ('PLG-SCK-121', 'ST-KAYA'), ('PLG-SCK-121', 'ST-PLASTIC-M'),
 ('PLG-SCK-112', 'ST-KACANG'), ('PLG-SCK-112', 'ST-PLANTA'), ('PLG-SCK-112', 'ST-KAYA'), ('PLG-SCK-112', 'ST-PLASTIC-M'),
 ('PLG-SCK-113', 'ST-KACANG'), ('PLG-SCK-113', 'ST-PLANTA'), ('PLG-SCK-113', 'ST-KAYA'), ('PLG-SCK-113', 'ST-PLASTIC-M'),
 ('PLG-BSEP', 'ST-BENGGALI'), ('PLG-BSEP', 'ST-KAYA'), ('PLG-BSEP', 'ST-BUTTER'), ('PLG-BSEP', 'ST-PLASTIC-B'),
 ('PLG-BBO', 'ST-BENGGALI'), ('PLG-BBO', 'ST-BUTTER'), ('PLG-BBO', 'ST-PLASTIC-B'),
 ('PLG-BHKB', 'ST-BENGGALI'), ('PLG-BHKB', 'ST-KAYA'), ('PLG-BHKB', 'ST-BUTTER'), ('PLG-BHKB', 'ST-PLASTIC-B'),
 ('PLG-BHK', 'ST-BENGGALI'), ('PLG-BHK', 'ST-KAYA'), ('PLG-BHK', 'ST-PLASTIC-B'),
 ('PLG-KACB-1', 'ST-KACANG'), ('PLG-KACB-1', 'ST-BUTTER'), ('PLG-KACB-1', 'ST-PLASTIC-S'),
 ('PLG-KACB-3', 'ST-KACANG'), ('PLG-KACB-3', 'ST-BUTTER'), ('PLG-KACB-3', 'ST-PLASTIC-M'),
 ('PLG-KELB-1', 'ST-KELAPA'), ('PLG-KELB-1', 'ST-BUTTER'), ('PLG-KELB-1', 'ST-PLASTIC-S'),
 ('PLG-KELB-3', 'ST-KELAPA'), ('PLG-KELB-3', 'ST-BUTTER'), ('PLG-KELB-3', 'ST-PLASTIC-M')
),
stale_bom AS (
 SELECT pb.id
 FROM product_bom pb
 JOIN products p ON p.id = pb.product_id
 JOIN organizations o ON o.id = p.organization_id
 JOIN stock_items si ON si.id = pb.stock_item_id
 LEFT JOIN expected_bom e ON e.sku = p.sku AND e.item_code = si.item_code
 WHERE o.code = 'RKJ'
  AND p.category = 'Pelbagai'
  AND p.status = 'ACTIVE'::entity_status
  AND e.sku IS NULL
)
DELETE FROM product_bom pb
USING stale_bom s
WHERE pb.id = s.id;

DELETE FROM product_bom pb
USING products p, organizations o
WHERE pb.product_id = p.id
 AND p.organization_id = o.id
 AND o.code = 'RKJ'
 AND p.category = 'Pelbagai'
 AND p.status = 'INACTIVE'::entity_status;
