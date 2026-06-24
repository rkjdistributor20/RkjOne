-- Profil rasmi syarikat (alamat, SSM, bank) untuk resit & Tetapan

ALTER TABLE legal_entities
  ADD COLUMN IF NOT EXISTS office_address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS registration_no TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no TEXT;

COMMENT ON COLUMN legal_entities.office_address IS 'Alamat pejabat berdaftar';
COMMENT ON COLUMN legal_entities.registration_no IS 'No. SSM / pendaftaran syarikat';
COMMENT ON COLUMN legal_entities.tax_id IS 'No. SST (null jika tiada)';

-- RKJ Distributor Sdn Bhd
UPDATE legal_entities le
SET
  legal_name = 'RKJ Distributor Sdn Bhd',
  office_address = 'Level 1, NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak',
  phone = '016-4366302',
  email = 'rkjdistributor20@gmail.com',
  registration_no = '1352838V/201901043508',
  tax_id = NULL,
  bank_name = 'Maybank',
  bank_account_name = 'RKJ Distributor Sdn Bhd',
  bank_account_no = '564856315018',
  updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id
  AND o.code = 'RKJ'
  AND le.code = 'RKJ_DIST';

-- Roti Kaya Junus Manufacturing Sdn Bhd
UPDATE legal_entities le
SET
  legal_name = 'Roti Kaya Junus Manufacturing Sdn Bhd',
  office_address = 'NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak',
  phone = '05-6214187',
  email = 'rkjunus@gmail.com',
  registration_no = '1345255K/201901035925',
  tax_id = NULL,
  bank_name = 'Maybank',
  bank_account_name = 'Roti Kaya Junus Manufacturing Sdn Bhd',
  bank_account_no = '564427518660',
  updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id
  AND o.code = 'RKJ'
  AND le.code = 'RKJ_MFG';

-- Roti Kaya Junus
UPDATE legal_entities le
SET
  legal_name = 'Roti Kaya Junus',
  office_address = 'NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak',
  phone = '05-6214187',
  email = 'rkjdistributor20@gmail.com',
  registration_no = '201603227506 (IP0459147-D)',
  tax_id = NULL,
  bank_name = 'CIMB Bank',
  bank_account_name = 'Roti Kaya Junus',
  bank_account_no = '8606268175',
  updated_at = now()
FROM organizations o
WHERE le.organization_id = o.id
  AND o.code = 'RKJ'
  AND le.code = 'RKJ';
