-- RKJ One: Seed data from Production Pack
-- Migration 00011
-- Review before production import. Emails/passwords must be set via Supabase Auth.

-- ============================================================
-- ORGANIZATION
-- ============================================================

INSERT INTO organizations (code, name, hq_address, hq_city, settings)
VALUES (
 'RKJ',
 'Roti Kaya Junus',
 'HQ Teluk Intan',
 'Teluk Intan',
 '{"currency": "MYR", "timezone": "Asia/Kuala_Lumpur", "qr_collection": true}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================
-- REGIONS
-- ============================================================

INSERT INTO regions (organization_id, code, name, manager_name)
SELECT o.id, v.code::region_code, v.name, v.manager
FROM organizations o
CROSS JOIN (VALUES
 ('UTARA', 'Utara', 'Safuan'),
 ('TENGAH', 'Tengah', 'Hakim'),
 ('SELATAN', 'Selatan', 'Yati')
) AS v(code, name, manager)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, code) DO UPDATE SET manager_name = EXCLUDED.manager_name;

-- ============================================================
-- BRANCHES (36 kiosks)
-- ============================================================

INSERT INTO branches (organization_id, region_id, branch_code, branch_name, area, manager_name, status)
SELECT o.id, r.id, v.branch_code, v.branch_name, r.name, v.manager, 'ACTIVE'::entity_status
FROM organizations o
JOIN regions r ON r.organization_id = o.id
JOIN (VALUES
 ('BR001','RNR Juru Arah Selatan','UTARA','Safuan'),
 ('BR002','RNR Gunung Semanggul Arah Selatan','UTARA','Safuan'),
 ('BR003','RNR Gunung Semanggul Arah Utara','UTARA','Safuan'),
 ('BR004','Hentian Sebelah Bukit Gantang Arah Utara','UTARA','Safuan'),
 ('BR005','RNR Sg Perak Arah Selatan','UTARA','Safuan'),
 ('BR006','RNR Sg Perak Arah Utara','UTARA','Safuan'),
 ('BR007','RNR Simpang Pulai Arah Selatan','UTARA','Safuan'),
 ('BR008','RNR Simpang Pulai Arah Utara','UTARA','Safuan'),
 ('BR009','Plaza Tol Simpang Pulai','UTARA','Safuan'),
 ('BR010','Plaza Tol WCE Taiping','UTARA','Safuan'),
 ('BR011','RNR Sg Nyiur Arah Utara','UTARA','Safuan'),
 ('BR012','Hentian Sebelah Bukit Gantang Arah Selatan','UTARA','Safuan'),
 ('BR013','RNR Tapah Selatan 1','TENGAH','Hakim'),
 ('BR014','RNR Tapah Selatan 2','TENGAH','Hakim'),
 ('BR015','RNR Tapah Utara','TENGAH','Hakim'),
 ('BR016','Plaza Tol Tapah','TENGAH','Hakim'),
 ('BR017','Hentian Sebelah Ladang Bikam Arah Utara','TENGAH','Hakim'),
 ('BR018','Hentian Sebelah Ladang Bikam Arah Selatan','TENGAH','Hakim'),
 ('BR019','Hentian Sebelah Behrang Arah Utara','TENGAH','Hakim'),
 ('BR020','Hentian Sebelah Behrang Arah Selatan','TENGAH','Hakim'),
 ('BR021','RNR Ulu Bernam Arah Selatan','TENGAH','Hakim'),
 ('BR022','Hentian Sebelah Tg Malim Arah Selatan','TENGAH','Hakim'),
 ('BR023','Hentian Sebelah Rawang Arah Selatan','SELATAN','Yati'),
 ('BR024','RNR Rawang Arah Utara','SELATAN','Yati'),
 ('BR025','Hentian Sebelah Sg Buluh Arah Selatan','SELATAN','Yati'),
 ('BR026','OBR Sg Buluh Arah Utara','SELATAN','Yati'),
 ('BR027','OBR Sg Buluh Arah Selatan','SELATAN','Yati'),
 ('BR028','Plaza Tol Sg Besi Arah Utara','SELATAN','Yati'),
 ('BR029','RNR Dengkil Arah Selatan','SELATAN','Yati'),
 ('BR030','RNR Dengkil Arah Utara','SELATAN','Yati'),
 ('BR031','RNR Seremban Arah Utara','SELATAN','Yati'),
 ('BR032','Hentian Sebelah Pedas Linggi Arah Selatan','SELATAN','Yati'),
 ('BR033','Hentian Sebelah Ayer Keroh Arah Selatan','SELATAN','Yati'),
 ('BR034','RNR Elmina Arah Barat','SELATAN','Yati'),
 ('BR035','RNR Gombak Arah Barat','SELATAN','Yati'),
 ('BR036','RNR Genting Sempah','SELATAN','Yati')
) AS v(branch_code, branch_name, region_code, manager)
 ON r.code = v.region_code::region_code
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, branch_code) DO UPDATE SET
 branch_name = EXCLUDED.branch_name,
 manager_name = EXCLUDED.manager_name;

-- ============================================================
-- INVENTORY LOCATIONS (Factory, HQ, per branch, per vehicle)
-- ============================================================

INSERT INTO inventory_locations (organization_id, location_type, name)
SELECT o.id, 'FACTORY'::location_type, 'Factory Production'
FROM organizations o WHERE o.code = 'RKJ'
ON CONFLICT DO NOTHING;

INSERT INTO inventory_locations (organization_id, location_type, name)
SELECT o.id, 'HQ_WAREHOUSE'::location_type, 'HQ Warehouse Teluk Intan'
FROM organizations o WHERE o.code = 'RKJ'
ON CONFLICT DO NOTHING;

INSERT INTO inventory_locations (organization_id, location_type, name, branch_id)
SELECT o.id, 'BRANCH_KIOSK'::location_type, b.branch_name, b.id
FROM organizations o
JOIN branches b ON b.organization_id = o.id
WHERE o.code = 'RKJ'
ON CONFLICT DO NOTHING;

-- ============================================================
-- PRODUCTS
-- ============================================================

INSERT INTO products (organization_id, sku, name, category, price, sale_unit, status, sort_order)
SELECT o.id, v.sku, v.name, v.category, v.price, v.unit, 'ACTIVE'::entity_status, v.ord
FROM organizations o
CROSS JOIN (VALUES
 ('RK-KB-3','Roti Kaya - 3 pcs Kaya Butter','Roti Kaya',10.0,'Set',1),
 ('RK-KB-1','Roti Kaya - 1 pc Kaya Butter','Roti Kaya',3.5,'Pcs',2),
 ('RK-KO-3','Roti Kaya - 3 pcs Kaya Only','Roti Kaya',7.0,'Set',3),
 ('RK-KO-1','Roti Kaya - 1 pc Kaya Only','Roti Kaya',2.5,'Pcs',4),
 ('RKEL-K-3','Roti Kelapa - 3 pcs + Kaya','Roti Kelapa',10.0,'Set',5),
 ('RKEL-K-1','Roti Kelapa - 1 pc + Kaya','Roti Kelapa',3.5,'Pcs',6),
 ('RKEL-3','Roti Kelapa - 3 pcs','Roti Kelapa',7.0,'Set',7),
 ('RKEL-1','Roti Kelapa - 1 pc','Roti Kelapa',2.5,'Pcs',8),
 ('RKAC-K-3','Roti Kacang - 3 pcs + Kaya','Roti Kacang',11.0,'Set',9),
 ('RKAC-K-1','Roti Kacang - 1 pc + Kaya','Roti Kacang',4.0,'Pcs',10),
 ('RKAC-3','Roti Kacang - 3 pcs','Roti Kacang',8.0,'Set',11),
 ('RKAC-1','Roti Kacang - 1 pc','Roti Kacang',3.0,'Pcs',12),
 ('BENG-KB','Roti Benggali - Kaya Butter','Roti Benggali',12.5,'Pcs',13),
 ('BENG-KO','Roti Benggali - Kaya Only','Roti Benggali',9.0,'Pcs',14),
 ('BENG-PL','Roti Benggali - Plain','Roti Benggali',7.0,'Pcs',15),
 ('KAYA-CUP','Roti Benggali - Kaya In Cup','Roti Benggali',5.0,'Cup',16)
) AS v(sku, name, category, price, unit, ord)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, sku) DO UPDATE SET price = EXCLUDED.price, name = EXCLUDED.name;

-- ============================================================
-- STOCK ITEMS
-- ============================================================

INSERT INTO stock_items (organization_id, item_code, name, category, base_unit, storage_unit, conversion_text, pack_quantity, pack_unit, status, notes)
SELECT o.id, v.code, v.name, v.category, v.base_unit::stock_unit, v.storage, v.conv, v.pack_qty, v.pack_unit::stock_unit, 'ACTIVE'::entity_status, v.notes
FROM organizations o
CROSS JOIN (VALUES
 ('ST-PLANTA','Roti Kaya','Roti','PCS','Bag/Pcs','1 Bag = 20 pcs',20,'BAG','Stok roti asas menu Roti Kaya (nama kilang: Planta)'),
 ('ST-KELAPA','Roti Kelapa','Roti','PCS','Bag/Pcs','1 Bag = 28 pcs',28,'BAG','Stok roti asas menu Roti Kelapa'),
 ('ST-KACANG','Roti Kacang','Roti','PCS','Bag/Pcs','1 Bag = 24 pcs',24,'BAG','Stok roti asas menu Roti Kacang'),
 ('ST-BENGGALI','Roti Benggali','Roti','PCS','Bag/Pcs','1 Bag = 2 pcs',2,'BAG','Stok roti asas menu Roti Benggali'),
 ('ST-KAYA','Kaya','Bahan','GRAM','Tong/Kg/Gram','1 Tong = 5kg = 5000g',5000,'TONG',NULL),
 ('ST-BUTTER','Butter','Bahan','GRAM','Tong/Kg/Gram','1 Tong = 4.8kg = 4800g',4800,'TONG',NULL),
 ('ST-PLASTIC-S','Plastic Small','Packaging','PCS','Pack/Pcs','1 Pack = 100 pcs',100,'PACK',NULL),
 ('ST-PLASTIC-M','Plastic Medium','Packaging','PCS','Pack/Pcs','1 Pack = 100 pcs',100,'PACK',NULL),
 ('ST-PLASTIC-B','Plastic Big','Packaging','PCS','Pack/Pcs','1 Pack = 100 pcs',100,'PACK',NULL)
) AS v(code, name, category, base_unit, storage, conv, pack_qty, pack_unit, notes)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, item_code) DO UPDATE SET
 name = EXCLUDED.name,
 category = EXCLUDED.category,
 notes = EXCLUDED.notes,
 conversion_text = EXCLUDED.conversion_text;

-- ============================================================
-- PRODUCT BOM
-- ============================================================

INSERT INTO product_bom (organization_id, product_id, stock_item_id, quantity, unit, min_qty, max_qty, auto_deduct, notes)
SELECT o.id, p.id, si.id, v.qty, v.unit::stock_unit, v.min_q, v.max_q, true, v.notes
FROM organizations o
JOIN products p ON p.organization_id = o.id
JOIN stock_items si ON si.organization_id = o.id
JOIN (VALUES
 ('RK-KB-3','ST-PLANTA',3,'PCS',3,3,'Stok roti menu Roti Kaya'),
 ('RK-KB-3','ST-KAYA',12,'GRAM',10,12,'HQ boleh ubah ke 10/11/12g'),
 ('RK-KB-3','ST-BUTTER',12,'GRAM',10,12,'HQ boleh ubah'),
 ('RK-KB-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RK-KB-1','ST-PLANTA',1,'PCS',1,1,'Stok roti menu Roti Kaya'),
 ('RK-KB-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RK-KB-1','ST-BUTTER',4,'GRAM',4,4,NULL),
 ('RK-KB-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RK-KO-3','ST-PLANTA',3,'PCS',3,3,'Stok roti menu Roti Kaya'),
 ('RK-KO-3','ST-KAYA',12,'GRAM',10,12,NULL),
 ('RK-KO-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RK-KO-1','ST-PLANTA',1,'PCS',1,1,'Stok roti menu Roti Kaya'),
 ('RK-KO-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RK-KO-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKEL-K-3','ST-KELAPA',3,'PCS',3,3,'Stok roti menu Roti Kelapa'),
 ('RKEL-K-3','ST-KAYA',12,'GRAM',10,12,NULL),
 ('RKEL-K-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKEL-K-1','ST-KELAPA',1,'PCS',1,1,'Stok roti menu Roti Kelapa'),
 ('RKEL-K-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RKEL-K-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKEL-3','ST-KELAPA',3,'PCS',3,3,'Stok roti menu Roti Kelapa'),
 ('RKEL-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKEL-1','ST-KELAPA',1,'PCS',1,1,'Stok roti menu Roti Kelapa'),
 ('RKEL-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKAC-K-3','ST-KACANG',3,'PCS',3,3,'Stok roti menu Roti Kacang'),
 ('RKAC-K-3','ST-KAYA',12,'GRAM',10,12,NULL),
 ('RKAC-K-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKAC-K-1','ST-KACANG',1,'PCS',1,1,'Stok roti menu Roti Kacang'),
 ('RKAC-K-1','ST-KAYA',4,'GRAM',4,4,NULL),
 ('RKAC-K-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('RKAC-3','ST-KACANG',3,'PCS',3,3,'Stok roti menu Roti Kacang'),
 ('RKAC-3','ST-PLASTIC-M',1,'PCS',1,1,NULL),
 ('RKAC-1','ST-KACANG',1,'PCS',1,1,'Stok roti menu Roti Kacang'),
 ('RKAC-1','ST-PLASTIC-S',1,'PCS',1,1,NULL),
 ('BENG-KB','ST-BENGGALI',1,'PCS',1,1,'Stok roti menu Roti Benggali'),
 ('BENG-KB','ST-KAYA',45,'GRAM',40,45,'HQ boleh ubah ke 40-45g'),
 ('BENG-KB','ST-BUTTER',45,'GRAM',40,45,'HQ boleh ubah'),
 ('BENG-KB','ST-PLASTIC-B',1,'PCS',1,1,NULL),
 ('BENG-KO','ST-BENGGALI',1,'PCS',1,1,'Stok roti menu Roti Benggali'),
 ('BENG-KO','ST-KAYA',40,'GRAM',35,40,NULL),
 ('BENG-KO','ST-PLASTIC-B',1,'PCS',1,1,NULL),
 ('BENG-PL','ST-BENGGALI',1,'PCS',1,1,'Stok roti menu Roti Benggali'),
 ('BENG-PL','ST-PLASTIC-B',1,'PCS',1,1,NULL),
 ('KAYA-CUP','ST-KAYA',50,'GRAM',45,50,NULL)
) AS v(sku, item_code, qty, unit, min_q, max_q, notes)
 ON p.sku = v.sku AND si.item_code = v.item_code
WHERE o.code = 'RKJ'
ON CONFLICT (product_id, stock_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- ============================================================
-- DRIVERS
-- ============================================================

INSERT INTO drivers (organization_id, driver_code, full_name, route_description, status, remarks)
SELECT o.id, v.code, v.name, v.route, 'ACTIVE'::entity_status, v.notes
FROM organizations o
CROSS JOIN (VALUES
 ('D001','Samad','HQ → Driver Ahmad/Fazil/Ridhuan → Kiosk','Guna ikut jumlah stock'),
 ('D002','Anuar','HQ → Kiosk','Guna ikut jumlah stock'),
 ('D003','Farid','HQ → Kiosk','Kenderaan perlu diisi admin'),
 ('D004','Fazil','Terima dari Samad → Kiosk',NULL),
 ('D005','Ridhuan','Terima dari Samad → Kiosk',NULL)
) AS v(code, name, route, notes)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, driver_code) DO UPDATE SET route_description = EXCLUDED.route_description;

-- ============================================================
-- VEHICLES
-- ============================================================

INSERT INTO vehicles (organization_id, vehicle_code, vehicle_type, capacity, default_driver_id, status, remarks)
SELECT o.id, v.code, v.vtype, v.cap, d.id, 'ACTIVE'::entity_status, v.notes
FROM organizations o
CROSS JOIN (VALUES
 ('V001','Lori 5 Tan','5 Tan','D001','No plat isi kemudian'),
 ('V002','Lori 3 Tan','3 Tan','D001','No plat isi kemudian'),
 ('V003','Lori 1 Tan','1 Tan','D002','No plat isi kemudian'),
 ('V004','Van','','D002','No plat isi kemudian'),
 ('V005','Lori/Van','','D003','Butiran isi kemudian')
) AS v(code, vtype, cap, driver_code, notes)
LEFT JOIN drivers d ON d.organization_id = o.id AND d.driver_code = v.driver_code
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, vehicle_code) DO UPDATE SET vehicle_type = EXCLUDED.vehicle_type;

-- Fleet vehicle inventory locations
INSERT INTO inventory_locations (organization_id, location_type, name, vehicle_id)
SELECT o.id, 'FLEET_VEHICLE'::location_type, COALESCE(v.plate_number, v.vehicle_type), v.id
FROM organizations o
JOIN vehicles v ON v.organization_id = o.id
WHERE o.code = 'RKJ'
ON CONFLICT DO NOTHING;

-- ============================================================
-- SHIFT TEMPLATES
-- ============================================================

INSERT INTO shift_templates (organization_id, template_code, name, start_time, end_time, default_hours, crosses_midnight, status, notes)
SELECT o.id, v.code, v.name, v.start_t::time, v.end_t::time, v.hours, v.cross_mid, 'ACTIVE'::entity_status, v.notes
FROM organizations o
CROSS JOIN (VALUES
 ('SH001','Shift Pagi','06:00','15:00',9,false,'Fleksibel'),
 ('SH002','Shift Petang','15:00','23:00',8,false,'Fleksibel'),
 ('SH003','Shift Siang 12 Jam','06:00','18:00',12,false,NULL),
 ('SH004','Shift Malam 12 Jam','18:00','06:00',12,true,'Cross midnight'),
 ('SH005','Custom',NULL,NULL,NULL,false,'Staff/Manager pilih masa sebenar')
) AS v(code, name, start_t, end_t, hours, cross_mid, notes)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, template_code) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================
-- PAYROLL RULES
-- ============================================================

INSERT INTO payroll_rules (organization_id, rule_code, worker_type, component, rate, period, shift_hours, status, notes)
SELECT o.id, v.code, v.wtype::worker_type, v.component, v.rate, v.period::payroll_period, v.shift_h, 'ACTIVE'::entity_status, v.notes
FROM organizations o
CROSS JOIN (VALUES
 ('PR001','FOREIGN','Kadar 8 Jam',55.0,'PER_SHIFT',8,'Bayar mingguan'),
 ('PR002','FOREIGN','Kadar 9 Jam',60.0,'PER_SHIFT',9,'Bayar mingguan'),
 ('PR003','FOREIGN','Kadar 12 Jam',75.0,'PER_SHIFT',12,'Bayar mingguan'),
 ('PR004','FOREIGN','Kadar 16 Jam',95.0,'PER_SHIFT',16,'Bayar mingguan'),
 ('PR005','FOREIGN','OT',5.0,'HOURLY',NULL,NULL),
 ('PR006','LOCAL','Gaji Pokok',1750.0,'MONTHLY',NULL,NULL),
 ('PR007','LOCAL','Elaun Kehadiran',200.0,'MONTHLY',NULL,NULL),
 ('PR008','LOCAL','Bonus Tamat Kontrak',500.0,'ONE_TIME',NULL,NULL),
 ('PR009','LOCAL','EPF/SOCSO/EIS',NULL,'MONTHLY',NULL,'Disediakan')
) AS v(code, wtype, component, rate, period, shift_h, notes)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, rule_code) DO UPDATE SET rate = EXCLUDED.rate;

-- ============================================================
-- COMMISSION TIERS
-- ============================================================

INSERT INTO commission_tiers (organization_id, tier_from, tier_to, commission_amount, formula_description, status, notes)
SELECT o.id, v.t_from, v.t_to, v.comm, v.formula, 'ACTIVE'::entity_status, v.notes
FROM organizations o
CROSS JOIN (VALUES
 (1000,1999,5,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (2000,2999,10,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (3000,3999,15,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (4000,4999,20,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (5000,5999,25,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (6000,6999,30,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (7000,7999,35,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (8000,8999,40,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (9000,9999,45,'Setiap kenaikan RM1000 tambah RM5','Boleh ubah admin'),
 (10000,NULL,50,'Teruskan formula / custom','Boleh ubah admin')
) AS v(t_from, t_to, comm, formula, notes)
WHERE o.code = 'RKJ';

-- ============================================================
-- FINANCE FLOW CONFIG
-- ============================================================

INSERT INTO finance_flow_config (organization_id, flow_code, collection_type, from_entity, to_entity, collector_role, auto_recorded, notes)
SELECT o.id, v.code, v.ctype::collection_type, v.from_e, v.to_e, v.collector, v.auto, v.notes
FROM organizations o
CROSS JOIN (VALUES
 ('CF001','QR','Customer','QR Company Account',NULL,true,'QR company'),
 ('CF002','CASH_KIOSK','Staff Kiosk','Manager','Area Manager',false,'Ada manager kutip'),
 ('CF003','CASH_KIOSK','Staff Kiosk','Third Party','Third Party',false,'Ada third party kutip'),
 ('CF004','BANK_IN','Manager/Third Party','Bank','Manager/Third Party',false,'Upload slip bank in'),
 ('CF005','BANK_IN','Bank','HQ Finance','Finance',false,'Finance verify')
) AS v(code, ctype, from_e, to_e, collector, auto, notes)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, flow_code) DO NOTHING;

-- ============================================================
-- ROLE PERMISSIONS (from role_permissions.csv)
-- ============================================================

INSERT INTO role_permissions (organization_id, role, module, permission)
SELECT o.id, v.role::user_role, v.module, v.perm::permission_level
FROM organizations o
CROSS JOIN (VALUES
 ('SUPER_ADMIN','pos','FULL'),('SUPER_ADMIN','shift','FULL'),('SUPER_ADMIN','stock_kiosk','FULL'),
 ('SUPER_ADMIN','stock_hq','FULL'),('SUPER_ADMIN','fleet','FULL'),('SUPER_ADMIN','payroll','FULL'),
 ('SUPER_ADMIN','finance','FULL'),('SUPER_ADMIN','reports','FULL'),('SUPER_ADMIN','user_management','FULL'),
 ('SUPER_ADMIN','approval','FULL'),
 ('ADMIN','pos','VIEW'),('ADMIN','shift','VIEW'),('ADMIN','stock_kiosk','FULL'),
 ('ADMIN','stock_hq','FULL'),('ADMIN','fleet','VIEW'),('ADMIN','payroll','NONE'),
 ('ADMIN','finance','VIEW'),('ADMIN','reports','FULL'),('ADMIN','user_management','FULL'),
 ('ADMIN','approval','FULL'),
 ('HR','pos','NONE'),('HR','shift','VIEW'),('HR','stock_kiosk','NONE'),
 ('HR','stock_hq','NONE'),('HR','fleet','NONE'),('HR','payroll','FULL'),
 ('HR','finance','VIEW'),('HR','reports','VIEW'),('HR','user_management','OWN'),
 ('HR','approval','NONE'),
 ('OPERATION_MANAGER','pos','VIEW'),('OPERATION_MANAGER','shift','VIEW'),('OPERATION_MANAGER','stock_kiosk','FULL'),
 ('OPERATION_MANAGER','stock_hq','VIEW'),('OPERATION_MANAGER','fleet','FULL'),('OPERATION_MANAGER','payroll','NONE'),
 ('OPERATION_MANAGER','finance','VIEW'),('OPERATION_MANAGER','reports','FULL'),('OPERATION_MANAGER','user_management','NONE'),
 ('OPERATION_MANAGER','approval','FULL'),
 ('CEO_FACTORY','pos','NONE'),('CEO_FACTORY','shift','NONE'),('CEO_FACTORY','stock_kiosk','NONE'),
 ('CEO_FACTORY','stock_hq','FULL'),('CEO_FACTORY','fleet','VIEW'),('CEO_FACTORY','payroll','NONE'),
 ('CEO_FACTORY','finance','NONE'),('CEO_FACTORY','reports','VIEW'),('CEO_FACTORY','user_management','NONE'),
 ('CEO_FACTORY','approval','NONE'),
 ('AREA_MANAGER','pos','VIEW_AREA'),('AREA_MANAGER','shift','VIEW_AREA'),('AREA_MANAGER','stock_kiosk','VIEW_AREA'),
 ('AREA_MANAGER','stock_hq','NONE'),('AREA_MANAGER','fleet','VIEW_AREA'),('AREA_MANAGER','payroll','NONE'),
 ('AREA_MANAGER','finance','VIEW'),('AREA_MANAGER','reports','VIEW'),('AREA_MANAGER','user_management','NONE'),
 ('AREA_MANAGER','approval','FULL'),
 ('DRIVER','pos','NONE'),('DRIVER','shift','NONE'),('DRIVER','stock_kiosk','NONE'),
 ('DRIVER','stock_hq','NONE'),('DRIVER','fleet','OWN'),('DRIVER','payroll','NONE'),
 ('DRIVER','finance','NONE'),('DRIVER','reports','VIEW'),('DRIVER','user_management','NONE'),
 ('DRIVER','approval','OWN'),
 ('STAFF','pos','FULL_OWN'),('STAFF','shift','FULL_OWN'),('STAFF','stock_kiosk','OWN'),
 ('STAFF','stock_hq','NONE'),('STAFF','fleet','NONE'),('STAFF','payroll','NONE'),
 ('STAFF','finance','OWN'),('STAFF','reports','OWN'),('STAFF','user_management','NONE'),
 ('STAFF','approval','NONE'),
 ('FINANCE','pos','VIEW'),('FINANCE','shift','VIEW'),('FINANCE','stock_kiosk','NONE'),
 ('FINANCE','stock_hq','NONE'),('FINANCE','fleet','NONE'),('FINANCE','payroll','VIEW'),
 ('FINANCE','finance','FULL'),('FINANCE','reports','FULL'),('FINANCE','user_management','NONE'),
 ('FINANCE','approval','FULL')
) AS v(role, module, perm)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, role, module) DO UPDATE SET permission = EXCLUDED.permission;

-- ============================================================
-- STAFF (sample from staff_master — full list)
-- ============================================================

-- Operational staff and banking records are intentionally excluded from Git.
-- Import them after deployment from an access-controlled private file with:
-- node scripts/register-company-staff.mjs --input <private-json-path> --apply

-- Note: HQ user profiles are created via Supabase Auth dashboard/API
-- Link profiles to regions after auth user creation:
-- U006 Safuan -> UTARA, U007 Hakim -> TENGAH, U008 Yati -> SELATAN
