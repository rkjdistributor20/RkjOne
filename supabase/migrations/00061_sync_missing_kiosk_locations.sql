-- Pastikan semua cawangan ada lokasi kiosk aktif (fix BR012 Utara dll.)

INSERT INTO inventory_locations (organization_id, location_type, name, branch_id, is_active)
SELECT b.organization_id, 'BRANCH_KIOSK'::location_type, b.branch_name, b.id, true
FROM branches b
WHERE NOT EXISTS (
 SELECT 1 FROM inventory_locations il
 WHERE il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
);

UPDATE inventory_locations il
SET is_active = true, name = b.branch_name, updated_at = now()
FROM branches b
WHERE il.branch_id = b.id
 AND il.location_type = 'BRANCH_KIOSK'
 AND (il.is_active = false OR il.name IS DISTINCT FROM b.branch_name);

INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
SELECT il.organization_id, il.id, si.id, 0, si.base_unit
FROM inventory_locations il
JOIN stock_items si ON si.organization_id = il.organization_id
WHERE il.location_type = 'BRANCH_KIOSK'
 AND si.status = 'ACTIVE'
 AND si.item_code IN (
 'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
 'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
 )
ON CONFLICT (location_id, stock_item_id) DO NOTHING;
