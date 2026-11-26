-- Apply after the production app release has the atomic manual-QR sale route.
-- Limit activation to the approved production organization and enrolled fleet.
-- No device or merchant account is registered by this migration.
SET LOCAL lock_timeout = '5s';
INSERT INTO public.pos_fiuu_vt_shift_close_rollout(branch_id)
SELECT b.id FROM public.branches b
JOIN public.pos_devices d ON d.branch_id=b.id AND d.organization_id=b.organization_id
WHERE b.organization_id='4c6a2501-151c-42b3-b63f-41ccfca29420'::uuid
  AND b.status='ACTIVE' AND b.branch_code ~ '^BR(00[1-9]|0[12][0-9]|03[0-6])$' AND b.branch_code<>'BR012'
  AND d.status='ACTIVE' AND d.enrolled_at IS NOT NULL AND d.secret_hash IS NOT NULL
  AND d.asset_verified_at IS NOT NULL AND d.asset_verified_by IS NOT NULL
ON CONFLICT (branch_id) DO NOTHING;
