-- HR Syarikat permission module
-- Migration 00072

INSERT INTO role_permissions (organization_id, role, module, permission)
SELECT o.id, v.role::user_role, 'hr', v.permission::permission_level
FROM organizations o
CROSS JOIN (VALUES
  ('SUPER_ADMIN', 'FULL'),
  ('ADMIN', 'FULL'),
  ('HR', 'FULL')
) AS v(role, permission)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, role, module) DO UPDATE SET
  permission = EXCLUDED.permission,
  updated_at = now();
