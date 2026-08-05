-- Align an authenticated profile with its verified HR staff record.
-- Branch and region are intentionally not inferred by this migration.

UPDATE public.profiles AS profile
SET
  legal_entity_id = staff.legal_entity_id,
  updated_at = now()
FROM public.staff AS staff
WHERE staff.profile_id = profile.id
  AND staff.organization_id = profile.organization_id
  AND staff.legal_entity_id IS NOT NULL
  AND profile.legal_entity_id IS NULL;
