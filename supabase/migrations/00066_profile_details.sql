-- Profil pekerja terperinci — gaya enterprise HR
-- Migration 00066

ALTER TABLE profiles
 ADD COLUMN IF NOT EXISTS ic_number TEXT,
 ADD COLUMN IF NOT EXISTS date_of_birth DATE,
 ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER')),
 ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Malaysia',
 ADD COLUMN IF NOT EXISTS address_line1 TEXT,
 ADD COLUMN IF NOT EXISTS address_line2 TEXT,
 ADD COLUMN IF NOT EXISTS city TEXT,
 ADD COLUMN IF NOT EXISTS state TEXT,
 ADD COLUMN IF NOT EXISTS postcode TEXT,
 ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
 ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
 ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
 ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_ic ON profiles (organization_id, ic_number)
 WHERE ic_number IS NOT NULL;

COMMENT ON COLUMN profiles.ic_number IS 'No. Kad Pengenalan / Passport';
COMMENT ON COLUMN profiles.profile_completed_at IS 'Set apabila medan wajib profil lengkap';
