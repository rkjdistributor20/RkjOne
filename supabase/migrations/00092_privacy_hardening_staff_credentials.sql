-- Privacy hardening: real temporary passwords must not be retained after issue.
-- New passwords are shown once by the application and stored as a redacted marker.
UPDATE staff_portal_credentials
SET portal_password = '[HIDDEN_AFTER_ISSUE]',
 updated_at = NOW()
WHERE portal_password IS NOT NULL
 AND portal_password <> '[HIDDEN_AFTER_ISSUE]';
