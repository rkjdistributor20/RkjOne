-- RKJ One: Correct GMP factory product master
-- Factory GMP products are Roti Planta, Roti Kelapa, Roti Kacang,
-- Roti Benggali and Kaya. POS menu groups are stored only as references.

DO $$
DECLARE
 v_org_id UUID;
 v_mfg_id UUID;
 v_old_products JSONB;
 v_new_products JSONB;
 v_old_stock JSONB;
 v_new_stock JSONB;
 v_old_assignments JSONB;
 v_new_assignments JSONB;
 v_old_rk_id UUID;
 v_new_planta_id UUID;
 v_old_plg_id UUID;
 v_new_kaya_id UUID;
BEGIN
 SELECT id INTO v_org_id
 FROM public.organizations
 WHERE code = 'RKJ'
 LIMIT 1;

 IF v_org_id IS NULL THEN
  RAISE NOTICE 'RKJ organization not found; skip GMP product master correction';
  RETURN;
 END IF;

 SELECT id INTO v_mfg_id
 FROM public.legal_entities
 WHERE organization_id = v_org_id
 AND code = 'RKJ_MFG'
 LIMIT 1;

 SELECT jsonb_agg(to_jsonb(p) ORDER BY p.product_code) INTO v_old_products
 FROM public.factory_gmp_products p
 WHERE p.organization_id = v_org_id
 AND p.product_code IN ('GMP-RK','GMP-PLANTA','GMP-RKEL','GMP-RKAC','GMP-BENG','GMP-PLG','GMP-KAYA');

 SELECT to_jsonb(s) INTO v_old_stock
 FROM public.stock_items s
 WHERE s.organization_id = v_org_id
 AND s.item_code = 'ST-PLANTA';

 SELECT jsonb_agg(to_jsonb(a) ORDER BY a.assignment_code) INTO v_old_assignments
 FROM public.factory_gmp_staff_assignments a
 WHERE a.organization_id = v_org_id
 AND a.assignment_code IN (
  'LINE_1_ROTI_KAYA',
  'LINE_1_ROTI_PLANTA',
  'LINE_5_PELBAGAI',
  'LINE_5_KAYA'
 );

 UPDATE public.stock_items
 SET
  name = 'Roti Planta',
  category = 'Roti',
  base_unit = 'PCS',
  storage_unit = 'Bag/Pcs',
  conversion_text = '1 bag = 20 pcs',
  pack_quantity = 20,
  pack_unit = 'BAG',
  status = 'ACTIVE',
  notes = 'Produk buatan kilang Roti Planta; digunakan oleh menu POS Roti Kaya',
  updated_at = now()
 WHERE organization_id = v_org_id
 AND item_code = 'ST-PLANTA';

 SELECT id INTO v_old_rk_id
 FROM public.factory_gmp_products
 WHERE organization_id = v_org_id
 AND product_code = 'GMP-RK'
 LIMIT 1;

 SELECT id INTO v_new_planta_id
 FROM public.factory_gmp_products
 WHERE organization_id = v_org_id
 AND product_code = 'GMP-PLANTA'
 LIMIT 1;

 IF v_old_rk_id IS NOT NULL AND v_new_planta_id IS NULL THEN
  UPDATE public.factory_gmp_products
  SET product_code = 'GMP-PLANTA'
  WHERE id = v_old_rk_id;
 ELSIF v_old_rk_id IS NOT NULL AND v_new_planta_id IS NOT NULL THEN
  UPDATE public.factory_gmp_batch_records
  SET gmp_product_id = v_new_planta_id,
      updated_at = now()
  WHERE gmp_product_id = v_old_rk_id;

  DELETE FROM public.factory_gmp_products
  WHERE id = v_old_rk_id;
 END IF;

 SELECT id INTO v_old_plg_id
 FROM public.factory_gmp_products
 WHERE organization_id = v_org_id
 AND product_code = 'GMP-PLG'
 LIMIT 1;

 SELECT id INTO v_new_kaya_id
 FROM public.factory_gmp_products
 WHERE organization_id = v_org_id
 AND product_code = 'GMP-KAYA'
 LIMIT 1;

 IF v_old_plg_id IS NOT NULL AND v_new_kaya_id IS NULL THEN
  UPDATE public.factory_gmp_products
  SET product_code = 'GMP-KAYA'
  WHERE id = v_old_plg_id;
 ELSIF v_old_plg_id IS NOT NULL AND v_new_kaya_id IS NOT NULL THEN
  UPDATE public.factory_gmp_batch_records
  SET gmp_product_id = v_new_kaya_id,
      updated_at = now()
  WHERE gmp_product_id = v_old_plg_id;

  DELETE FROM public.factory_gmp_products
  WHERE id = v_old_plg_id;
 END IF;

 WITH desired(product_code, product_name, batch_prefix, stock_item_codes, pos_categories, gmp_spec) AS (
  VALUES
  (
   'GMP-PLANTA',
   'Roti Planta',
   'RPL',
   ARRAY['ST-PLANTA','ST-PLASTIC-S','ST-PLASTIC-M']::TEXT[],
   ARRAY['Roti Kaya']::TEXT[],
   jsonb_build_object(
    'factory_product', 'Roti Planta',
    'factory_product_type', 'ROTI',
    'pos_menu_reference', ARRAY['Roti Kaya'],
    'ccp', ARRAY['Berat doh','Masa proofing','Masa baking','Cooling sebelum packing','Label tarikh production'],
    'release', ARRAY['visual pass','packing bersih','QC sign-off']
   )
  ),
  (
   'GMP-RKEL',
   'Roti Kelapa',
   'RKEL',
   ARRAY['ST-KELAPA','ST-PLASTIC-S','ST-PLASTIC-M']::TEXT[],
   ARRAY['Roti Kelapa','Pelbagai']::TEXT[],
   jsonb_build_object(
    'factory_product', 'Roti Kelapa',
    'factory_product_type', 'ROTI',
    'pos_menu_reference', ARRAY['Roti Kelapa','Pelbagai'],
    'ccp', ARRAY['Keadaan inti kelapa','Berat filling','Cooling','Packing bersih'],
    'release', ARRAY['bau normal','packing pass','QA sign-off']
   )
  ),
  (
   'GMP-RKAC',
   'Roti Kacang',
   'RKAC',
   ARRAY['ST-KACANG','ST-PLASTIC-S','ST-PLASTIC-M']::TEXT[],
   ARRAY['Roti Kacang','Pelbagai']::TEXT[],
   jsonb_build_object(
    'factory_product', 'Roti Kacang',
    'factory_product_type', 'ROTI',
    'pos_menu_reference', ARRAY['Roti Kacang','Pelbagai'],
    'ccp', ARRAY['Lot kacang merah','Allergen cleaning','Berat filling'],
    'release', ARRAY['allergen controlled','reject recorded','QA sign-off']
   )
  ),
  (
   'GMP-BENG',
   'Roti Benggali',
   'BENG',
   ARRAY['ST-BENGGALI','ST-PLASTIC-B']::TEXT[],
   ARRAY['Roti Benggali','Pelbagai']::TEXT[],
   jsonb_build_object(
    'factory_product', 'Roti Benggali',
    'factory_product_type', 'ROTI',
    'pos_menu_reference', ARRAY['Roti Benggali','Pelbagai'],
    'ccp', ARRAY['Proofing loaf','Suhu/masa baking','Cooling sebelum packing'],
    'release', ARRAY['slice normal','plastik B pass','trace lengkap']
   )
  ),
  (
   'GMP-KAYA',
   'Kaya',
   'KAYA',
   ARRAY['ST-KAYA']::TEXT[],
   ARRAY['Roti Kaya','Roti Benggali','Pelbagai']::TEXT[],
   jsonb_build_object(
    'factory_product', 'Kaya',
    'factory_product_type', 'SPREAD',
    'pos_menu_reference', ARRAY['Roti Kaya','Roti Benggali','Pelbagai'],
    'ccp', ARRAY['Batch santan/telur/gula','Suhu masakan','Brix/tekstur','Cooling dan holding'],
    'release', ARRAY['tekstur normal','tiada kontaminasi','QA sign-off']
   )
  )
 )
 INSERT INTO public.factory_gmp_products (
  organization_id,
  legal_entity_id,
  product_code,
  product_name,
  batch_prefix,
  stock_item_codes,
  pos_categories,
  gmp_spec,
  status
 )
 SELECT
  v_org_id,
  v_mfg_id,
  d.product_code,
  d.product_name,
  d.batch_prefix,
  d.stock_item_codes,
  d.pos_categories,
  d.gmp_spec,
  'ACTIVE'::entity_status
 FROM desired d
 ON CONFLICT (organization_id, product_code) DO UPDATE SET
  legal_entity_id = EXCLUDED.legal_entity_id,
  product_name = EXCLUDED.product_name,
  batch_prefix = EXCLUDED.batch_prefix,
  stock_item_codes = EXCLUDED.stock_item_codes,
  pos_categories = EXCLUDED.pos_categories,
  gmp_spec = EXCLUDED.gmp_spec,
  status = 'ACTIVE',
  updated_at = now();

 UPDATE public.factory_gmp_staff_assignments a
 SET
  assignment_code = 'LINE_1_ROTI_PLANTA',
  gmp_role = 'Line 1 operator - Roti Planta',
  notes = 'Production execution and batch entries for Roti Planta',
  updated_at = now()
 WHERE a.organization_id = v_org_id
 AND a.assignment_code = 'LINE_1_ROTI_KAYA'
 AND NOT EXISTS (
  SELECT 1
  FROM public.factory_gmp_staff_assignments x
  WHERE x.organization_id = a.organization_id
  AND x.staff_id = a.staff_id
  AND x.assignment_code = 'LINE_1_ROTI_PLANTA'
  AND x.effective_from = a.effective_from
 );

 DELETE FROM public.factory_gmp_staff_assignments a
 WHERE a.organization_id = v_org_id
 AND a.assignment_code = 'LINE_1_ROTI_KAYA'
 AND EXISTS (
  SELECT 1
  FROM public.factory_gmp_staff_assignments x
  WHERE x.organization_id = a.organization_id
  AND x.staff_id = a.staff_id
  AND x.assignment_code = 'LINE_1_ROTI_PLANTA'
  AND x.effective_from = a.effective_from
 );

 UPDATE public.factory_gmp_staff_assignments a
 SET
  assignment_code = 'LINE_5_KAYA',
  gmp_role = 'Line 5 operator - Kaya',
  notes = 'Kaya cooking, cooling, holding and release record',
  updated_at = now()
 WHERE a.organization_id = v_org_id
 AND a.assignment_code = 'LINE_5_PELBAGAI'
 AND NOT EXISTS (
  SELECT 1
  FROM public.factory_gmp_staff_assignments x
  WHERE x.organization_id = a.organization_id
  AND x.staff_id = a.staff_id
  AND x.assignment_code = 'LINE_5_KAYA'
  AND x.effective_from = a.effective_from
 );

 DELETE FROM public.factory_gmp_staff_assignments a
 WHERE a.organization_id = v_org_id
 AND a.assignment_code = 'LINE_5_PELBAGAI'
 AND EXISTS (
  SELECT 1
  FROM public.factory_gmp_staff_assignments x
  WHERE x.organization_id = a.organization_id
  AND x.staff_id = a.staff_id
  AND x.assignment_code = 'LINE_5_KAYA'
  AND x.effective_from = a.effective_from
 );

 WITH desired(staff_code, assignment_code, department, gmp_role, reports_to_code, is_primary, notes) AS (
  VALUES
  ('MFG002','LINE_1_ROTI_PLANTA','PRODUCTION','Line 1 operator - Roti Planta','MFG012',true,'Production execution and batch entries for Roti Planta'),
  ('MFG020','LINE_5_KAYA','PRODUCTION','Line 5 operator - Kaya','MFG012',true,'Kaya cooking, cooling, holding and release record')
 )
 INSERT INTO public.factory_gmp_staff_assignments (
  organization_id,
  legal_entity_id,
  staff_id,
  assignment_code,
  department,
  gmp_role,
  reports_to_staff_id,
  is_primary,
  notes
 )
 SELECT
  v_org_id,
  v_mfg_id,
  s.id,
  d.assignment_code,
  d.department,
  d.gmp_role,
  manager.id,
  d.is_primary,
  d.notes
 FROM desired d
 JOIN public.staff s
  ON s.organization_id = v_org_id
 AND s.staff_code = d.staff_code
 LEFT JOIN public.staff manager
  ON manager.organization_id = v_org_id
 AND manager.staff_code = d.reports_to_code
 ON CONFLICT (organization_id, staff_id, assignment_code, effective_from) DO UPDATE SET
  legal_entity_id = EXCLUDED.legal_entity_id,
  department = EXCLUDED.department,
  gmp_role = EXCLUDED.gmp_role,
  reports_to_staff_id = EXCLUDED.reports_to_staff_id,
  is_primary = EXCLUDED.is_primary,
  notes = EXCLUDED.notes,
  status = 'ACTIVE',
  updated_at = now();

 SELECT jsonb_agg(to_jsonb(p) ORDER BY p.product_code) INTO v_new_products
 FROM public.factory_gmp_products p
 WHERE p.organization_id = v_org_id
 AND p.product_code IN ('GMP-PLANTA','GMP-RKEL','GMP-RKAC','GMP-BENG','GMP-KAYA');

 SELECT to_jsonb(s) INTO v_new_stock
 FROM public.stock_items s
 WHERE s.organization_id = v_org_id
 AND s.item_code = 'ST-PLANTA';

 SELECT jsonb_agg(to_jsonb(a) ORDER BY a.assignment_code) INTO v_new_assignments
 FROM public.factory_gmp_staff_assignments a
 WHERE a.organization_id = v_org_id
 AND a.assignment_code IN ('LINE_1_ROTI_PLANTA','LINE_5_KAYA');

 INSERT INTO public.audit_logs (
  organization_id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_values,
  new_values
 )
 VALUES (
  v_org_id,
  NULL,
  'correct_gmp_factory_product_master',
  'factory_gmp_products',
  NULL,
  jsonb_build_object(
   'stock_item', COALESCE(v_old_stock, '{}'::jsonb),
   'gmp_products', COALESCE(v_old_products, '[]'::jsonb),
   'staff_assignments', COALESCE(v_old_assignments, '[]'::jsonb)
  ),
  jsonb_build_object(
   'stock_item', COALESCE(v_new_stock, '{}'::jsonb),
   'gmp_products', COALESCE(v_new_products, '[]'::jsonb),
   'staff_assignments', COALESCE(v_new_assignments, '[]'::jsonb)
  )
 );
END $$;
