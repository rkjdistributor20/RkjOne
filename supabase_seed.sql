-- RKJ One simplified seed data. Review before production import.

create table if not exists rkj_branches (
 branch_code text primary key,
 branch_name text not null,
 area text,
 manager_name text,
 status text default 'Active',
 latitude text,
 longitude text,
 remarks text
);

create table if not exists rkj_products (
 sku text primary key,
 name text not null,
 category text,
 price numeric,
 sale_unit text,
 status text default 'Active',
 notes text
);

create table if not exists rkj_stock_items (
 item_code text primary key,
 name text not null,
 category text,
 storage_unit text,
 conversion_text text,
 min_threshold numeric,
 critical_threshold numeric,
 status text default 'Active',
 notes text
);

create table if not exists rkj_drivers (
 driver_id text primary key,
 name text not null,
 route text,
 vehicle_default text,
 status text default 'Active',
 phone text,
 notes text
);

create table if not exists rkj_shift_templates (
 template_id text primary key,
 name text not null,
 start_time text,
 end_time text,
 default_hours numeric,
 status text default 'Active',
 notes text
);

-- Branches
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR001','RNR Juru Arah Selatan','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR002','RNR Gunung Semanggul Arah Selatan','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR003','RNR Gunung Semanggul Arah Utara','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR004','Hentian Sebelah Bukit Gantang Arah Utara','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR005','RNR Sg Perak Arah Selatan','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR006','RNR Sg Perak Arah Utara','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR007','RNR Simpang Pulai Arah Selatan','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR008','RNR Simpang Pulai Arah Utara','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR009','Plaza Tol Simpang Pulai','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR010','Plaza Tol WCE Taiping','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR011','RNR Sg Nyiur Arah Utara','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR012','Hentian Sebelah Bukit Gantang Arah Selatan','Utara','Safuan','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR013','RNR Tapah Selatan 1','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR014','RNR Tapah Selatan 2','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR015','RNR Tapah Utara','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR016','Plaza Tol Tapah','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR017','Hentian Sebelah Ladang Bikam Arah Utara','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR018','Hentian Sebelah Ladang Bikam Arah Selatan','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR019','Hentian Sebelah Behrang Arah Utara','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR020','Hentian Sebelah Behrang Arah Selatan','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR021','RNR Ulu Bernam Arah Selatan','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR022','Hentian Sebelah Tg Malim Arah Selatan','Tengah','Hakim','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR023','Hentian Sebelah Rawang Arah Selatan','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR024','RNR Rawang Arah Utara','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR025','Hentian Sebelah Sg Buluh Arah Selatan','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR026','OBR Sg Buluh Arah Utara','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR027','OBR Sg Buluh Arah Selatan','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR028','Plaza Tol Sg Besi Arah Utara','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR029','RNR Dengkil Arah Selatan','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR030','RNR Dengkil Arah Utara','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR031','RNR Seremban Arah Utara','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR032','Hentian Sebelah Pedas Linggi Arah Selatan','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR033','Hentian Sebelah Ayer Keroh Arah Selatan','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR034','RNR Elmina Arah Barat','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR035','RNR Gombak Arah Barat','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;
insert into rkj_branches (branch_code,branch_name,area,manager_name,status,latitude,longitude,remarks) values ('BR036','RNR Genting Sempah','Selatan','Yati','Active',NULL,NULL,NULL) on conflict (branch_code) do update set branch_name=excluded.branch_name, area=excluded.area, manager_name=excluded.manager_name, status=excluded.status;

-- Products
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RK-KB-3','Roti Kaya - 3 pcs Kaya Butter','Roti Kaya',10.0,'Set','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RK-KB-1','Roti Kaya - 1 pc Kaya Butter','Roti Kaya',3.5,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RK-KO-3','Roti Kaya - 3 pcs Kaya Only','Roti Kaya',7.0,'Set','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RK-KO-1','Roti Kaya - 1 pc Kaya Only','Roti Kaya',2.5,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKEL-K-3','Roti Kelapa - 3 pcs + Kaya','Roti Kelapa',10.0,'Set','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKEL-K-1','Roti Kelapa - 1 pc + Kaya','Roti Kelapa',3.5,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKEL-3','Roti Kelapa - 3 pcs','Roti Kelapa',7.0,'Set','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKEL-1','Roti Kelapa - 1 pc','Roti Kelapa',2.5,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKAC-K-3','Roti Kacang - 3 pcs + Kaya','Roti Kacang',11.0,'Set','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKAC-K-1','Roti Kacang - 1 pc + Kaya','Roti Kacang',4.0,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKAC-3','Roti Kacang - 3 pcs','Roti Kacang',8.0,'Set','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('RKAC-1','Roti Kacang - 1 pc','Roti Kacang',3.0,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('BENG-KB','Roti Benggali - Kaya Butter','Roti Benggali',12.5,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('BENG-KO','Roti Benggali - Kaya Only','Roti Benggali',9.0,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('BENG-PL','Roti Benggali - Plain','Roti Benggali',7.0,'Pcs','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;
insert into rkj_products (sku,name,category,price,sale_unit,status,notes) values ('KAYA-CUP','Roti Benggali - Kaya In Cup','Roti Benggali',5.0,'Cup','Active','Banner menu') on conflict (sku) do update set name=excluded.name, price=excluded.price, status=excluded.status;

-- Stock items
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-PLANTA','Roti Kaya','Roti','Bag/Pcs','1 Bag = 20 pcs',NULL,NULL,'Active','Stok roti asas menu Roti Kaya (nama kilang: Planta)') on conflict (item_code) do update set name=excluded.name, category=excluded.category, notes=excluded.notes, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-KELAPA','Roti Kelapa','Roti','Bag/Pcs','1 Bag = 28 pcs',NULL,NULL,'Active','Stok roti asas menu Roti Kelapa') on conflict (item_code) do update set name=excluded.name, category=excluded.category, notes=excluded.notes, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-KACANG','Roti Kacang','Roti','Bag/Pcs','1 Bag = 24 pcs',NULL,NULL,'Active','Stok roti asas menu Roti Kacang') on conflict (item_code) do update set name=excluded.name, category=excluded.category, notes=excluded.notes, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-BENGGALI','Roti Benggali','Roti','Bag/Pcs','1 Bag = 2 pcs',NULL,NULL,'Active','Stok roti asas menu Roti Benggali') on conflict (item_code) do update set name=excluded.name, category=excluded.category, notes=excluded.notes, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-KAYA','Kaya','Bahan','Tong/Kg/Gram','1 Tong = 5kg = 5000g',NULL,NULL,'Active',NULL) on conflict (item_code) do update set name=excluded.name, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-BUTTER','Butter','Bahan','Tong/Kg/Gram','1 Tong = 4.8kg = 4800g',NULL,NULL,'Active',NULL) on conflict (item_code) do update set name=excluded.name, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-PLASTIC-S','Plastic Small','Packaging','Pack/Pcs','1 Pack = 100 pcs',NULL,NULL,'Active',NULL) on conflict (item_code) do update set name=excluded.name, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-PLASTIC-M','Plastic Medium','Packaging','Pack/Pcs','1 Pack = 100 pcs',NULL,NULL,'Active',NULL) on conflict (item_code) do update set name=excluded.name, conversion_text=excluded.conversion_text;
insert into rkj_stock_items (item_code,name,category,storage_unit,conversion_text,min_threshold,critical_threshold,status,notes) values ('ST-PLASTIC-B','Plastic Big','Packaging','Pack/Pcs','1 Pack = 100 pcs',NULL,NULL,'Active',NULL) on conflict (item_code) do update set name=excluded.name, conversion_text=excluded.conversion_text;

-- Drivers
insert into rkj_drivers (driver_id,name,route,vehicle_default,status,phone,notes) values ('D001','Samad','HQ → Driver Ahmad/Fazil/Ridhuan → Kiosk','Lori 5 Tan / Lori 3 Tan','Active',NULL,'Guna ikut jumlah stock') on conflict (driver_id) do update set name=excluded.name, route=excluded.route;
insert into rkj_drivers (driver_id,name,route,vehicle_default,status,phone,notes) values ('D002','Anuar','HQ → Kiosk','Van / Lori 1 Tan','Active',NULL,'Guna ikut jumlah stock') on conflict (driver_id) do update set name=excluded.name, route=excluded.route;
insert into rkj_drivers (driver_id,name,route,vehicle_default,status,phone,notes) values ('D003','Farid','HQ → Kiosk',NULL,'Active',NULL,'Kenderaan perlu diisi admin') on conflict (driver_id) do update set name=excluded.name, route=excluded.route;
insert into rkj_drivers (driver_id,name,route,vehicle_default,status,phone,notes) values ('D004','Fazil','Terima dari Samad → Kiosk',NULL,'Active',NULL,NULL) on conflict (driver_id) do update set name=excluded.name, route=excluded.route;
insert into rkj_drivers (driver_id,name,route,vehicle_default,status,phone,notes) values ('D005','Ridhuan','Terima dari Samad → Kiosk',NULL,'Active',NULL,NULL) on conflict (driver_id) do update set name=excluded.name, route=excluded.route;

-- Shift templates
insert into rkj_shift_templates (template_id,name,start_time,end_time,default_hours,status,notes) values ('SH001','Shift Pagi','06:00','15:00',9,'Active','Fleksibel') on conflict (template_id) do update set name=excluded.name;
insert into rkj_shift_templates (template_id,name,start_time,end_time,default_hours,status,notes) values ('SH002','Shift Petang','15:00','23:00',8,'Active','Fleksibel') on conflict (template_id) do update set name=excluded.name;
insert into rkj_shift_templates (template_id,name,start_time,end_time,default_hours,status,notes) values ('SH003','Shift Siang 12 Jam','06:00','18:00',12,'Active',NULL) on conflict (template_id) do update set name=excluded.name;
insert into rkj_shift_templates (template_id,name,start_time,end_time,default_hours,status,notes) values ('SH004','Shift Malam 12 Jam','18:00','06:00',12,'Active','Cross midnight') on conflict (template_id) do update set name=excluded.name;
insert into rkj_shift_templates (template_id,name,start_time,end_time,default_hours,status,notes) values ('SH005','Custom',NULL,NULL,NULL,'Active','Staff/Manager pilih masa sebenar') on conflict (template_id) do update set name=excluded.name;
