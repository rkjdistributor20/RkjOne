-- Group Rate Ejen Khas Syarikat: boleh order dan langgan POS tanpa bayaran

ALTER TABLE agent_price_groups
 ADD COLUMN IF NOT EXISTS payment_exempt BOOLEAN NOT NULL DEFAULT false;

WITH org AS (
 SELECT id FROM organizations WHERE code = 'RKJ' LIMIT 1
), dist AS (
 SELECT le.id AS legal_entity_id, org.id AS organization_id
 FROM legal_entities le
 JOIN org ON org.id = le.organization_id
 WHERE le.code = 'RKJ_DIST'
 LIMIT 1
), special AS (
 INSERT INTO agent_price_groups (
 organization_id,
 legal_entity_id,
 code,
 name,
 description,
 is_default,
 payment_exempt,
 status,
 updated_at
 )
 SELECT
 dist.organization_id,
 dist.legal_entity_id,
 'EJEN_KHAS_SYARIKAT',
 'Ejen Khas Syarikat',
 'Group rate khas syarikat: order stok dan langgan POS tanpa bayaran online.',
 false,
 true,
 'ACTIVE',
 now()
 FROM dist
 ON CONFLICT (organization_id, code) DO UPDATE SET
 name = EXCLUDED.name,
 description = EXCLUDED.description,
 payment_exempt = true,
 status = 'ACTIVE',
 updated_at = now()
 RETURNING id, organization_id
), default_group AS (
 SELECT g.id, g.organization_id
 FROM agent_price_groups g
 JOIN org ON org.id = g.organization_id
 WHERE g.code = 'EJEN_BERDAFTAR'
 LIMIT 1
)
INSERT INTO agent_price_group_items (
 organization_id,
 price_group_id,
 stock_item_id,
 item_label,
 package_description,
 unit_price_rm,
 status,
 updated_at
)
SELECT
 s.organization_id,
 s.id,
 i.stock_item_id,
 i.item_label,
 i.package_description,
 i.unit_price_rm,
 'ACTIVE',
 now()
FROM special s
JOIN default_group d ON d.organization_id = s.organization_id
JOIN agent_price_group_items i ON i.price_group_id = d.id
ON CONFLICT (price_group_id, stock_item_id) DO UPDATE SET
 item_label = EXCLUDED.item_label,
 package_description = EXCLUDED.package_description,
 unit_price_rm = EXCLUDED.unit_price_rm,
 status = 'ACTIVE',
 updated_at = now();

COMMENT ON COLUMN agent_price_groups.payment_exempt IS 'Jika true, ejen boleh submit order stok dan aktifkan POS tanpa bayaran online.';
