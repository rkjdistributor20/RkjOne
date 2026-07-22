-- Pre-register one pending official POS tablet slot for every active branch.
-- Activation codes are intentionally generated later, when the physical tablet is ready.

INSERT INTO public.pos_devices (
  organization_id,
  branch_id,
  device_code,
  device_name,
  status
)
SELECT
  branch.organization_id,
  branch.id,
  'POS-' || branch.branch_code || '-' || upper(substr(md5(branch.id::text), 1, 6)),
  left('Tablet POS - ' || branch.branch_name, 80),
  'PENDING'
FROM public.branches AS branch
WHERE branch.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM public.pos_devices AS device
    WHERE device.branch_id = branch.id
      AND device.status IN ('PENDING', 'ACTIVE')
  )
ON CONFLICT (organization_id, device_code) DO NOTHING;
