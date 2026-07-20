-- RKJ One: Sync Cartrack FleetWeb vehicle plates into RKJ Distributor vehicle master.
-- Source checked from https://fleetweb-my.cartrack.com/list/vehicles on 2026-07-20.
-- This does not change schema and does not store Cartrack credentials.

DO $$
DECLARE
 v_org_id UUID;
 v_vehicle_id UUID;
 v_now TIMESTAMPTZ := now();
 r RECORD;
BEGIN
 SELECT id INTO v_org_id FROM organizations WHERE code = 'RKJ' LIMIT 1;

 IF v_org_id IS NULL THEN
 RAISE EXCEPTION 'Organization RKJ not found';
 END IF;

 CREATE TEMP TABLE tmp_cartrack_vehicle_plates (
 plate_number TEXT PRIMARY KEY,
 vehicle_type TEXT,
 capacity TEXT,
 model TEXT,
 travel_location TEXT
 ) ON COMMIT DROP;

 INSERT INTO tmp_cartrack_vehicle_plates
 (plate_number, vehicle_type, capacity, model, travel_location)
 VALUES
 ('ALL 2224', 'Lori Rigid', '3 Tan', 'Mitsubishi Fuso', 'Teluk Intan > Kuala Lumpur / Utara'),
 ('AMC 2224', 'Kenderaan Cartrack', NULL, 'Cartrack FleetWeb', 'Belum ditetapkan'),
 ('AMC 3919', 'Kenderaan Cartrack', NULL, 'Cartrack FleetWeb', 'Belum ditetapkan'),
 ('JUX 2224', 'Kenderaan Cartrack', NULL, 'Cartrack FleetWeb', 'Belum ditetapkan'),
 ('SYP 2224', 'Panel Van', NULL, 'Nissan NV200', 'Teluk Intan > Utara'),
 ('VCH 7221', 'Panel Van', NULL, 'Toyota Hiace', 'Teluk Intan > Utara / Kuala Lumpur'),
 ('VFL 2224', 'Lori Rigid', '1 Tan', 'Mitsubishi Fuso', 'Kuala Lumpur'),
 ('VFM 2224', 'Lori Rigid', '5 Tan', 'UD Trucks', 'Teluk Intan > Kuala Lumpur'),
 ('VS 4284', 'Kenderaan Cartrack', NULL, 'Cartrack FleetWeb', 'Belum ditetapkan'),
 ('WA 1202 J', 'Panel Van', NULL, 'Toyota Hiace', 'Kuala Lumpur'),
 ('WB 4631 T', 'Lori Rigid', '1 Tan', 'Isuzu', 'Sungkai')
 ON CONFLICT (plate_number) DO UPDATE SET
 vehicle_type = EXCLUDED.vehicle_type,
 capacity = EXCLUDED.capacity,
 model = EXCLUDED.model,
 travel_location = EXCLUDED.travel_location;

 FOR r IN SELECT * FROM tmp_cartrack_vehicle_plates LOOP
 v_vehicle_id := NULL;

 SELECT id INTO v_vehicle_id
 FROM vehicles
 WHERE organization_id = v_org_id
 AND regexp_replace(upper(COALESCE(plate_number, '')), '[^A-Z0-9]', '', 'g') =
 regexp_replace(upper(r.plate_number), '[^A-Z0-9]', '', 'g')
 LIMIT 1;

 IF v_vehicle_id IS NOT NULL THEN
 UPDATE vehicles SET
 plate_number = r.plate_number,
 vehicle_type = CASE
 WHEN vehicle_type = 'Kenderaan Cartrack' THEN r.vehicle_type
 ELSE COALESCE(NULLIF(vehicle_type, ''), r.vehicle_type)
 END,
 capacity = COALESCE(capacity, r.capacity),
 status = 'ACTIVE',
 remarks = CASE
 WHEN remarks ILIKE '%Source: SENARAI KENDERAAN DRIVER.pdf%' THEN
 CONCAT_WS(' | ', remarks, 'Cartrack GPS plate verified 2026-07-20')
 ELSE CONCAT('Model: ', r.model, ' | Lokasi Perjalanan: ', r.travel_location, ' | Source: Cartrack FleetWeb')
 END,
 updated_at = v_now
 WHERE id = v_vehicle_id;
 ELSE
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
 CONCAT('VEH-', replace(r.plate_number, ' ', '')),
 r.plate_number,
 r.vehicle_type,
 r.capacity,
 NULL,
 'ACTIVE',
 CONCAT('Model: ', r.model, ' | Lokasi Perjalanan: ', r.travel_location, ' | Source: Cartrack FleetWeb'),
 v_now
 )
 ON CONFLICT (organization_id, vehicle_code) DO UPDATE SET
 plate_number = EXCLUDED.plate_number,
 vehicle_type = CASE
 WHEN vehicles.vehicle_type = 'Kenderaan Cartrack' THEN EXCLUDED.vehicle_type
 ELSE COALESCE(NULLIF(vehicles.vehicle_type, ''), EXCLUDED.vehicle_type)
 END,
 capacity = COALESCE(vehicles.capacity, EXCLUDED.capacity),
 status = 'ACTIVE',
 remarks = CASE
 WHEN vehicles.remarks ILIKE '%Source: SENARAI KENDERAAN DRIVER.pdf%' THEN
 CONCAT_WS(' | ', vehicles.remarks, 'Cartrack GPS plate verified 2026-07-20')
 ELSE EXCLUDED.remarks
 END,
 updated_at = v_now
 RETURNING id INTO v_vehicle_id;
 END IF;

 INSERT INTO inventory_locations (
 organization_id,
 location_type,
 name,
 vehicle_id,
 is_active
 ) VALUES (
 v_org_id,
 'FLEET_VEHICLE',
 r.plate_number,
 v_vehicle_id,
 true
 )
 ON CONFLICT (vehicle_id) WHERE vehicle_id IS NOT NULL DO UPDATE SET
 name = EXCLUDED.name,
 is_active = true,
 updated_at = v_now;
 END LOOP;
END $$;
