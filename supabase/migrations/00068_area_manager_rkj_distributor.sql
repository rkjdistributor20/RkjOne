-- Pengurus Kawasan: majikan RKJ Distributor · urus staf & cawangan Roti Kaya Junus
-- Migration 00068

UPDATE legal_entities le
SET
  scope = 'Pengedaran · logistik · fleet · Pengurus Kawasan (urus staf & cawangan Roti Kaya Junus)',
  updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id
  AND o.code = 'RKJ'
  AND le.code = 'RKJ_DIST';

UPDATE profiles p
SET legal_entity_id = le.id
FROM legal_entities le
JOIN organizations o ON o.id = le.organization_id
WHERE p.organization_id = o.id
  AND o.code = 'RKJ'
  AND le.code = 'RKJ_DIST'
  AND p.role = 'AREA_MANAGER';

COMMENT ON COLUMN profiles.legal_entity_id IS
  'Syarikat majikan — AM & driver: RKJ Distributor; staf kiosk: Roti Kaya Junus';
