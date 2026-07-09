-- RKJ One: Manufacturing GMP records for Roti Kaya Junus Manufacturing Sdn Bhd
-- Drafted for GMP-style production control. Do not run on production until reviewed.

CREATE TABLE IF NOT EXISTS public.factory_gmp_products (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
 product_code TEXT NOT NULL,
 product_name TEXT NOT NULL,
 batch_prefix TEXT NOT NULL,
 stock_item_codes TEXT[] NOT NULL DEFAULT '{}',
 pos_categories TEXT[] NOT NULL DEFAULT '{}',
 gmp_spec JSONB NOT NULL DEFAULT '{}',
 status entity_status NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, product_code)
);

CREATE TABLE IF NOT EXISTS public.factory_gmp_staff_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
 staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
 assignment_code TEXT NOT NULL,
 department TEXT NOT NULL,
 gmp_role TEXT NOT NULL,
 reports_to_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
 is_primary BOOLEAN NOT NULL DEFAULT false,
 effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
 effective_to DATE,
 status entity_status NOT NULL DEFAULT 'ACTIVE',
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, staff_id, assignment_code, effective_from)
);

CREATE TABLE IF NOT EXISTS public.factory_gmp_batch_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
 gmp_product_id UUID NOT NULL REFERENCES public.factory_gmp_products(id),
 hq_factory_order_id UUID REFERENCES public.hq_factory_orders(id) ON DELETE SET NULL,
 production_date DATE NOT NULL,
 batch_no TEXT NOT NULL,
 planned_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
 actual_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
 unit TEXT NOT NULL DEFAULT 'PCS',
 status TEXT NOT NULL DEFAULT 'DRAFT'
  CHECK (status IN ('DRAFT', 'IN_PROCESS', 'HOLD', 'RELEASED', 'REJECTED')),
 production_lead_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
 qa_reviewer_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
 raw_material_lots JSONB NOT NULL DEFAULT '[]',
 process_readings JSONB NOT NULL DEFAULT '{}',
 packaging_trace JSONB NOT NULL DEFAULT '{}',
 deviation_notes TEXT,
 released_at TIMESTAMPTZ,
 created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, batch_no)
);

CREATE TABLE IF NOT EXISTS public.factory_gmp_batch_checks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 batch_record_id UUID NOT NULL REFERENCES public.factory_gmp_batch_records(id) ON DELETE CASCADE,
 check_code TEXT NOT NULL,
 check_group TEXT NOT NULL,
 check_name TEXT NOT NULL,
 expected_value TEXT,
 actual_value TEXT,
 result TEXT NOT NULL DEFAULT 'PASS'
  CHECK (result IN ('PASS', 'FAIL', 'HOLD', 'NA')),
 checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 checked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (batch_record_id, check_code)
);

CREATE TABLE IF NOT EXISTS public.factory_gmp_sanitation_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
 production_date DATE NOT NULL,
 area_code TEXT NOT NULL,
 shift_name TEXT NOT NULL DEFAULT 'DAY',
 checklist JSONB NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'PASS'
  CHECK (status IN ('PASS', 'FAIL', 'HOLD')),
 cleaned_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
 verified_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, production_date, area_code, shift_name)
);

CREATE TABLE IF NOT EXISTS public.factory_gmp_non_conformances (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
 batch_record_id UUID REFERENCES public.factory_gmp_batch_records(id) ON DELETE SET NULL,
 severity TEXT NOT NULL DEFAULT 'MEDIUM'
  CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
 issue_type TEXT NOT NULL,
 description TEXT NOT NULL,
 containment_action TEXT,
 root_cause TEXT,
 corrective_action TEXT,
 status TEXT NOT NULL DEFAULT 'OPEN'
  CHECK (status IN ('OPEN', 'IN_REVIEW', 'CLOSED')),
 raised_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 closed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factory_gmp_products_org ON public.factory_gmp_products(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_factory_gmp_staff_org ON public.factory_gmp_staff_assignments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_factory_gmp_batches_date ON public.factory_gmp_batch_records(organization_id, production_date DESC);
CREATE INDEX IF NOT EXISTS idx_factory_gmp_batches_product ON public.factory_gmp_batch_records(gmp_product_id, production_date DESC);
CREATE INDEX IF NOT EXISTS idx_factory_gmp_checks_batch ON public.factory_gmp_batch_checks(batch_record_id);
CREATE INDEX IF NOT EXISTS idx_factory_gmp_sanitation_date ON public.factory_gmp_sanitation_logs(organization_id, production_date DESC);
CREATE INDEX IF NOT EXISTS idx_factory_gmp_nc_status ON public.factory_gmp_non_conformances(organization_id, status, severity);

DO $$
DECLARE
 v_table TEXT;
BEGIN
 FOREACH v_table IN ARRAY ARRAY[
  'factory_gmp_products',
  'factory_gmp_staff_assignments',
  'factory_gmp_batch_records',
  'factory_gmp_sanitation_logs',
  'factory_gmp_non_conformances'
 ]
 LOOP
  IF NOT EXISTS (
   SELECT 1
   FROM pg_trigger
   WHERE tgname = 'set_updated_at'
   AND tgrelid = format('public.%I', v_table)::regclass
  ) THEN
   EXECUTE format(
    'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
    v_table
   );
  END IF;
 END LOOP;
END $$;

ALTER TABLE public.factory_gmp_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_gmp_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_gmp_batch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_gmp_batch_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_gmp_sanitation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_gmp_non_conformances ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.factory_gmp_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_gmp_staff_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_gmp_batch_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_gmp_batch_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_gmp_sanitation_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.factory_gmp_non_conformances TO authenticated;

DROP POLICY IF EXISTS factory_gmp_products_read ON public.factory_gmp_products;
CREATE POLICY factory_gmp_products_read ON public.factory_gmp_products
 FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS factory_gmp_products_write ON public.factory_gmp_products;
CREATE POLICY factory_gmp_products_write ON public.factory_gmp_products
 FOR INSERT TO authenticated
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_products_update ON public.factory_gmp_products;
CREATE POLICY factory_gmp_products_update ON public.factory_gmp_products
 FOR UPDATE TO authenticated
 USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 )
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_staff_read ON public.factory_gmp_staff_assignments;
CREATE POLICY factory_gmp_staff_read ON public.factory_gmp_staff_assignments
 FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS factory_gmp_staff_write ON public.factory_gmp_staff_assignments;
CREATE POLICY factory_gmp_staff_write ON public.factory_gmp_staff_assignments
 FOR INSERT TO authenticated
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR')
 );

DROP POLICY IF EXISTS factory_gmp_staff_update ON public.factory_gmp_staff_assignments;
CREATE POLICY factory_gmp_staff_update ON public.factory_gmp_staff_assignments
 FOR UPDATE TO authenticated
 USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR')
 )
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR')
 );

DROP POLICY IF EXISTS factory_gmp_batches_read ON public.factory_gmp_batch_records;
CREATE POLICY factory_gmp_batches_read ON public.factory_gmp_batch_records
 FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS factory_gmp_batches_write ON public.factory_gmp_batch_records;
CREATE POLICY factory_gmp_batches_write ON public.factory_gmp_batch_records
 FOR INSERT TO authenticated
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_batches_update ON public.factory_gmp_batch_records;
CREATE POLICY factory_gmp_batches_update ON public.factory_gmp_batch_records
 FOR UPDATE TO authenticated
 USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 )
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_checks_read ON public.factory_gmp_batch_checks;
CREATE POLICY factory_gmp_checks_read ON public.factory_gmp_batch_checks
 FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS factory_gmp_checks_write ON public.factory_gmp_batch_checks;
CREATE POLICY factory_gmp_checks_write ON public.factory_gmp_batch_checks
 FOR INSERT TO authenticated
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_checks_update ON public.factory_gmp_batch_checks;
CREATE POLICY factory_gmp_checks_update ON public.factory_gmp_batch_checks
 FOR UPDATE TO authenticated
 USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 )
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_sanitation_read ON public.factory_gmp_sanitation_logs;
CREATE POLICY factory_gmp_sanitation_read ON public.factory_gmp_sanitation_logs
 FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS factory_gmp_sanitation_write ON public.factory_gmp_sanitation_logs;
CREATE POLICY factory_gmp_sanitation_write ON public.factory_gmp_sanitation_logs
 FOR INSERT TO authenticated
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_sanitation_update ON public.factory_gmp_sanitation_logs;
CREATE POLICY factory_gmp_sanitation_update ON public.factory_gmp_sanitation_logs
 FOR UPDATE TO authenticated
 USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 )
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER')
 );

DROP POLICY IF EXISTS factory_gmp_nc_read ON public.factory_gmp_non_conformances;
CREATE POLICY factory_gmp_nc_read ON public.factory_gmp_non_conformances
 FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());

DROP POLICY IF EXISTS factory_gmp_nc_write ON public.factory_gmp_non_conformances;
CREATE POLICY factory_gmp_nc_write ON public.factory_gmp_non_conformances
 FOR INSERT TO authenticated
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR')
 );

DROP POLICY IF EXISTS factory_gmp_nc_update ON public.factory_gmp_non_conformances;
CREATE POLICY factory_gmp_nc_update ON public.factory_gmp_non_conformances
 FOR UPDATE TO authenticated
 USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR')
 )
 WITH CHECK (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER', 'HR')
 );

DO $$
DECLARE
 v_org_id UUID;
 v_mfg_id UUID;
BEGIN
 SELECT id INTO v_org_id FROM public.organizations WHERE code = 'RKJ' LIMIT 1;
 IF v_org_id IS NULL THEN
  RAISE NOTICE 'RKJ organization not found; skip Manufacturing GMP seed';
  RETURN;
 END IF;

 SELECT id INTO v_mfg_id
 FROM public.legal_entities
 WHERE organization_id = v_org_id AND code = 'RKJ_MFG'
 LIMIT 1;

 INSERT INTO public.factory_gmp_products (
  organization_id, legal_entity_id, product_code, product_name, batch_prefix,
  stock_item_codes, pos_categories, gmp_spec, status
 )
 VALUES
 (v_org_id, v_mfg_id, 'GMP-RK', 'Roti Kaya / Planta', 'RK',
  ARRAY['ST-PLANTA','ST-KAYA','ST-BUTTER','ST-PLASTIC-S','ST-PLASTIC-M'],
  ARRAY['Roti Kaya'],
  '{"ccp":["Berat doh","Masa baking","Label tarikh production"],"release":["visual pass","kuantiti reconcile","QC sign-off"]}'::jsonb,
  'ACTIVE'),
 (v_org_id, v_mfg_id, 'GMP-RKEL', 'Roti Kelapa', 'RKEL',
  ARRAY['ST-KELAPA','ST-KAYA','ST-PLASTIC-S','ST-PLASTIC-M'],
  ARRAY['Roti Kelapa'],
  '{"ccp":["Keadaan inti kelapa","Cooling","Packing bersih"],"release":["bau normal","packing pass","QA sign-off"]}'::jsonb,
  'ACTIVE'),
 (v_org_id, v_mfg_id, 'GMP-RKAC', 'Roti Kacang', 'RKAC',
  ARRAY['ST-KACANG','ST-KAYA','ST-BUTTER','ST-PLASTIC-S','ST-PLASTIC-M'],
  ARRAY['Roti Kacang'],
  '{"ccp":["Lot kacang merah","Allergen cleaning","Berat filling"],"release":["allergen controlled","reject recorded","QA sign-off"]}'::jsonb,
  'ACTIVE'),
 (v_org_id, v_mfg_id, 'GMP-BENG', 'Roti Benggali', 'BENG',
  ARRAY['ST-BENGGALI','ST-KAYA','ST-BUTTER','ST-PLASTIC-B'],
  ARRAY['Roti Benggali'],
  '{"ccp":["Proofing loaf","Suhu/masa baking","Cooling sebelum packing"],"release":["slice normal","plastik B pass","trace lengkap"]}'::jsonb,
  'ACTIVE'),
 (v_org_id, v_mfg_id, 'GMP-PLG', 'Pelbagai / Kaya Butter Pack', 'PLG',
  ARRAY['ST-PLANTA','ST-KELAPA','ST-KACANG','ST-BENGGALI','ST-KAYA','ST-BUTTER','ST-PLASTIC-S','ST-PLASTIC-M','ST-PLASTIC-B'],
  ARRAY['Pelbagai'],
  '{"ccp":["Formula BOM","Berat kaya/butter","Jenis plastik","Mix-up SKU"],"release":["BOM reconcile","label betul","release sebelum dispatch"]}'::jsonb,
  'ACTIVE')
 ON CONFLICT (organization_id, product_code) DO UPDATE SET
  legal_entity_id = EXCLUDED.legal_entity_id,
  product_name = EXCLUDED.product_name,
  batch_prefix = EXCLUDED.batch_prefix,
  stock_item_codes = EXCLUDED.stock_item_codes,
  pos_categories = EXCLUDED.pos_categories,
  gmp_spec = EXCLUDED.gmp_spec,
  status = 'ACTIVE',
  updated_at = now();

 WITH assignments(staff_code, assignment_code, department, gmp_role, reports_to_code, is_primary, notes) AS (
  VALUES
  ('MFG008','ACCOUNTABLE_OWNER','LEADERSHIP','Managing Director / Owner oversight',NULL,true,'Accountable owner for group manufacturing governance'),
  ('MFG010','CEO_FACTORY_RELEASE','LEADERSHIP','CEO Factory and final batch release','MFG008',true,'Final release authority for critical batch and audit readiness'),
  ('MFG003','MFG_OPERATION_MANAGER','PRODUCTION','Operation Manager Manufacturing','MFG010',true,'Daily schedule, manpower and production risk control'),
  ('MFG012','PRODUCTION_MANAGER','PRODUCTION','Production Manager / line control','MFG003',true,'Batch record owner for production line 1-5'),
  ('MFG016','GMP_QA_SAFETY','QA_GMP','GMP, QA and Safety Lead','MFG010',true,'Pre-op hygiene, CCP/QC checks, CAPA and hold/release recommendation'),
  ('MFG007','STORE_STOCK_CARD','STORE','Store, stock card and raw material lot trace','MFG012',true,'Raw material lot, receiving, stock card and packaging stock'),
  ('MFG013','DOCUMENT_CONTROL','ADMIN','Document control clerk','MFG007',false,'Batch document filing and traceability support'),
  ('MFG019','ADMIN_RECORDS','ADMIN','Administration records','MFG007',false,'Support GMP filing, purchasing documents and office records'),
  ('MFG018','HR_TRAINING','HR','HR training and competence record','MFG010',true,'GMP training, PPE, medical/typhoid records if required'),
  ('MFG017','FINANCE_COSTING','FINANCE','Finance and production costing','MFG010',true,'Cost variance, wastage and BOM usage monitoring'),
  ('MFG004','SANITATION_LEAD','HYGIENE','Cleaner and sanitation owner','MFG016',true,'Pre-op and closing cleaning log'),
  ('MFG002','LINE_1_ROTI_KAYA','PRODUCTION','Line 1 operator - Roti Kaya','MFG012',true,'Production execution and batch entries for Roti Kaya'),
  ('MFG011','LINE_2_KELAPA','PRODUCTION','Line 2 operator - Roti Kelapa','MFG012',true,'Production execution and batch entries for Roti Kelapa'),
  ('MFG014','LINE_3_KACANG','PRODUCTION','Line 3 operator - Roti Kacang','MFG012',true,'Production execution and allergen handling for Roti Kacang'),
  ('MFG015','LINE_4_BENGGALI','PRODUCTION','Line 4 operator - Roti Benggali','MFG012',true,'Loaf, slicing, cooling and packing for Roti Benggali'),
  ('MFG020','LINE_5_PELBAGAI','PRODUCTION','Line 5 operator - Pelbagai packing','MFG012',true,'Mixed set, kaya/butter and final packing reconciliation')
 )
 INSERT INTO public.factory_gmp_staff_assignments (
  organization_id, legal_entity_id, staff_id, assignment_code, department,
  gmp_role, reports_to_staff_id, is_primary, notes
 )
 SELECT
  v_org_id,
  v_mfg_id,
  s.id,
  a.assignment_code,
  a.department,
  a.gmp_role,
  manager.id,
  a.is_primary,
  a.notes
 FROM assignments a
 JOIN public.staff s ON s.organization_id = v_org_id AND s.staff_code = a.staff_code
 LEFT JOIN public.staff manager ON manager.organization_id = v_org_id AND manager.staff_code = a.reports_to_code
 ON CONFLICT (organization_id, staff_id, assignment_code, effective_from) DO UPDATE SET
  legal_entity_id = EXCLUDED.legal_entity_id,
  department = EXCLUDED.department,
  gmp_role = EXCLUDED.gmp_role,
  reports_to_staff_id = EXCLUDED.reports_to_staff_id,
  is_primary = EXCLUDED.is_primary,
  notes = EXCLUDED.notes,
  status = 'ACTIVE',
  updated_at = now();
END $$;

COMMENT ON TABLE public.factory_gmp_products IS 'GMP product master for 5 RKJ Manufacturing product families.';
COMMENT ON TABLE public.factory_gmp_staff_assignments IS 'Overlay assignment for Manufacturing GMP roles without silently moving staff legal entity.';
COMMENT ON TABLE public.factory_gmp_batch_records IS 'Batch Manufacturing Record for production, process trace, packing trace and release status.';
COMMENT ON TABLE public.factory_gmp_batch_checks IS 'QC/CCP checklist entries linked to a factory GMP batch.';
COMMENT ON TABLE public.factory_gmp_sanitation_logs IS 'Pre-operation and closing sanitation logs for GMP readiness.';
COMMENT ON TABLE public.factory_gmp_non_conformances IS 'Non-conformance and CAPA log for manufacturing GMP issues.';
