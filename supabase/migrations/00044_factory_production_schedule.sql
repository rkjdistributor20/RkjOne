-- Jadual production kilang (mingguan) + laporan order HQ
-- Kilang tetapkan hari production → HQ order ikut tarikh yang diterbitkan

-- ============================================================
-- JADUAL PRODUCTION MINGGUAN
-- ============================================================

CREATE TABLE factory_production_weeks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 week_start DATE NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
 notes TEXT,
 published_at TIMESTAMPTZ,
 published_by UUID REFERENCES profiles(id),
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, week_start)
);

CREATE INDEX idx_factory_prod_weeks_org ON factory_production_weeks(organization_id);
CREATE INDEX idx_factory_prod_weeks_start ON factory_production_weeks(week_start DESC);

CREATE TABLE factory_production_days (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 week_id UUID NOT NULL REFERENCES factory_production_weeks(id) ON DELETE CASCADE,
 production_date DATE NOT NULL,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (week_id, production_date)
);

CREATE INDEX idx_factory_prod_days_date ON factory_production_days(production_date);

-- ============================================================
-- ORDER HQ → KILANG
-- ============================================================

CREATE TABLE hq_factory_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_number TEXT NOT NULL,
 production_date DATE NOT NULL,
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
 status IN ('SUBMITTED', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED')
 ),
 notes TEXT,
 created_by UUID REFERENCES profiles(id),
 acknowledged_at TIMESTAMPTZ,
 acknowledged_by UUID REFERENCES profiles(id),
 fulfilled_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, order_number)
);

CREATE INDEX idx_hq_factory_orders_date ON hq_factory_orders(production_date DESC);
CREATE INDEX idx_hq_factory_orders_status ON hq_factory_orders(status);

CREATE TABLE hq_factory_order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL REFERENCES hq_factory_orders(id) ON DELETE CASCADE,
 stock_item_id UUID NOT NULL REFERENCES stock_items(id),
 quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
 unit stock_unit NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hq_factory_order_items_order ON hq_factory_order_items(order_id);

-- ============================================================
-- HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION week_start_monday(p_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
 SELECT (p_date - ((EXTRACT(ISODOW FROM p_date)::int - 1) || ' days')::interval)::date;
$$;

CREATE OR REPLACE FUNCTION can_manage_factory_production_schedule()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
 SELECT public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY');
$$;

CREATE OR REPLACE FUNCTION is_published_production_date(
 p_org_id UUID,
 p_production_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
 SELECT EXISTS (
 SELECT 1
 FROM factory_production_days d
 JOIN factory_production_weeks w ON w.id = d.week_id
 WHERE w.organization_id = p_org_id
 AND w.status = 'PUBLISHED'
 AND d.production_date = p_production_date
 );
$$;

GRANT EXECUTE ON FUNCTION week_start_monday(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_factory_production_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION is_published_production_date(UUID, DATE) TO authenticated;

-- ============================================================
-- RPC: Senarai tarikh production diterbitkan
-- ============================================================

CREATE OR REPLACE FUNCTION get_published_production_dates(
 p_from DATE DEFAULT CURRENT_DATE,
 p_to DATE DEFAULT (CURRENT_DATE + 56)
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_org_id UUID;
BEGIN
 SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
 IF v_org_id IS NULL THEN
 RETURN '[]'::jsonb;
 END IF;

 RETURN COALESCE(
 (
 SELECT jsonb_agg(
 jsonb_build_object(
 'production_date', d.production_date,
 'week_start', w.week_start,
 'week_notes', w.notes,
 'day_notes', d.notes
 )
 ORDER BY d.production_date
 )
 FROM factory_production_days d
 JOIN factory_production_weeks w ON w.id = d.week_id
 WHERE w.organization_id = v_org_id
 AND w.status = 'PUBLISHED'
 AND d.production_date BETWEEN p_from AND p_to
 ),
 '[]'::jsonb
 );
END;
$$;

GRANT EXECUTE ON FUNCTION get_published_production_dates(DATE, DATE) TO authenticated;

-- ============================================================
-- RPC: Simpan & terbitkan jadual minggu
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_factory_production_week(
 p_week_start DATE,
 p_production_dates DATE[],
 p_notes TEXT DEFAULT NULL,
 p_publish BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_week_id UUID;
 v_monday DATE;
 v_day DATE;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT can_manage_factory_production_schedule() THEN
 RAISE EXCEPTION 'Hanya kilang/HQ pentadbir boleh urus jadual production';
 END IF;

 SELECT organization_id INTO v_org_id FROM profiles WHERE id = v_user_id;
 v_monday := week_start_monday(p_week_start);

 IF v_monday != p_week_start THEN
 RAISE EXCEPTION 'Minggu mesti bermula Isnin (week_start=%)', v_monday;
 END IF;

 INSERT INTO factory_production_weeks (
 organization_id, week_start, status, notes, created_by
 ) VALUES (
 v_org_id, v_monday, CASE WHEN p_publish THEN 'PUBLISHED' ELSE 'DRAFT' END,
 p_notes, v_user_id
 )
 ON CONFLICT (organization_id, week_start) DO UPDATE SET
 notes = COALESCE(EXCLUDED.notes, factory_production_weeks.notes),
 status = CASE
 WHEN p_publish THEN 'PUBLISHED'
 ELSE factory_production_weeks.status
 END,
 published_at = CASE WHEN p_publish THEN now() ELSE factory_production_weeks.published_at END,
 published_by = CASE WHEN p_publish THEN v_user_id ELSE factory_production_weeks.published_by END,
 updated_at = now()
 RETURNING id INTO v_week_id;

 DELETE FROM factory_production_days WHERE week_id = v_week_id;

 IF p_production_dates IS NOT NULL THEN
 FOREACH v_day IN ARRAY p_production_dates
 LOOP
 IF week_start_monday(v_day) != v_monday THEN
 RAISE EXCEPTION 'Tarikh % tidak dalam minggu %', v_day, v_monday;
 END IF;
 INSERT INTO factory_production_days (week_id, production_date)
 VALUES (v_week_id, v_day);
 END LOOP;
 END IF;

 RETURN jsonb_build_object(
 'week_id', v_week_id,
 'week_start', v_monday,
 'status', CASE WHEN p_publish THEN 'PUBLISHED' ELSE 'DRAFT' END,
 'day_count', COALESCE(array_length(p_production_dates, 1), 0)
 );
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_factory_production_week(DATE, DATE[], TEXT, BOOLEAN) TO authenticated;

-- ============================================================
-- RPC: Order HQ ke kilang
-- ============================================================

CREATE OR REPLACE FUNCTION create_hq_factory_order(
 p_production_date DATE,
 p_items JSONB,
 p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_order_id UUID;
 v_order_number TEXT;
 v_item JSONB;
 v_stock RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order HQ boleh hantar order ke kilang';
 END IF;

 SELECT organization_id INTO v_org_id FROM profiles WHERE id = v_user_id;

 IF NOT is_published_production_date(v_org_id, p_production_date) THEN
 RAISE EXCEPTION 'Tarikh production % belum diterbitkan oleh kilang — pilih tarikh dari jadual production', p_production_date;
 END IF;

 IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
 RAISE EXCEPTION 'Sekurang-kurangnya satu item stok diperlukan';
 END IF;

 v_order_number := generate_inv_number('ORD', v_org_id);

 INSERT INTO hq_factory_orders (
 organization_id, order_number, production_date, status, notes, created_by
 ) VALUES (
 v_org_id, v_order_number, p_production_date, 'SUBMITTED', p_notes, v_user_id
 ) RETURNING id INTO v_order_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 INSERT INTO hq_factory_order_items (order_id, stock_item_id, quantity, unit)
 VALUES (
 v_order_id,
 v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit)
 );
 END LOOP;

 RETURN jsonb_build_object(
 'order_id', v_order_id,
 'order_number', v_order_number,
 'production_date', p_production_date,
 'status', 'SUBMITTED'
 );
END;
$$;

GRANT EXECUTE ON FUNCTION create_hq_factory_order(DATE, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION acknowledge_hq_factory_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_order RECORD;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 IF NOT can_manage_factory_production_schedule() THEN
 RAISE EXCEPTION 'Hanya kilang boleh sahkan order HQ';
 END IF;

 SELECT * INTO v_order FROM hq_factory_orders WHERE id = p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak dijumpai'; END IF;

 IF v_order.status != 'SUBMITTED' THEN
 RAISE EXCEPTION 'Order sudah diproses (status=%)', v_order.status;
 END IF;

 UPDATE hq_factory_orders SET
 status = 'ACKNOWLEDGED',
 acknowledged_at = now(),
 acknowledged_by = v_user_id,
 updated_at = now()
 WHERE id = p_order_id;

 RETURN jsonb_build_object('order_id', p_order_id, 'status', 'ACKNOWLEDGED');
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_hq_factory_order(UUID) TO authenticated;

-- Validasi tarikh production roti mesti dalam jadual kilang
CREATE OR REPLACE FUNCTION assert_published_production_date(
 p_org_id UUID,
 p_production_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
 IF p_production_date IS NULL THEN
 RAISE EXCEPTION 'Tarikh production wajib untuk roti';
 END IF;
 IF NOT is_published_production_date(p_org_id, p_production_date) THEN
 RAISE EXCEPTION 'Tarikh production % tidak dalam jadual kilang — HQ perlu order berdasarkan hari production yang diterbitkan', p_production_date;
 END IF;
END;
$$;

-- Patch receive_stock: validasi jadual kilang untuk roti
CREATE OR REPLACE FUNCTION receive_stock(
 p_location_id UUID,
 p_items JSONB,
 p_source TEXT DEFAULT 'FACTORY',
 p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_loc RECORD;
 v_item JSONB;
 v_stock RECORD;
 v_receive_id UUID;
 v_receive_number TEXT;
 v_prod DATE;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT il.*, b.id AS branch_ref
 INTO v_loc FROM inventory_locations il
 LEFT JOIN branches b ON b.id = il.branch_id
 WHERE il.id = p_location_id AND il.is_active = true;

 IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 v_org_id := v_loc.organization_id;

 IF v_loc.branch_id IS NOT NULL AND NOT public.has_branch_access(v_loc.branch_id) THEN
 RAISE EXCEPTION 'No branch access';
 END IF;

 IF v_loc.branch_id IS NULL AND public.user_role() NOT IN (
 'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY'
 ) THEN
 RAISE EXCEPTION 'Insufficient permissions for this location';
 END IF;

 v_receive_number := generate_inv_number('RCV', v_org_id);

 INSERT INTO stock_receives (
 organization_id, receive_number, location_id, source, notes, received_by
 ) VALUES (
 v_org_id, v_receive_number, p_location_id, p_source, p_notes, v_user_id
 ) RETURNING id INTO v_receive_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 v_prod := NULLIF(v_item->>'production_date', '')::date;

 IF is_roti_stock_item(v_stock.id) THEN
 IF v_prod IS NULL THEN
 RAISE EXCEPTION 'Tarikh production wajib untuk roti: %', v_stock.name;
 END IF;
 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production roti';
 END IF;
 PERFORM assert_published_production_date(v_org_id, v_prod);
 ELSIF v_prod IS NOT NULL AND NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production';
 END IF;

 INSERT INTO stock_movements (
 organization_id, movement_type, location_id, stock_item_id,
 quantity, unit, reference_type, reference_id, notes, created_by, production_date
 ) VALUES (
 v_org_id, 'RECEIVE', p_location_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 'stock_receive', v_receive_id, p_notes, v_user_id, v_prod
 );
 END LOOP;

 PERFORM check_low_stock(v_org_id);

 RETURN jsonb_build_object(
 'receive_id', v_receive_id,
 'receive_number', v_receive_number
 );
END;
$$;

-- Patch create_stock_transfer: validasi jadual untuk roti
CREATE OR REPLACE FUNCTION create_stock_transfer(
 p_from_location_id UUID,
 p_to_location_id UUID,
 p_items JSONB,
 p_driver_id UUID DEFAULT NULL,
 p_vehicle_id UUID DEFAULT NULL,
 p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_org_id UUID;
 v_from RECORD;
 v_to RECORD;
 v_item JSONB;
 v_stock RECORD;
 v_transfer_id UUID;
 v_transfer_number TEXT;
 v_prod DATE;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_from FROM inventory_locations WHERE id = p_from_location_id;
 SELECT * INTO v_to FROM inventory_locations WHERE id = p_to_location_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 IF v_from.organization_id != v_to.organization_id THEN
 RAISE EXCEPTION 'Cross-org transfer not allowed';
 END IF;

 v_org_id := v_from.organization_id;

 IF v_from.branch_id IS NOT NULL AND NOT public.has_branch_access(v_from.branch_id) THEN
 RAISE EXCEPTION 'No access to source location';
 END IF;

 v_transfer_number := generate_inv_number('TRF', v_org_id);

 INSERT INTO stock_transfers (
 organization_id, transfer_number, from_location_id, to_location_id,
 status, driver_id, vehicle_id, notes, created_by
 ) VALUES (
 v_org_id, v_transfer_number, p_from_location_id, p_to_location_id,
 'PENDING', p_driver_id, p_vehicle_id, p_notes, v_user_id
 ) RETURNING id INTO v_transfer_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 v_prod := NULLIF(v_item->>'production_date', '')::date;

 IF is_roti_stock_item(v_stock.id) THEN
 IF v_prod IS NULL THEN
 RAISE EXCEPTION 'Tarikh production wajib untuk roti: %', v_stock.name;
 END IF;
 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production roti';
 END IF;
 PERFORM assert_published_production_date(v_org_id, v_prod);
 ELSIF v_prod IS NOT NULL AND NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production';
 END IF;

 INSERT INTO stock_transfer_items (
 transfer_id, stock_item_id, quantity, unit, production_date
 ) VALUES (
 v_transfer_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 v_prod
 );
 END LOOP;

 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, description,
 status, requested_by, branch_id
 ) VALUES (
 v_org_id, 'STOCK_TRANSFER', v_transfer_id,
 'Stock Transfer ' || v_transfer_number,
 v_from.name || ' → ' || v_to.name,
 'PENDING', v_user_id, v_from.branch_id
 );

 RETURN jsonb_build_object(
 'transfer_id', v_transfer_id,
 'transfer_number', v_transfer_number
 );
END;
$$;

-- RLS
ALTER TABLE factory_production_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_production_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_factory_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_factory_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY factory_prod_weeks_select ON factory_production_weeks
 FOR SELECT TO authenticated
 USING (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 );

CREATE POLICY factory_prod_weeks_manage ON factory_production_weeks
 FOR ALL TO authenticated
 USING (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND can_manage_factory_production_schedule()
 )
 WITH CHECK (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND can_manage_factory_production_schedule()
 );

CREATE POLICY factory_prod_days_select ON factory_production_days
 FOR SELECT TO authenticated
 USING (
 EXISTS (
 SELECT 1 FROM factory_production_weeks w
 WHERE w.id = week_id
 AND w.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 )
 );

CREATE POLICY factory_prod_days_manage ON factory_production_days
 FOR ALL TO authenticated
 USING (
 EXISTS (
 SELECT 1 FROM factory_production_weeks w
 WHERE w.id = week_id
 AND w.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND can_manage_factory_production_schedule()
 )
 );

CREATE POLICY hq_factory_orders_select ON hq_factory_orders
 FOR SELECT TO authenticated
 USING (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 );

CREATE POLICY hq_factory_orders_insert ON hq_factory_orders
 FOR INSERT TO authenticated
 WITH CHECK (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND can_set_roti_production_date()
 );

CREATE POLICY hq_factory_orders_update ON hq_factory_orders
 FOR UPDATE TO authenticated
 USING (
 organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND (
 can_manage_factory_production_schedule()
 OR can_set_roti_production_date()
 )
 );

CREATE POLICY hq_factory_order_items_select ON hq_factory_order_items
 FOR SELECT TO authenticated
 USING (
 EXISTS (
 SELECT 1 FROM hq_factory_orders o
 WHERE o.id = order_id
 AND o.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 )
 );

CREATE POLICY hq_factory_order_items_insert ON hq_factory_order_items
 FOR INSERT TO authenticated
 WITH CHECK (
 EXISTS (
 SELECT 1 FROM hq_factory_orders o
 WHERE o.id = order_id
 AND o.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
 AND can_set_roti_production_date()
 )
 );
