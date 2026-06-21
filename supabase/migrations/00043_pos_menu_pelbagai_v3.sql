-- Menu Pelbagai POS v3 — 9 jenis · 21 SKU (varian Set Campur penuh)

INSERT INTO products (organization_id, sku, name, category, price, sale_unit, status, sort_order, notes)
SELECT o.id, v.sku, v.name, 'Pelbagai', v.price, v.unit, 'ACTIVE'::entity_status, v.ord, v.notes
FROM organizations o
CROSS JOIN (VALUES
  ('PLG-KBS-3', 'Roti Kaya (Butter Sahaja) · 3 pcs', 10.00, 'Set', 50, 'Pelbagai #1 · Tolak 3 pcs Roti Kaya'),
  ('PLG-KBS-1', 'Roti Kaya (Butter Sahaja) · 1 pcs', 3.30, 'Pcs', 51, 'Pelbagai #1 · Tolak 1 pcs Roti Kaya'),
  ('PLG-SCKB-111', 'Set Campur Kaya Butter · 1+1+1', 10.00, 'Set', 52, '1 Kaya Butter + 1 Kelapa (Kaya) + 1 Kacang (Kaya)'),
  ('PLG-SCKB-211', 'Set Campur Kaya Butter · 2K+1Kel', 10.00, 'Set', 53, '2 Kaya Butter + 1 Kelapa (Kaya)'),
  ('PLG-SCKB-212', 'Set Campur Kaya Butter · 2K+1Kac', 11.00, 'Set', 54, '2 Kaya Butter + 1 Kacang (Kaya)'),
  ('PLG-SCKB-121', 'Set Campur Kaya Butter · 2Kel+1Kac', 11.00, 'Set', 55, '2 Kelapa (Kaya) + 1 Kacang (Kaya)'),
  ('PLG-SCKB-112', 'Set Campur Kaya Butter · 2Kac+1K', 11.00, 'Set', 56, '2 Kacang (Kaya) + 1 Kaya Butter'),
  ('PLG-SCK-111', 'Set Campur Kaya · 1+1+1', 7.00, 'Set', 57, '1 Kaya Sahaja + 1 Kelapa + 1 Kacang'),
  ('PLG-SCK-211', 'Set Campur Kaya · 2K+1Kel', 7.00, 'Set', 58, '2 Kaya + 1 Kelapa'),
  ('PLG-SCK-212', 'Set Campur Kaya · 2K+1Kac', 8.00, 'Set', 59, '2 Kaya + 1 Kacang'),
  ('PLG-SCK-121', 'Set Campur Kaya · 2Kel+1Kac', 8.00, 'Set', 60, '2 Kelapa + 1 Kacang'),
  ('PLG-SCK-112', 'Set Campur Kaya · 2Kac+1K (RM8)', 8.00, 'Set', 61, '2 Kacang + 1 Kaya'),
  ('PLG-SCK-113', 'Set Campur Kaya · 2Kac+1K (RM9)', 9.00, 'Set', 62, '2 Kacang + 1 Kaya'),
  ('PLG-BSEP', 'Set Benggali Separuh', 12.00, 'Set', 63, 'Separuh Kaya Sahaja + Separuh Kaya Butter · Tolak 1 pcs Benggali'),
  ('PLG-BBO', 'Set Benggali Butter Only', 9.00, 'Set', 64, 'Tolak 1 pcs Benggali'),
  ('PLG-BHKB', 'Set Separuh Benggali Kaya Butter', 7.00, 'Set', 65, 'Tolak ½ pcs Benggali'),
  ('PLG-BHK', 'Set Separuh Benggali Kaya Sahaja', 6.00, 'Set', 66, 'Tolak ½ pcs Benggali'),
  ('PLG-KACB-1', 'Set Kacang Butter · 1 pcs', 4.50, 'Pcs', 67, 'Tolak 1 pcs Kacang'),
  ('PLG-KACB-3', 'Set Kacang Butter · 3 pcs', 11.00, 'Set', 68, 'Tolak 3 pcs Kacang'),
  ('PLG-KELB-1', 'Set Kelapa Butter · 1 pcs', 3.50, 'Pcs', 69, 'Tolak 1 pcs Kelapa'),
  ('PLG-KELB-3', 'Set Kelapa Butter · 3 pcs', 10.00, 'Set', 70, 'Tolak 3 pcs Kelapa')
) AS v(sku, name, price, unit, ord, notes)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, sku) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  sale_unit = EXCLUDED.sale_unit,
  sort_order = EXCLUDED.sort_order,
  notes = EXCLUDED.notes,
  status = 'ACTIVE'::entity_status,
  updated_at = now();

-- Nyahaktif SKU Pelbagai lama / tidak rasmi
UPDATE products p
SET status = 'INACTIVE'::entity_status, updated_at = now()
FROM organizations o
WHERE p.organization_id = o.id
  AND o.code = 'RKJ'
  AND p.category = 'Pelbagai'
  AND p.sku NOT IN (
    'PLG-KBS-3', 'PLG-KBS-1',
    'PLG-SCKB-111', 'PLG-SCKB-211', 'PLG-SCKB-212', 'PLG-SCKB-121', 'PLG-SCKB-112',
    'PLG-SCK-111', 'PLG-SCK-211', 'PLG-SCK-212', 'PLG-SCK-121', 'PLG-SCK-112', 'PLG-SCK-113',
    'PLG-BSEP', 'PLG-BBO', 'PLG-BHKB', 'PLG-BHK',
    'PLG-KACB-1', 'PLG-KACB-3', 'PLG-KELB-1', 'PLG-KELB-3'
  );

-- BOM: tolakan ikut kandungan set (pcs roti kiosk)
INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, v.qty, v.unit::stock_unit, v.qty, v.qty, true, v.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN (VALUES
  ('PLG-KBS-3', 'ST-PLANTA', 3, 'PCS', '3 pcs Roti Kaya'),
  ('PLG-KBS-1', 'ST-PLANTA', 1, 'PCS', '1 pcs Roti Kaya'),
  ('PLG-SCKB-111', 'ST-PLANTA', 1, 'PCS', 'Kaya Butter'),
  ('PLG-SCKB-111', 'ST-KELAPA', 1, 'PCS', 'Kelapa (Kaya)'),
  ('PLG-SCKB-111', 'ST-KACANG', 1, 'PCS', 'Kacang (Kaya)'),
  ('PLG-SCKB-211', 'ST-PLANTA', 2, 'PCS', '2 Kaya Butter'),
  ('PLG-SCKB-211', 'ST-KELAPA', 1, 'PCS', 'Kelapa (Kaya)'),
  ('PLG-SCKB-212', 'ST-PLANTA', 2, 'PCS', '2 Kaya Butter'),
  ('PLG-SCKB-212', 'ST-KACANG', 1, 'PCS', 'Kacang (Kaya)'),
  ('PLG-SCKB-121', 'ST-KELAPA', 2, 'PCS', '2 Kelapa (Kaya)'),
  ('PLG-SCKB-121', 'ST-KACANG', 1, 'PCS', 'Kacang (Kaya)'),
  ('PLG-SCKB-112', 'ST-KACANG', 2, 'PCS', '2 Kacang (Kaya)'),
  ('PLG-SCKB-112', 'ST-PLANTA', 1, 'PCS', 'Kaya Butter'),
  ('PLG-SCK-111', 'ST-PLANTA', 1, 'PCS', 'Kaya Sahaja'),
  ('PLG-SCK-111', 'ST-KELAPA', 1, 'PCS', 'Kelapa'),
  ('PLG-SCK-111', 'ST-KACANG', 1, 'PCS', 'Kacang'),
  ('PLG-SCK-211', 'ST-PLANTA', 2, 'PCS', '2 Kaya'),
  ('PLG-SCK-211', 'ST-KELAPA', 1, 'PCS', 'Kelapa'),
  ('PLG-SCK-212', 'ST-PLANTA', 2, 'PCS', '2 Kaya'),
  ('PLG-SCK-212', 'ST-KACANG', 1, 'PCS', 'Kacang'),
  ('PLG-SCK-121', 'ST-KELAPA', 2, 'PCS', '2 Kelapa'),
  ('PLG-SCK-121', 'ST-KACANG', 1, 'PCS', 'Kacang'),
  ('PLG-SCK-112', 'ST-KACANG', 2, 'PCS', '2 Kacang'),
  ('PLG-SCK-112', 'ST-PLANTA', 1, 'PCS', 'Kaya'),
  ('PLG-SCK-113', 'ST-KACANG', 2, 'PCS', '2 Kacang'),
  ('PLG-SCK-113', 'ST-PLANTA', 1, 'PCS', 'Kaya'),
  ('PLG-BSEP', 'ST-BENGGALI', 1, 'PCS', '1 pcs Benggali'),
  ('PLG-BBO', 'ST-BENGGALI', 1, 'PCS', '1 pcs Benggali'),
  ('PLG-BHKB', 'ST-BENGGALI', 0.5, 'PCS', '½ pcs Benggali'),
  ('PLG-BHK', 'ST-BENGGALI', 0.5, 'PCS', '½ pcs Benggali'),
  ('PLG-KACB-1', 'ST-KACANG', 1, 'PCS', '1 pcs Kacang'),
  ('PLG-KACB-3', 'ST-KACANG', 3, 'PCS', '3 pcs Kacang'),
  ('PLG-KELB-1', 'ST-KELAPA', 1, 'PCS', '1 pcs Kelapa'),
  ('PLG-KELB-3', 'ST-KELAPA', 3, 'PCS', '3 pcs Kelapa')
) AS v(sku, item_code, qty, unit, notes)
  ON p.sku = v.sku AND si.item_code = v.item_code
WHERE o.code = 'RKJ'
ON CONFLICT (product_id, stock_item_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  min_qty = EXCLUDED.min_qty,
  max_qty = EXCLUDED.max_qty,
  notes = EXCLUDED.notes,
  auto_deduct = true,
  updated_at = now();

-- Buang BOM lama produk Pelbagai yang dinyahaktif
DELETE FROM product_bom pb
USING products p, organizations o
WHERE pb.product_id = p.id
  AND p.organization_id = o.id
  AND o.code = 'RKJ'
  AND p.category = 'Pelbagai'
  AND p.status = 'INACTIVE'::entity_status;
