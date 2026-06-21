-- Selaraskan baki 9 item stok rasmi di Kilang, Gudang HQ, Armada & semua kiosk

INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
SELECT il.organization_id, il.id, si.id, 0, si.base_unit
FROM inventory_locations il
JOIN stock_items si ON si.organization_id = il.organization_id
WHERE si.status = 'ACTIVE'
  AND si.item_code IN (
    'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
    'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
  )
  AND il.location_type IN ('FACTORY', 'HQ_WAREHOUSE', 'FLEET_VEHICLE', 'BRANCH_KIOSK')
ON CONFLICT (location_id, stock_item_id) DO NOTHING;

-- Pastikan setiap cawangan ada lokasi kiosk (walaupun tidak aktif)
INSERT INTO inventory_locations (organization_id, location_type, name, branch_id, is_active)
SELECT b.organization_id, 'BRANCH_KIOSK'::location_type, b.branch_name, b.id, true
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_locations il
  WHERE il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
);

-- Baki sifar untuk kiosk baru
INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
SELECT il.organization_id, il.id, si.id, 0, si.base_unit
FROM inventory_locations il
JOIN branches b ON b.id = il.branch_id
JOIN stock_items si ON si.organization_id = il.organization_id
WHERE il.location_type = 'BRANCH_KIOSK'
  AND si.status = 'ACTIVE'
  AND si.item_code IN (
    'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
    'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
  )
ON CONFLICT (location_id, stock_item_id) DO NOTHING;
