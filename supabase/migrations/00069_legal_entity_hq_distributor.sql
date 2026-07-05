-- Kemaskini skop syarikat + HQ Distributor (ganti label Gudang HQ untuk pengedaran)
-- Migration 00069

UPDATE legal_entities le
SET
 scope = 'Staf jualan kiosk · 36 cawangan · jenama Roti Kaya Junus',
 updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id AND o.code = 'RKJ' AND le.code = 'RKJ';

UPDATE legal_entities le
SET
 scope = 'Pengedaran · fleet · Pengurus Kawasan · HQ Distributor',
 updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id AND o.code = 'RKJ' AND le.code = 'RKJ_DIST';

UPDATE legal_entities le
SET
 scope = 'Kilang · pengeluaran roti · gudang kilang',
 updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id AND o.code = 'RKJ' AND le.code = 'RKJ_MFG';
