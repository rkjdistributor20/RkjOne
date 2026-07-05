-- RKJ One: Replace RKJ Distributor fleet master with latest vehicle-driver PDF
-- Source: SENARAI KENDERAAN DRIVER.pdf

DO $$
DECLARE
 v_org_id UUID;
 v_entity_id UUID;
 v_driver_id UUID;
 v_vehicle_id UUID;
 v_default_driver_id UUID;
 v_now TIMESTAMPTZ := now();
 r RECORD;
 d TEXT;
BEGIN
 SELECT id INTO v_org_id FROM organizations WHERE code = 'RKJ' LIMIT 1;
 SELECT id INTO v_entity_id FROM legal_entities WHERE organization_id = v_org_id AND code = 'RKJ_DIST' LIMIT 1;

 IF v_org_id IS NULL THEN
 RAISE EXCEPTION 'Organization RKJ not found';
 END IF;

 CREATE TEMP TABLE tmp_latest_rkj_distributor_fleet (
 no_seq INT,
 vehicle_code TEXT,
 plate_number TEXT,
 vehicle_type TEXT,
 capacity TEXT,
 model TEXT,
 driver_names TEXT[],
 travel_location TEXT
 ) ON COMMIT DROP;

 INSERT INTO tmp_latest_rkj_distributor_fleet
 (no_seq, vehicle_code, plate_number, vehicle_type, capacity, model, driver_names, travel_location)
 VALUES
 (1, 'VEH-VFM2224', 'VFM 2224', 'Lori Rigid', '5 Tan', 'UD Trucks', ARRAY['Samad'], 'Teluk Intan > Kuala Lumpur'),
 (2, 'VEH-ALL2224', 'ALL 2224', 'Lori Rigid', '3 Tan', 'Mitsubishi Fuso', ARRAY['Samad','Farid'], 'Teluk Intan > Kuala Lumpur / Utara'),
 (3, 'VEH-VFL2224', 'VFL 2224', 'Lori Rigid', '1 Tan', 'Mitsubishi Fuso', ARRAY['Fazil','Hazrul'], 'Kuala Lumpur'),
 (4, 'VEH-WB4631T', 'WB 4631 T', 'Lori Rigid', '1 Tan', 'Isuzu', ARRAY['Ahmad'], 'Sungkai'),
 (5, 'VEH-WA1202J', 'WA 1202 J', 'Panel Van', NULL, 'Toyota Hiace', ARRAY['Hazrul','Fazil'], 'Kuala Lumpur'),
 (6, 'VEH-VCH7221', 'VCH 7221', 'Panel Van', NULL, 'Toyota Hiace', ARRAY['Farid','Anuar','Samad'], 'Teluk Intan > Utara / Kuala Lumpur'),
 (7, 'VEH-SYP2224', 'SYP 2224', 'Panel Van', NULL, 'Nissan NV200', ARRAY['Anuar','Farid'], 'Teluk Intan > Utara');

 -- Remove old active fleet master from RKJ Distributor view without breaking historical delivery orders.
 UPDATE driver_vehicle_assignments
 SET is_active = false,
 unassigned_at = COALESCE(unassigned_at, v_now)
 WHERE organization_id = v_org_id
 AND is_active = true;

 UPDATE vehicles
 SET status = 'INACTIVE',
 default_driver_id = NULL,
 remarks = CONCAT_WS(' | ', NULLIF(remarks, ''), 'Archived by latest SENARAI KENDERAAN DRIVER.pdf import'),
 updated_at = v_now
 WHERE organization_id = v_org_id
 AND status = 'ACTIVE';

 UPDATE drivers
 SET status = 'INACTIVE',
 remarks = CONCAT_WS(' | ', NULLIF(remarks, ''), 'Archived by latest SENARAI KENDERAAN DRIVER.pdf import'),
 updated_at = v_now
 WHERE organization_id = v_org_id
 AND status = 'ACTIVE';

 UPDATE agent_driver_routes
 SET status = 'INACTIVE',
 notes = CONCAT_WS(' | ', NULLIF(notes, ''), 'Archived by latest SENARAI KENDERAAN DRIVER.pdf import'),
 updated_at = v_now
 WHERE organization_id = v_org_id
 AND status = 'ACTIVE';

 -- Seed latest drivers from PDF. Reuse existing profile_id if a matching old driver exists.
 FOREACH d IN ARRAY ARRAY['Samad','Farid','Fazil','Hazrul','Ahmad','Anuar'] LOOP
 INSERT INTO drivers (
 organization_id,
 driver_code,
 full_name,
 route_description,
 phone,
 profile_id,
 status,
 remarks,
 updated_at
 )
 SELECT
 v_org_id,
 CASE d
 WHEN 'Samad' THEN 'DRV001'
 WHEN 'Farid' THEN 'DRV002'
 WHEN 'Fazil' THEN 'DRV003'
 WHEN 'Hazrul' THEN 'DRV004'
 WHEN 'Ahmad' THEN 'DRV005'
 WHEN 'Anuar' THEN 'DRV006'
 END,
 d,
 'RKJ Distributor fleet - rujukan SENARAI KENDERAAN DRIVER.pdf',
 NULL,
 (
 SELECT profile_id
 FROM drivers old_d
 WHERE old_d.organization_id = v_org_id
 AND old_d.profile_id IS NOT NULL
 AND (
 lower(old_d.full_name) = lower(d)
 OR (d = 'Samad' AND old_d.full_name ILIKE '%samad%')
 OR (d = 'Farid' AND old_d.full_name ILIKE '%farid%')
 OR (d = 'Fazil' AND (old_d.full_name ILIKE '%fazil%' OR old_d.full_name ILIKE '%fadzil%'))
 OR (d = 'Hazrul' AND (old_d.full_name ILIKE '%hazrul%' OR old_d.full_name ILIKE '%azrul%'))
 OR (d = 'Ahmad' AND old_d.full_name ILIKE '%ahmad%')
 OR (d = 'Anuar' AND old_d.full_name ILIKE '%anuar%')
 )
 ORDER BY CASE WHEN old_d.status = 'ACTIVE' THEN 0 ELSE 1 END, old_d.updated_at DESC NULLS LAST
 LIMIT 1
 ),
 'ACTIVE',
 'Latest driver from SENARAI KENDERAAN DRIVER.pdf',
 v_now
 ON CONFLICT (organization_id, driver_code) DO UPDATE SET
 full_name = EXCLUDED.full_name,
 route_description = EXCLUDED.route_description,
 phone = EXCLUDED.phone,
 profile_id = COALESCE(EXCLUDED.profile_id, drivers.profile_id),
 status = 'ACTIVE',
 remarks = EXCLUDED.remarks,
 updated_at = v_now;
 END LOOP;

 -- Seed latest vehicles and active driver assignments.
 FOR r IN SELECT * FROM tmp_latest_rkj_distributor_fleet ORDER BY no_seq LOOP
 SELECT id INTO v_default_driver_id
 FROM drivers
 WHERE organization_id = v_org_id
 AND full_name = r.driver_names[1]
 AND status = 'ACTIVE'
 LIMIT 1;

 INSERT INTO vehicles (
 organization_id,
 vehicle_code,
 plate_number,
 vehicle_type,
 capacity,
 default_driver_id,
 status,
 remarks,
 updated_at
 ) VALUES (
 v_org_id,
 r.vehicle_code,
 r.plate_number,
 r.vehicle_type,
 r.capacity,
 v_default_driver_id,
 'ACTIVE',
 CONCAT('Model: ', r.model, ' | Lokasi Perjalanan: ', r.travel_location, ' | Source: SENARAI KENDERAAN DRIVER.pdf'),
 v_now
 )
 ON CONFLICT (organization_id, vehicle_code) DO UPDATE SET
 plate_number = EXCLUDED.plate_number,
 vehicle_type = EXCLUDED.vehicle_type,
 capacity = EXCLUDED.capacity,
 default_driver_id = EXCLUDED.default_driver_id,
 status = 'ACTIVE',
 remarks = EXCLUDED.remarks,
 updated_at = v_now
 RETURNING id INTO v_vehicle_id;

 FOREACH d IN ARRAY r.driver_names LOOP
 SELECT id INTO v_driver_id
 FROM drivers
 WHERE organization_id = v_org_id
 AND full_name = d
 AND status = 'ACTIVE'
 LIMIT 1;

 IF v_driver_id IS NOT NULL THEN
 INSERT INTO driver_vehicle_assignments (
 organization_id,
 driver_id,
 vehicle_id,
 assigned_at,
 unassigned_at,
 is_active
 ) VALUES (
 v_org_id,
 v_driver_id,
 v_vehicle_id,
 v_now,
 NULL,
 true
 );
 END IF;
 END LOOP;

 INSERT INTO fleet_status_log (
 organization_id,
 vehicle_id,
 driver_id,
 status,
 location_description,
 logged_at,
 notes
 ) VALUES (
 v_org_id,
 v_vehicle_id,
 v_default_driver_id,
 'READY',
 r.travel_location,
 v_now,
 CONCAT('Latest active vehicle from SENARAI KENDERAAN DRIVER.pdf - ', r.model)
 );

 INSERT INTO agent_driver_routes (
 organization_id,
 legal_entity_id,
 route_code,
 driver_name,
 assistant_name,
 collect_from,
 sequence_no,
 location_name,
 location_type,
 notes,
 status,
 updated_at
 ) VALUES (
 v_org_id,
 v_entity_id,
 CONCAT('VEH-', replace(r.plate_number, ' ', '')),
 array_to_string(r.driver_names, ' / '),
 NULL,
 'RKJ Distributor Fleet',
 r.no_seq,
 r.travel_location,
 'DELIVERY_ROUTE',
 CONCAT('Kenderaan ', r.plate_number, ' - ', r.vehicle_type, COALESCE(' (' || r.capacity || ')', ''), ' - ', r.model),
 'ACTIVE',
 v_now
 )
 ON CONFLICT (organization_id, route_code, sequence_no, location_name) DO UPDATE SET
 legal_entity_id = EXCLUDED.legal_entity_id,
 driver_name = EXCLUDED.driver_name,
 assistant_name = EXCLUDED.assistant_name,
 collect_from = EXCLUDED.collect_from,
 location_type = EXCLUDED.location_type,
 notes = EXCLUDED.notes,
 status = 'ACTIVE',
 updated_at = v_now;
 END LOOP;

 -- Normalize assigned driver labels on agent accounts to latest spelling from PDF.
 UPDATE sales_agent_accounts
 SET assigned_driver_name = trim(both E'\n' from regexp_replace(
 replace(replace(replace(replace(replace(coalesce(assigned_driver_name, ''), 'Abdul Samad', 'Samad'), 'Ahmad Niza', 'Ahmad'), 'Fadzil', 'Fazil'), 'Azrul', 'Hazrul'), 'Driver Kilang', 'Samad'),
 E'\n{3,}', E'\n\n', 'g'
 )),
 updated_at = v_now
 WHERE organization_id = v_org_id
 AND assigned_driver_name IS NOT NULL;
END $$;
