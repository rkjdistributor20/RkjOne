-- Staf yang tiada dalam seed asal (rujuk staff_master.csv)
-- Migration 00022

INSERT INTO staff (organization_id, staff_code, full_name, branch_id, region_id, bank_name, account_number, account_holder, weekly_amount, status, on_hold)
SELECT o.id, 'S020', 'NADIA PART TIME', b.id, b.region_id, 'MBB', '158097908634', 'NORAZMIRA', 295, 'ACTIVE'::entity_status, false
FROM organizations o
JOIN branches b ON b.organization_id = o.id AND b.branch_code = 'BR005'
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, staff_code) DO UPDATE SET
 full_name = EXCLUDED.full_name,
 branch_id = EXCLUDED.branch_id,
 region_id = EXCLUDED.region_id;

INSERT INTO staff (organization_id, staff_code, full_name, branch_id, region_id, bank_name, account_number, account_holder, weekly_amount, status, on_hold)
SELECT o.id, 'S045', 'ANDINI AULIA', b.id, b.region_id, 'TNG', '110305604171', 'FATHUR RAHMAN', 400, 'ACTIVE'::entity_status, false
FROM organizations o
JOIN branches b ON b.organization_id = o.id AND b.branch_code = 'BR019'
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, staff_code) DO UPDATE SET
 full_name = EXCLUDED.full_name,
 branch_id = EXCLUDED.branch_id,
 region_id = EXCLUDED.region_id;
