-- Ramalan stok kiosk: cuti Malaysia + lead time sebelum terima stok baharu
-- Sesuai perniagaan lebuhraya (RNR/OBR/Hentian) — lonjakan balik kampung & cuti sekolah

CREATE TYPE malaysia_holiday_type AS ENUM (
 'CUTI_UMUM',
 'CUTI_NEGERI',
 'CUTI_SEKOLAH',
 'CUTI_FESTIF',
 'CUTI_BALIK_KAMPUNG'
);

CREATE TABLE malaysia_holidays (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 holiday_date DATE NOT NULL,
 name TEXT NOT NULL,
 holiday_type malaysia_holiday_type NOT NULL,
 region_code region_code,
 demand_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.20 CHECK (demand_multiplier >= 0.5 AND demand_multiplier <= 3.0),
 notes TEXT,
 UNIQUE (holiday_date, name)
);

CREATE INDEX idx_malaysia_holidays_date ON malaysia_holidays(holiday_date);

CREATE TABLE org_stock_planning_settings (
 organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 stock_coverage_days INT NOT NULL DEFAULT 1 CHECK (stock_coverage_days BETWEEN 0 AND 7),
 safety_buffer_pcs NUMERIC(8, 2) NOT NULL DEFAULT 10,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE malaysia_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_stock_planning_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY malaysia_holidays_read ON malaysia_holidays
 FOR SELECT TO authenticated USING (true);

CREATE POLICY org_stock_planning_read ON org_stock_planning_settings
 FOR SELECT TO authenticated
 USING (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 );

GRANT SELECT ON malaysia_holidays TO authenticated;
GRANT SELECT ON org_stock_planning_settings TO authenticated;

INSERT INTO org_stock_planning_settings (organization_id, stock_coverage_days, safety_buffer_pcs)
SELECT o.id, 1, 10
FROM organizations o
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id) DO NOTHING;

-- ============================================================
-- Cuti umum, festif, sekolah & balik kampung (2025–2027)
-- ============================================================

INSERT INTO malaysia_holidays (holiday_date, name, holiday_type, demand_multiplier, notes) VALUES
 -- 2025
 ('2025-01-01', 'Tahun Baru', 'CUTI_UMUM', 1.35, NULL),
 ('2025-01-28', 'Eve Tahun Baru Cina', 'CUTI_BALIK_KAMPUNG', 1.85, 'Lonjakan trafik lebuhraya'),
 ('2025-01-29', 'Tahun Baru Cina', 'CUTI_FESTIF', 1.65, NULL),
 ('2025-01-30', 'Tahun Baru Cina (Hari 2)', 'CUTI_FESTIF', 1.55, NULL),
 ('2025-02-01', 'Hari Wilayah Persekutuan', 'CUTI_UMUM', 1.25, NULL),
 ('2025-02-11', 'Thaipusam', 'CUTI_UMUM', 1.30, NULL),
 ('2025-03-14', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, 'Permulaan cuti sekolah'),
 ('2025-03-15', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-16', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-17', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-18', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-19', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-20', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-21', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-22', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-03-28', 'Eve Hari Raya Aidilfitri', 'CUTI_BALIK_KAMPUNG', 2.00, 'Puncak balik kampung'),
 ('2025-03-29', 'Eve Hari Raya Aidilfitri', 'CUTI_BALIK_KAMPUNG', 2.00, NULL),
 ('2025-03-30', 'Eve Hari Raya Aidilfitri', 'CUTI_BALIK_KAMPUNG', 1.90, NULL),
 ('2025-03-31', 'Hari Raya Aidilfitri', 'CUTI_FESTIF', 1.70, NULL),
 ('2025-04-01', 'Hari Raya Aidilfitri (Hari 2)', 'CUTI_FESTIF', 1.60, NULL),
 ('2025-05-01', 'Hari Pekerja', 'CUTI_UMUM', 1.40, NULL),
 ('2025-05-12', 'Wesak', 'CUTI_UMUM', 1.30, NULL),
 ('2025-05-24', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-25', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-26', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-27', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-28', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-29', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-30', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2025-05-31', 'Hari Keputeraan Agong', 'CUTI_UMUM', 1.35, NULL),
 ('2025-06-06', 'Eve Hari Raya Haji', 'CUTI_BALIK_KAMPUNG', 1.75, NULL),
 ('2025-06-07', 'Hari Raya Haji', 'CUTI_FESTIF', 1.55, NULL),
 ('2025-06-16', 'Awal Muharam', 'CUTI_UMUM', 1.25, NULL),
 ('2025-08-31', 'Hari Merdeka', 'CUTI_UMUM', 1.45, NULL),
 ('2025-09-05', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-06', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-07', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-08', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-09', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-10', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-11', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-12', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-13', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2025-09-16', 'Hari Malaysia', 'CUTI_UMUM', 1.40, NULL),
 ('2025-10-20', 'Deepavali', 'CUTI_UMUM', 1.35, NULL),
 ('2025-11-20', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.22, NULL),
 ('2025-11-21', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.22, NULL),
 ('2025-12-20', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.25, NULL),
 ('2025-12-21', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.25, NULL),
 ('2025-12-22', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.25, NULL),
 ('2025-12-23', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.25, NULL),
 ('2025-12-24', 'Eve Krismas', 'CUTI_BALIK_KAMPUNG', 1.80, NULL),
 ('2025-12-25', 'Krismas', 'CUTI_FESTIF', 1.50, NULL),
 ('2025-12-26', 'Cuti Akhir Tahun', 'CUTI_SEKOLAH', 1.30, NULL),
 ('2025-12-27', 'Cuti Akhir Tahun', 'CUTI_SEKOLAH', 1.30, NULL),
 ('2025-12-28', 'Cuti Akhir Tahun', 'CUTI_SEKOLAH', 1.30, NULL),
 ('2025-12-29', 'Cuti Akhir Tahun', 'CUTI_SEKOLAH', 1.30, NULL),
 ('2025-12-30', 'Cuti Akhir Tahun', 'CUTI_SEKOLAH', 1.30, NULL),
 ('2025-12-31', 'Eve Tahun Baru', 'CUTI_BALIK_KAMPUNG', 1.85, NULL),
 -- 2026
 ('2026-01-01', 'Tahun Baru', 'CUTI_UMUM', 1.35, NULL),
 ('2026-01-02', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.28, NULL),
 ('2026-02-15', 'Eve Tahun Baru Cina', 'CUTI_BALIK_KAMPUNG', 1.90, NULL),
 ('2026-02-16', 'Eve Tahun Baru Cina', 'CUTI_BALIK_KAMPUNG', 1.95, NULL),
 ('2026-02-17', 'Tahun Baru Cina', 'CUTI_FESTIF', 1.70, NULL),
 ('2026-02-18', 'Tahun Baru Cina (Hari 2)', 'CUTI_FESTIF', 1.60, NULL),
 ('2026-03-03', 'Thaipusam', 'CUTI_UMUM', 1.30, NULL),
 ('2026-03-13', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-14', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-15', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-16', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-17', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-18', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-19', 'Cuti Sekolah Term 1', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-03-20', 'Eve Hari Raya Aidilfitri', 'CUTI_BALIK_KAMPUNG', 2.00, NULL),
 ('2026-03-21', 'Eve Hari Raya Aidilfitri', 'CUTI_BALIK_KAMPUNG', 2.00, NULL),
 ('2026-03-22', 'Hari Raya Aidilfitri', 'CUTI_FESTIF', 1.70, NULL),
 ('2026-05-01', 'Hari Pekerja', 'CUTI_UMUM', 1.40, NULL),
 ('2026-05-24', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-05-25', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-05-26', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-05-27', 'Wesak', 'CUTI_UMUM', 1.30, NULL),
 ('2026-05-28', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-05-29', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-05-30', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-05-31', 'Cuti Pertengahan Tahun', 'CUTI_SEKOLAH', 1.20, NULL),
 ('2026-06-01', 'Hari Keputeraan Agong', 'CUTI_UMUM', 1.35, NULL),
 ('2026-06-26', 'Eve Hari Raya Haji', 'CUTI_BALIK_KAMPUNG', 1.75, NULL),
 ('2026-06-27', 'Hari Raya Haji', 'CUTI_FESTIF', 1.55, NULL),
 ('2026-07-16', 'Awal Muharam', 'CUTI_UMUM', 1.25, NULL),
 ('2026-08-31', 'Hari Merdeka', 'CUTI_UMUM', 1.45, NULL),
 ('2026-09-05', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-06', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-07', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-08', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-09', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-10', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-11', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-12', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-13', 'Cuti Sekolah Term 2', 'CUTI_SEKOLAH', 1.18, NULL),
 ('2026-09-16', 'Hari Malaysia', 'CUTI_UMUM', 1.40, NULL),
 ('2026-11-08', 'Deepavali', 'CUTI_UMUM', 1.35, NULL),
 ('2026-11-20', 'Cuti Akhir Tahun Sekolah', 'CUTI_SEKOLAH', 1.22, NULL),
 ('2026-12-24', 'Eve Krismas', 'CUTI_BALIK_KAMPUNG', 1.80, NULL),
 ('2026-12-25', 'Krismas', 'CUTI_FESTIF', 1.50, NULL),
 ('2026-12-26', 'Cuti Akhir Tahun', 'CUTI_SEKOLAH', 1.30, NULL),
 ('2026-12-31', 'Eve Tahun Baru', 'CUTI_BALIK_KAMPUNG', 1.85, NULL),
 -- 2027 (asas)
 ('2027-01-01', 'Tahun Baru', 'CUTI_UMUM', 1.35, NULL),
 ('2027-02-06', 'Tahun Baru Cina', 'CUTI_FESTIF', 1.70, NULL),
 ('2027-02-05', 'Eve Tahun Baru Cina', 'CUTI_BALIK_KAMPUNG', 1.90, NULL),
 ('2027-05-01', 'Hari Pekerja', 'CUTI_UMUM', 1.40, NULL),
 ('2027-08-31', 'Hari Merdeka', 'CUTI_UMUM', 1.45, NULL),
 ('2027-09-16', 'Hari Malaysia', 'CUTI_UMUM', 1.40, NULL),
 ('2027-12-25', 'Krismas', 'CUTI_FESTIF', 1.50, NULL)
ON CONFLICT (holiday_date, name) DO NOTHING;

-- ============================================================
-- Pengganda permintaan harian (lebuhraya + cuti)
-- ============================================================

CREATE OR REPLACE FUNCTION malaysia_highway_demand_multiplier(
 p_date DATE,
 p_branch_name TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
 v_mult NUMERIC := 1.0;
 v_holiday NUMERIC;
 v_dow INT;
 v_highway BOOLEAN;
BEGIN
 v_highway := p_branch_name ILIKE 'RNR %'
 OR p_branch_name ILIKE 'OBR %'
 OR p_branch_name ILIKE 'Plaza Tol%'
 OR p_branch_name ILIKE 'Hentian Sebelah%';

 IF NOT v_highway THEN
 v_mult := 0.95;
 END IF;

 v_dow := EXTRACT(ISODOW FROM p_date)::int;
 IF v_dow IN (5, 6, 7) THEN
 v_mult := GREATEST(v_mult, CASE WHEN v_highway THEN 1.18 ELSE 1.10 END);
 ELSIF v_dow = 4 THEN
 v_mult := GREATEST(v_mult, CASE WHEN v_highway THEN 1.08 ELSE 1.03 END);
 END IF;

 SELECT MAX(h.demand_multiplier) INTO v_holiday
 FROM malaysia_holidays h
 WHERE h.holiday_date = p_date;

 IF v_holiday IS NOT NULL THEN
 v_mult := GREATEST(v_mult, v_holiday);
 END IF;

 RETURN LEAST(2.5, GREATEST(0.7, v_mult));
END;
$$;

CREATE OR REPLACE FUNCTION malaysia_effective_consumption_days(
 p_from DATE,
 p_to DATE,
 p_branch_name TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
 v_day DATE;
 v_sum NUMERIC := 0;
BEGIN
 IF p_to < p_from THEN
 RETURN 0;
 END IF;

 v_day := p_from;
 WHILE v_day <= p_to LOOP
 v_sum := v_sum + malaysia_highway_demand_multiplier(v_day, p_branch_name);
 v_day := v_day + 1;
 END LOOP;

 RETURN v_sum;
END;
$$;

CREATE OR REPLACE FUNCTION malaysia_holidays_in_range(
 p_from DATE,
 p_to DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
 SELECT COALESCE(
 jsonb_agg(
 jsonb_build_object(
 'date', h.holiday_date,
 'name', h.name,
 'type', h.holiday_type,
 'demand_multiplier', h.demand_multiplier
 )
 ORDER BY h.holiday_date, h.name
 ),
 '[]'::jsonb
 )
 FROM malaysia_holidays h
 WHERE h.holiday_date BETWEEN p_from AND p_to;
$$;

CREATE OR REPLACE FUNCTION branch_roti_daily_pcs(
 p_org_id UUID,
 p_branch_id UUID,
 p_location_id UUID,
 p_stock_item_id UUID,
 p_pack_qty NUMERIC,
 p_branch_name TEXT,
 p_avg_sales NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_avg NUMERIC;
 v_highway BOOLEAN;
BEGIN
 IF p_location_id IS NOT NULL THEN
 SELECT COALESCE(AVG(daily_qty), 0) INTO v_avg
 FROM (
 SELECT DATE(sm.created_at) AS d, SUM(ABS(sm.quantity)) AS daily_qty
 FROM stock_movements sm
 WHERE sm.organization_id = p_org_id
 AND sm.location_id = p_location_id
 AND sm.stock_item_id = p_stock_item_id
 AND sm.movement_type = 'SALE_DEDUCT'
 AND sm.created_at >= (CURRENT_DATE - 14)::timestamptz
 GROUP BY DATE(sm.created_at)
 ) s;

 IF v_avg > 0 THEN
 RETURN v_avg;
 END IF;
 END IF;

 IF COALESCE(p_avg_sales, 0) > 0 THEN
 RETURN GREATEST(8, CEIL(p_avg_sales / 6.0));
 END IF;

 v_highway := p_branch_name ILIKE 'RNR %'
 OR p_branch_name ILIKE 'OBR %'
 OR p_branch_name ILIKE 'Plaza Tol%';

 RETURN GREATEST(
 COALESCE(p_pack_qty, 20) * CASE WHEN v_highway THEN 1.2 ELSE 0.9 END,
 COALESCE(p_pack_qty, 20) * 0.5
 );
END;
$$;

GRANT EXECUTE ON FUNCTION malaysia_highway_demand_multiplier(DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION malaysia_effective_consumption_days(DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION malaysia_holidays_in_range(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION branch_roti_daily_pcs(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

-- ============================================================
-- Cadangan order: lead time + cuti + keperluan stok
-- ============================================================

CREATE OR REPLACE FUNCTION suggest_hq_factory_order(p_production_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_org_id UUID;
 v_branch JSONB;
 v_branches JSONB := '[]'::jsonb;
 v_factory_items JSONB := '[]'::jsonb;
 v_loc RECORD;
 v_stock RECORD;
 v_bal NUMERIC;
 v_target NUMERIC;
 v_suggest_pcs NUMERIC;
 v_suggest_bags NUMERIC;
 v_total_roti JSONB := '{}'::jsonb;
 v_code TEXT;
 v_sum NUMERIC;
 v_default_driver UUID;
 v_driver_name TEXT;
 v_potential NUMERIC;
 v_avg_sales NUMERIC;
 v_stock_status TEXT;
 v_prediction_note TEXT;
 v_branch_count INT := 0;
 v_location_id UUID;
 v_lead_days INT;
 v_coverage_days INT;
 v_safety_pcs NUMERIC;
 v_daily_pcs NUMERIC;
 v_effective_days NUMERIC;
 v_projected_use NUMERIC;
 v_remaining NUMERIC;
 v_holidays JSONB;
 v_holiday_boost NUMERIC;
 v_plan_from DATE;
 v_plan_to DATE;
BEGIN
 SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
 IF v_org_id IS NULL THEN RETURN '{}'::jsonb; END IF;

 SELECT
 COALESCE(s.stock_coverage_days, 1),
 COALESCE(s.safety_buffer_pcs, 10)
 INTO v_coverage_days, v_safety_pcs
 FROM org_stock_planning_settings s
 WHERE s.organization_id = v_org_id;

 IF NOT FOUND THEN
 v_coverage_days := 1;
 v_safety_pcs := 10;
 END IF;

 v_lead_days := GREATEST(0, (p_production_date - CURRENT_DATE));
 v_plan_from := CURRENT_DATE;
 v_plan_to := p_production_date + v_coverage_days;

 v_holidays := malaysia_holidays_in_range(v_plan_from, v_plan_to);
 v_holiday_boost := CASE
 WHEN v_lead_days + v_coverage_days <= 0 THEN 1.0
 ELSE ROUND(
 malaysia_effective_consumption_days(v_plan_from, v_plan_to, 'RNR Lebuhraya')
 / GREATEST(1, (v_plan_to - v_plan_from + 1)),
 2
 )
 END;

 FOR v_loc IN
 SELECT b.id AS branch_id, b.branch_code, b.branch_name, b.area,
 b.status AS branch_status,
 COALESCE(r.code::text, b.area) AS region_code,
 (
 SELECT il.id FROM inventory_locations il
 WHERE il.branch_id = b.id AND il.location_type = 'BRANCH_KIOSK'
 ORDER BY il.is_active DESC, il.created_at
 LIMIT 1
 ) AS location_id
 FROM branches b
 LEFT JOIN regions r ON r.id = b.region_id
 WHERE b.organization_id = v_org_id
 ORDER BY b.branch_code
 LOOP
 v_branch_count := v_branch_count + 1;
 v_location_id := v_loc.location_id;
 v_potential := branch_sales_potential_factor(v_org_id, v_loc.branch_id, v_loc.branch_name);

 SELECT COALESCE(AVG(total_sales), 0) INTO v_avg_sales
 FROM pos_daily_summaries
 WHERE organization_id = v_org_id
 AND branch_id = v_loc.branch_id
 AND summary_date >= CURRENT_DATE - 14;

 v_effective_days := malaysia_effective_consumption_days(
 v_plan_from,
 v_plan_to,
 v_loc.branch_name
 );

 v_default_driver := default_driver_id_for_branch(v_org_id, v_loc.branch_id);
 SELECT full_name INTO v_driver_name FROM drivers WHERE id = v_default_driver;

 v_branch := jsonb_build_object(
 'branch_id', v_loc.branch_id,
 'branch_code', v_loc.branch_code,
 'branch_name', v_loc.branch_name,
 'region_code', v_loc.region_code,
 'location_id', v_location_id,
 'branch_status', v_loc.branch_status,
 'has_kiosk', v_location_id IS NOT NULL,
 'default_driver_id', v_default_driver,
 'default_driver_name', v_driver_name,
 'potential_factor', ROUND(v_potential, 2),
 'avg_daily_sales', ROUND(v_avg_sales, 2),
 'effective_consumption_days', ROUND(v_effective_days, 2),
 'items', '[]'::jsonb
 );

 FOR v_stock IN
 SELECT si.*
 FROM stock_items si
 WHERE si.organization_id = v_org_id
 AND si.category = 'Roti'
 AND si.status = 'ACTIVE'
 AND si.item_code IN ('ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI')
 ORDER BY si.item_code
 LOOP
 v_bal := 0;
 IF v_location_id IS NOT NULL THEN
 SELECT COALESCE(ib.quantity, 0) INTO v_bal
 FROM inventory_balances ib
 WHERE ib.location_id = v_location_id
 AND ib.stock_item_id = v_stock.id;
 END IF;

 v_daily_pcs := branch_roti_daily_pcs(
 v_org_id,
 v_loc.branch_id,
 v_location_id,
 v_stock.id,
 COALESCE(v_stock.pack_quantity, 20),
 v_loc.branch_name,
 v_avg_sales
 );

 v_projected_use := v_daily_pcs * v_potential * malaysia_effective_consumption_days(
 v_plan_from,
 GREATEST(v_plan_from, p_production_date - 1),
 v_loc.branch_name
 );

 v_remaining := GREATEST(0, COALESCE(v_bal, 0) - v_projected_use);

 v_target := CEIL(
 v_daily_pcs * v_potential * v_effective_days
 + v_safety_pcs
 + GREATEST(COALESCE(v_stock.min_threshold, 0), 0)
 );

 v_suggest_pcs := GREATEST(0, v_target - v_remaining);
 v_suggest_bags := CASE
 WHEN COALESCE(v_stock.pack_quantity, 0) > 0
 THEN CEIL(v_suggest_pcs / v_stock.pack_quantity)
 ELSE v_suggest_pcs
 END;

 IF v_location_id IS NULL THEN
 v_suggest_bags := 0;
 v_suggest_pcs := 0;
 ELSIF COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) AND v_suggest_bags < 1 THEN
 v_suggest_bags := 1;
 v_suggest_pcs := v_suggest_bags * COALESCE(v_stock.pack_quantity, 1);
 ELSIF COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) AND v_suggest_bags < 1 THEN
 v_suggest_bags := 1;
 v_suggest_pcs := v_suggest_bags * COALESCE(v_stock.pack_quantity, 1);
 END IF;

 IF v_location_id IS NULL THEN
 v_prediction_note := 'Tiada kiosk aktif — hubungi pentadbir';
 v_stock_status := 'LOW';
 ELSIF v_lead_days > 0 AND jsonb_array_length(v_holidays) > 0 THEN
 v_prediction_note := 'Ramalan AI · ' || v_lead_days || ' hari sebelum stok baharu · cuti/lebuhraya ×'
 || ROUND(v_effective_days / GREATEST(1, v_lead_days + v_coverage_days + 1), 2);
 v_stock_status := CASE
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) THEN 'CRITICAL'
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN 'LOW'
 ELSE 'OK'
 END;
 ELSIF v_avg_sales > 0 THEN
 v_prediction_note := 'Ramalan AI · jualan RM' || ROUND(v_avg_sales, 0) || '/hari · '
 || v_lead_days || ' hari sebelum terima stok';
 v_stock_status := CASE
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.critical_threshold, 0) THEN 'CRITICAL'
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN 'LOW'
 ELSE 'OK'
 END;
 ELSE
 v_prediction_note := 'Ramalan AI · lokasi lebuhraya · ' || v_lead_days || ' hari lead time';
 v_stock_status := CASE
 WHEN COALESCE(v_bal, 0) <= COALESCE(v_stock.min_threshold, 0) THEN 'LOW'
 ELSE 'OK'
 END;
 END IF;

 v_branch := jsonb_set(
 v_branch,
 '{items}',
 (v_branch->'items') || jsonb_build_array(jsonb_build_object(
 'stock_item_id', v_stock.id,
 'item_code', v_stock.item_code,
 'name', v_stock.name,
 'current_pcs', COALESCE(v_bal, 0),
 'target_pcs', v_target,
 'daily_pcs_estimate', ROUND(v_daily_pcs, 1),
 'suggested_bags', v_suggest_bags,
 'suggested_pcs', v_suggest_bags * COALESCE(v_stock.pack_quantity, 1),
 'unit', v_stock.base_unit,
 'stock_status', v_stock_status,
 'prediction_note', v_prediction_note
 ))
 );

 IF v_suggest_bags > 0 THEN
 v_sum := COALESCE((v_total_roti->>v_stock.item_code)::numeric, 0) + v_suggest_bags;
 v_total_roti := v_total_roti || jsonb_build_object(v_stock.item_code, v_sum);
 END IF;
 END LOOP;

 v_branches := v_branches || v_branch;
 END LOOP;

 FOR v_stock IN
 SELECT si.*
 FROM stock_items si
 WHERE si.organization_id = v_org_id
 AND si.category IN ('Bahan', 'Packaging')
 AND si.status = 'ACTIVE'
 ORDER BY si.item_code
 LOOP
 v_suggest_bags := 0;
 IF v_stock.category = 'Bahan' THEN
 SELECT COALESCE(SUM((v_total_roti->>si2.item_code)::numeric), 0) INTO v_sum
 FROM stock_items si2
 WHERE si2.organization_id = v_org_id
 AND si2.item_code IN ('ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI');
 v_suggest_bags := CASE WHEN v_sum > 0 THEN GREATEST(1, CEIL(v_sum / 20.0)) ELSE 0 END;
 ELSIF v_stock.item_code LIKE 'ST-PLASTIC-%' THEN
 v_code := replace(v_stock.item_code, 'ST-PLASTIC-', '');
 v_sum := COALESCE((v_total_roti->>(
 CASE v_code
 WHEN 'S' THEN 'ST-PLANTA'
 WHEN 'M' THEN 'ST-KACANG'
 ELSE 'ST-BENGGALI'
 END
 ))::numeric, 0);
 v_suggest_bags := GREATEST(0, CEIL(v_sum));
 END IF;

 IF v_suggest_bags > 0 THEN
 v_factory_items := v_factory_items || jsonb_build_array(jsonb_build_object(
 'stock_item_id', v_stock.id,
 'item_code', v_stock.item_code,
 'name', v_stock.name,
 'suggested_qty', v_suggest_bags,
 'unit', COALESCE(v_stock.pack_unit::text, v_stock.base_unit::text)
 ));
 END IF;
 END LOOP;

 RETURN jsonb_build_object(
 'production_date', p_production_date,
 'cutoff_at', factory_order_cutoff_at(p_production_date),
 'window_open', is_factory_order_window_open(v_org_id, p_production_date),
 'branch_count', v_branch_count,
 'order_lead_days', v_lead_days,
 'stock_coverage_days', v_coverage_days,
 'stock_receive_date', p_production_date,
 'order_deadline_note', CASE
 WHEN v_lead_days > 1 THEN
 'Order ' || v_lead_days || ' hari sebelum terima stok baharu (' || p_production_date || ')'
 WHEN v_lead_days = 1 THEN
 'Order esok sebelum 10 malam — stok baharu ' || p_production_date
 ELSE
 'Stok baharu hari ini (' || p_production_date || ') — order tutup T-1 10 malam'
 END,
 'holiday_demand_boost', v_holiday_boost,
 'holidays_in_window', v_holidays,
 'branches', v_branches,
 'factory_items', v_factory_items
 );
END;
$$;
