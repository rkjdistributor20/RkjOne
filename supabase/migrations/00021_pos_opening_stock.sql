-- Opening inventory for HQ warehouse and branch kiosks (POS stock deduction)
-- Migration 00021 — idempotent: skips rows that already exist

-- HQ Warehouse — bulk stock
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
ON CONFLICT (location_id, stock_item_id) DO NOTHING;

-- Branch kiosks — retail-ready stock per cawangan
INSERT INTO inventory_balances (organization_id, location_id, stock_item_id, quantity, unit)
SELECT il.organization_id, il.id, si.id,
  CASE si.item_code
    WHEN 'ST-PLANTA' THEN 60
    WHEN 'ST-KELAPA' THEN 56
    WHEN 'ST-KACANG' THEN 48
    WHEN 'ST-BENGGALI' THEN 10
    WHEN 'ST-KAYA' THEN 2000
    WHEN 'ST-BUTTER' THEN 1500
    WHEN 'ST-PLASTIC-S' THEN 50
    WHEN 'ST-PLASTIC-M' THEN 50
    WHEN 'ST-PLASTIC-B' THEN 20
    ELSE 0
  END,
  si.base_unit
FROM inventory_locations il
JOIN organizations o ON o.id = il.organization_id AND o.code = 'RKJ'
JOIN stock_items si ON si.organization_id = o.id
WHERE il.location_type = 'BRANCH_KIOSK'
  AND il.branch_id IS NOT NULL
  AND si.item_code IN (
    'ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI',
    'ST-KAYA', 'ST-BUTTER', 'ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'
  )
ON CONFLICT (location_id, stock_item_id) DO NOTHING;

GRANT SELECT ON dashboard_stats TO authenticated;
