-- Menu Pelbagai POS: 9 jenis set/varian + BOM tolakan stok roti kiosk

INSERT INTO products (organization_id, sku, name, category, price, sale_unit, status, sort_order)
SELECT o.id, v.sku, v.name, 'Pelbagai', v.price, v.unit, 'ACTIVE'::entity_status, v.ord
FROM organizations o
CROSS JOIN (VALUES
  ('PLG-KBS-3', 'Roti Kaya (Butter Sahaja) - 3 pcs', 10.00, 'Set', 50),
  ('PLG-KBS-1', 'Roti Kaya (Butter Sahaja) - 1 pc', 3.30, 'Pcs', 51),
  ('PLG-SCKB', 'Set Campur Kaya Butter', 10.00, 'Set', 52),
  ('PLG-SCK', 'Set Campur Kaya', 7.50, 'Set', 53),
  ('PLG-BSEP', 'Set Benggali Separuh', 12.00, 'Set', 54),
  ('PLG-BBO', 'Set Benggali Butter Only', 9.00, 'Set', 55),
  ('PLG-BHKB', 'Set Separuh Benggali Kaya Butter', 7.00, 'Set', 56),
  ('PLG-BHK', 'Set Separuh Benggali Kaya Sahaja', 6.00, 'Set', 57),
  ('PLG-KACB-1', 'Set Kacang Butter - 1 pc', 4.50, 'Pcs', 58),
  ('PLG-KACB-3', 'Set Kacang Butter - 3 pcs', 11.00, 'Set', 59),
  ('PLG-KELB-1', 'Set Kelapa Butter - 1 pc', 3.50, 'Pcs', 60),
  ('PLG-KELB-3', 'Set Kelapa Butter - 3 pcs', 10.00, 'Set', 61)
) AS v(sku, name, price, unit, ord)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, sku) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  sale_unit = EXCLUDED.sale_unit,
  sort_order = EXCLUDED.sort_order,
  status = 'ACTIVE'::entity_status,
  updated_at = now();

-- BOM: tolakan stok roti sahaja (ikut spesifikasi Pelbagai)
INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, v.qty, v.unit::stock_unit, v.qty, v.qty, true, v.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN (VALUES
  ('PLG-KBS-3', 'ST-PLANTA', 3, 'PCS', 'Pelbagai: stok Roti Kaya'),
  ('PLG-KBS-1', 'ST-PLANTA', 1, 'PCS', 'Pelbagai: stok Roti Kaya'),
  ('PLG-SCKB', 'ST-PLANTA', 1, 'PCS', 'Pelbagai: Set Campur Kaya Butter'),
  ('PLG-SCKB', 'ST-KELAPA', 1, 'PCS', 'Pelbagai: Set Campur Kaya Butter'),
  ('PLG-SCKB', 'ST-KACANG', 1, 'PCS', 'Pelbagai: Set Campur Kaya Butter'),
  ('PLG-SCK', 'ST-PLANTA', 1, 'PCS', 'Pelbagai: Set Campur Kaya'),
  ('PLG-SCK', 'ST-KELAPA', 1, 'PCS', 'Pelbagai: Set Campur Kaya'),
  ('PLG-SCK', 'ST-KACANG', 1, 'PCS', 'Pelbagai: Set Campur Kaya'),
  ('PLG-BSEP', 'ST-BENGGALI', 1, 'PCS', 'Pelbagai: Set Benggali Separuh'),
  ('PLG-BBO', 'ST-BENGGALI', 1, 'PCS', 'Pelbagai: Set Benggali Butter Only'),
  ('PLG-BHKB', 'ST-BENGGALI', 0.5, 'PCS', 'Pelbagai: 1/2 Roti Benggali'),
  ('PLG-BHK', 'ST-BENGGALI', 0.5, 'PCS', 'Pelbagai: 1/2 Roti Benggali'),
  ('PLG-KACB-1', 'ST-KACANG', 1, 'PCS', 'Pelbagai: Set Kacang Butter'),
  ('PLG-KACB-3', 'ST-KACANG', 3, 'PCS', 'Pelbagai: Set Kacang Butter'),
  ('PLG-KELB-1', 'ST-KELAPA', 1, 'PCS', 'Pelbagai: Set Kelapa Butter'),
  ('PLG-KELB-3', 'ST-KELAPA', 3, 'PCS', 'Pelbagai: Set Kelapa Butter')
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
