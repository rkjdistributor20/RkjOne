-- Menu Pelbagai POS v2 — ganti dengan spesifikasi rasmi (9 jenis · 12 SKU)
-- Tolakan stok: Roti Kaya (ST-PLANTA), Kelapa, Kacang, Benggali sahaja

INSERT INTO products (organization_id, sku, name, category, price, sale_unit, status, sort_order, notes)
SELECT o.id, v.sku, v.name, 'Pelbagai', v.price, v.unit, 'ACTIVE'::entity_status, v.ord, v.notes
FROM organizations o
CROSS JOIN (VALUES
  (
    'PLG-KBS-3',
    'Roti Kaya (Butter Sahaja) · 3 pcs',
    10.00,
    'Set',
    50,
    'Menu Pelbagai #1 · Tolak 3 pcs Stok Roti Kaya'
  ),
  (
    'PLG-KBS-1',
    'Roti Kaya (Butter Sahaja) · 1 pcs',
    3.30,
    'Pcs',
    51,
    'Menu Pelbagai #1 · Tolak 1 pcs Stok Roti Kaya'
  ),
  (
    'PLG-SCKB',
    'Set Campur Kaya Butter',
    10.00,
    'Set',
    52,
    'Menu Pelbagai #2 · 1× Kaya Butter + 1× Kelapa (Kaya) + 1× Kacang (Kaya) · Tolak 1 pcs Kaya, Kelapa, Kacang'
  ),
  (
    'PLG-SCK',
    'Set Campur Kaya',
    7.50,
    'Set',
    53,
    'Menu Pelbagai #3 · 1× Kaya Sahaja + 1× Kelapa Sahaja + 1× Kacang Sahaja · Tolak 1 pcs Kaya, Kelapa, Kacang'
  ),
  (
    'PLG-BSEP',
    'Set Benggali Separuh',
    12.00,
    'Set',
    54,
    'Menu Pelbagai #4 · Separuh Kaya Sahaja + Separuh Kaya Butter · Tolak 1 pcs Roti Benggali'
  ),
  (
    'PLG-BBO',
    'Set Benggali Butter Only',
    9.00,
    'Set',
    55,
    'Menu Pelbagai #5 · Tolak 1 pcs Roti Benggali'
  ),
  (
    'PLG-BHKB',
    'Set Separuh Benggali Kaya Butter',
    7.00,
    'Set',
    56,
    'Menu Pelbagai #6 · Tolak ½ pcs Roti Benggali'
  ),
  (
    'PLG-BHK',
    'Set Separuh Benggali Kaya Sahaja',
    6.00,
    'Set',
    57,
    'Menu Pelbagai #7 · Tolak ½ pcs Roti Benggali'
  ),
  (
    'PLG-KACB-1',
    'Set Kacang Butter · 1 pcs',
    4.50,
    'Pcs',
    58,
    'Menu Pelbagai #8 · Tolak 1 pcs Stok Roti Kacang'
  ),
  (
    'PLG-KACB-3',
    'Set Kacang Butter · 3 pcs',
    11.00,
    'Set',
    59,
    'Menu Pelbagai #8 · Tolak 3 pcs Stok Roti Kacang'
  ),
  (
    'PLG-KELB-1',
    'Set Kelapa Butter · 1 pcs',
    3.50,
    'Pcs',
    60,
    'Menu Pelbagai #9 · Tolak 1 pcs Stok Roti Kelapa'
  ),
  (
    'PLG-KELB-3',
    'Set Kelapa Butter · 3 pcs',
    10.00,
    'Set',
    61,
    'Menu Pelbagai #9 · Tolak 3 pcs Stok Roti Kelapa'
  )
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

-- Nyahaktif SKU Pelbagai lama yang tidak dalam senarai rasmi
UPDATE products p
SET status = 'INACTIVE'::entity_status, updated_at = now()
FROM organizations o
WHERE p.organization_id = o.id
  AND o.code = 'RKJ'
  AND p.category = 'Pelbagai'
  AND p.sku NOT IN (
    'PLG-KBS-3', 'PLG-KBS-1', 'PLG-SCKB', 'PLG-SCK',
    'PLG-BSEP', 'PLG-BBO', 'PLG-BHKB', 'PLG-BHK',
    'PLG-KACB-1', 'PLG-KACB-3', 'PLG-KELB-1', 'PLG-KELB-3'
  );

-- BOM tolakan stok roti kiosk
INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, v.qty, v.unit::stock_unit, v.qty, v.qty, true, v.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN (VALUES
  ('PLG-KBS-3', 'ST-PLANTA', 3, 'PCS', 'Tolak 3 pcs Stok Roti Kaya'),
  ('PLG-KBS-1', 'ST-PLANTA', 1, 'PCS', 'Tolak 1 pcs Stok Roti Kaya'),
  ('PLG-SCKB', 'ST-PLANTA', 1, 'PCS', 'Set Campur Kaya Butter · Roti Kaya'),
  ('PLG-SCKB', 'ST-KELAPA', 1, 'PCS', 'Set Campur Kaya Butter · Roti Kelapa'),
  ('PLG-SCKB', 'ST-KACANG', 1, 'PCS', 'Set Campur Kaya Butter · Roti Kacang'),
  ('PLG-SCK', 'ST-PLANTA', 1, 'PCS', 'Set Campur Kaya · Roti Kaya'),
  ('PLG-SCK', 'ST-KELAPA', 1, 'PCS', 'Set Campur Kaya · Roti Kelapa'),
  ('PLG-SCK', 'ST-KACANG', 1, 'PCS', 'Set Campur Kaya · Roti Kacang'),
  ('PLG-BSEP', 'ST-BENGGALI', 1, 'PCS', 'Set Benggali Separuh · 1 pcs Benggali'),
  ('PLG-BBO', 'ST-BENGGALI', 1, 'PCS', 'Set Benggali Butter Only · 1 pcs Benggali'),
  ('PLG-BHKB', 'ST-BENGGALI', 0.5, 'PCS', 'Set Separuh Benggali Kaya Butter · ½ pcs Benggali'),
  ('PLG-BHK', 'ST-BENGGALI', 0.5, 'PCS', 'Set Separuh Benggali Kaya Sahaja · ½ pcs Benggali'),
  ('PLG-KACB-1', 'ST-KACANG', 1, 'PCS', 'Set Kacang Butter · 1 pcs Kacang'),
  ('PLG-KACB-3', 'ST-KACANG', 3, 'PCS', 'Set Kacang Butter · 3 pcs Kacang'),
  ('PLG-KELB-1', 'ST-KELAPA', 1, 'PCS', 'Set Kelapa Butter · 1 pcs Kelapa'),
  ('PLG-KELB-3', 'ST-KELAPA', 3, 'PCS', 'Set Kelapa Butter · 3 pcs Kelapa')
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
