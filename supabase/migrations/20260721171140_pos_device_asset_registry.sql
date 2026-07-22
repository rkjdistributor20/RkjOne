-- Structured asset registry for official branch POS tablets.

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS imei TEXT,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS warranty_expires_at DATE,
  ADD COLUMN IF NOT EXISTS asset_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asset_verified_by UUID REFERENCES public.profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_devices_org_serial_unique
  ON public.pos_devices (organization_id, upper(serial_number))
  WHERE serial_number IS NOT NULL AND status <> 'REVOKED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_devices_org_imei_unique
  ON public.pos_devices (organization_id, imei)
  WHERE imei IS NOT NULL AND status <> 'REVOKED';

COMMENT ON COLUMN public.pos_devices.serial_number IS
  'Manufacturer serial number recorded by HQ before branch activation.';
COMMENT ON COLUMN public.pos_devices.imei IS
  '15-digit cellular equipment identity recorded by HQ before branch activation.';
COMMENT ON COLUMN public.pos_devices.asset_verified_at IS
  'Time an HQ administrator confirmed the physical label, serial number and IMEI.';
