-- Pemilik kumpulan: satu profil portal, berbilang rekod staff (satu per syarikat legal)
-- Migration 00073

COMMENT ON COLUMN profiles.metadata IS
 'JSON metadata profil. group_owner=true untuk pemilik merentas RKJ, RKJ_DIST, RKJ_MFG; legal_entities senarai kod syarikat.';

-- Mat Isa Bin Mohd Junus — login rasmi matisa@rkj.com
DO $$
DECLARE
 v_org UUID;
 v_owner UUID;
 v_rkj UUID;
 v_dist UUID;
 v_mfg UUID;
BEGIN
 SELECT id INTO v_org FROM organizations WHERE code = 'RKJ' LIMIT 1;
 IF v_org IS NULL THEN RETURN; END IF;

 SELECT id INTO v_owner
 FROM profiles
 WHERE organization_id = v_org AND lower(email) = 'matisa@rkj.com'
 LIMIT 1;

 IF v_owner IS NULL THEN RETURN; END IF;

 SELECT id INTO v_rkj FROM legal_entities WHERE organization_id = v_org AND code = 'RKJ';
 SELECT id INTO v_dist FROM legal_entities WHERE organization_id = v_org AND code = 'RKJ_DIST';
 SELECT id INTO v_mfg FROM legal_entities WHERE organization_id = v_org AND code = 'RKJ_MFG';

 UPDATE profiles
 SET
 full_name = 'Mat Isa Bin Mohd Junus',
 legal_entity_id = NULL,
 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
 'group_owner', true,
 'position', 'Managing Director / Pemilik Kumpulan',
 'legal_entities', jsonb_build_array('RKJ', 'RKJ_DIST', 'RKJ_MFG')
 ),
 updated_at = now()
 WHERE id = v_owner;

 INSERT INTO staff (
 organization_id, staff_code, full_name, profile_id, legal_entity_id,
 worker_type, monthly_amount, status
 )
 SELECT v_org, 'U001', 'Mat Isa Bin Mohd Junus', v_owner, v_rkj, 'LOCAL', 8000, 'ACTIVE'
 WHERE NOT EXISTS (
 SELECT 1 FROM staff s WHERE s.organization_id = v_org AND s.staff_code = 'U001'
 );

 UPDATE staff s
 SET profile_id = v_owner, full_name = 'Mat Isa Bin Mohd Junus', updated_at = now()
 WHERE s.organization_id = v_org
 AND s.staff_code IN ('U001', 'DIST004', 'MFG008');

 UPDATE profiles p
 SET
 status = 'INACTIVE',
 metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
 'merged_into', v_owner::text,
 'merge_note', 'Digabung ke profil pemilik kumpulan matisa@rkj.com'
 ),
 updated_at = now()
 WHERE p.organization_id = v_org
 AND p.id <> v_owner
 AND p.employee_code IN ('DIST004', 'MFG008');
END $$;
