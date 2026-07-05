-- RKJ One: keep ordinary kiosk/company staff away from finance dashboards.
-- Finance records are handled by Finance/Admin/management roles only.

UPDATE role_permissions
SET permission = 'NONE'
WHERE role = 'STAFF'
  AND module = 'finance';

INSERT INTO role_permissions (role, module, permission)
SELECT 'STAFF', 'finance', 'NONE'
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions
  WHERE role = 'STAFF'
    AND module = 'finance'
);
