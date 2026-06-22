-- Tiga syarikat undang-undang di bawah jenama Roti Kaya Junus — pemilik sama, satu sistem
-- Migration 00067

CREATE TABLE legal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  scope TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_legal_entities_org ON legal_entities(organization_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES legal_entities(id);

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES legal_entities(id);

CREATE INDEX idx_profiles_legal_entity ON profiles(organization_id, legal_entity_id);
CREATE INDEX idx_staff_legal_entity ON staff(organization_id, legal_entity_id);

-- Seed tiga syarikat untuk organisasi RKJ
INSERT INTO legal_entities (organization_id, code, name, legal_name, scope, sort_order)
SELECT o.id, v.code, v.name, v.legal_name, v.scope, v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  (
    'RKJ',
    'Roti Kaya Junus',
    'Roti Kaya Junus',
    'Staf jualan kiosk · operasi 36 cawangan · jenama Roti Kaya Junus',
    1
  ),
  (
    'RKJ_DIST',
    'RKJ Distributor',
    'RKJ Distributor Sdn Bhd',
    'Pengedaran · logistik · fleet penghantaran',
    2
  ),
  (
    'RKJ_MFG',
    'RKJ Manufacturing',
    'Roti Kaya Junus Manufacturing Sdn Bhd',
    'Kilang · pengeluaran roti · gudang HQ',
    3
  )
) AS v(code, name, legal_name, scope, sort_order)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  legal_name = EXCLUDED.legal_name,
  scope = EXCLUDED.scope,
  sort_order = EXCLUDED.sort_order;

-- Staf jualan cawangan → Roti Kaya Junus
UPDATE staff s
SET legal_entity_id = le.id
FROM legal_entities le
WHERE s.legal_entity_id IS NULL
  AND le.code = 'RKJ'
  AND le.organization_id = s.organization_id;

-- Profil staf kiosk → Roti Kaya Junus (via rekod staff atau peranan STAFF)
UPDATE profiles p
SET legal_entity_id = le.id
FROM legal_entities le
WHERE p.legal_entity_id IS NULL
  AND le.code = 'RKJ'
  AND le.organization_id = p.organization_id
  AND (
    p.role = 'STAFF'
    OR EXISTS (SELECT 1 FROM staff s WHERE s.profile_id = p.id)
  );

-- Driver → RKJ Distributor
UPDATE profiles p
SET legal_entity_id = le.id
FROM legal_entities le
WHERE p.legal_entity_id IS NULL
  AND le.code = 'RKJ_DIST'
  AND le.organization_id = p.organization_id
  AND p.role = 'DRIVER';

-- Kilang / gudang HQ → Manufacturing
UPDATE profiles p
SET legal_entity_id = le.id
FROM legal_entities le
WHERE p.legal_entity_id IS NULL
  AND le.code = 'RKJ_MFG'
  AND le.organization_id = p.organization_id
  AND p.role IN ('CEO_FACTORY');

-- HQ & pengurusan lain → Roti Kaya Junus (entiti induk operasi)
UPDATE profiles p
SET legal_entity_id = le.id
FROM legal_entities le
WHERE p.legal_entity_id IS NULL
  AND le.code = 'RKJ'
  AND le.organization_id = p.organization_id;

-- Selaraskan profil dengan syarikat staf
UPDATE profiles p
SET legal_entity_id = s.legal_entity_id
FROM staff s
WHERE s.profile_id = p.id
  AND s.legal_entity_id IS NOT NULL
  AND (p.legal_entity_id IS NULL OR p.legal_entity_id != s.legal_entity_id);

ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_entities_read ON legal_entities
  FOR SELECT USING (organization_id = public.organization_id());

COMMENT ON TABLE legal_entities IS 'Entiti undang-undang di bawah jenama RKJ — pemilik sama, satu ERP';
COMMENT ON COLUMN staff.legal_entity_id IS 'Syarikat majikan staf — lalai Roti Kaya Junus untuk staf jualan kiosk';
