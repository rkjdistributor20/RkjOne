-- Agent official data import support: price groups and driver routes
-- Migration 00082

ALTER TABLE sales_agent_accounts
 ADD COLUMN IF NOT EXISTS assigned_price_group_id UUID,
 ADD COLUMN IF NOT EXISTS source_reference TEXT,
 ADD COLUMN IF NOT EXISTS assigned_driver_name TEXT,
 ADD COLUMN IF NOT EXISTS pickup_location TEXT;

CREATE TABLE IF NOT EXISTS agent_price_groups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 is_default BOOLEAN NOT NULL DEFAULT false,
 status entity_status NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS agent_price_group_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 price_group_id UUID NOT NULL REFERENCES agent_price_groups(id) ON DELETE CASCADE,
 stock_item_id UUID NOT NULL REFERENCES stock_items(id),
 item_label TEXT NOT NULL,
 package_description TEXT,
 unit_price_rm NUMERIC(10, 2) NOT NULL CHECK (unit_price_rm >= 0),
 status entity_status NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (price_group_id, stock_item_id)
);

CREATE TABLE IF NOT EXISTS agent_driver_routes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
 route_code TEXT NOT NULL,
 driver_name TEXT NOT NULL,
 assistant_name TEXT,
 collect_from TEXT,
 sequence_no INT NOT NULL DEFAULT 0,
 location_name TEXT NOT NULL,
 location_type TEXT NOT NULL DEFAULT 'DELIVERY_POINT',
 notes TEXT,
 status entity_status NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, route_code, sequence_no, location_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_price_groups_org ON agent_price_groups(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_price_items_group ON agent_price_group_items(price_group_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_driver_routes_org ON agent_driver_routes(organization_id, driver_name);

DO $$ BEGIN
 ALTER TABLE sales_agent_accounts
 ADD CONSTRAINT sales_agent_accounts_price_group_fkey
 FOREIGN KEY (assigned_price_group_id) REFERENCES agent_price_groups(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE agent_price_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_price_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_driver_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_price_groups_read ON agent_price_groups;
CREATE POLICY agent_price_groups_read ON agent_price_groups FOR SELECT USING (
 organization_id = public.organization_id()
);

DROP POLICY IF EXISTS agent_price_groups_admin ON agent_price_groups;
CREATE POLICY agent_price_groups_admin ON agent_price_groups FOR ALL USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
) WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
);

DROP POLICY IF EXISTS agent_price_group_items_read ON agent_price_group_items;
CREATE POLICY agent_price_group_items_read ON agent_price_group_items FOR SELECT USING (
 organization_id = public.organization_id()
);

DROP POLICY IF EXISTS agent_price_group_items_admin ON agent_price_group_items;
CREATE POLICY agent_price_group_items_admin ON agent_price_group_items FOR ALL USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
) WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
);

DROP POLICY IF EXISTS agent_driver_routes_read ON agent_driver_routes;
CREATE POLICY agent_driver_routes_read ON agent_driver_routes FOR SELECT USING (
 organization_id = public.organization_id()
);

DROP POLICY IF EXISTS agent_driver_routes_admin ON agent_driver_routes;
CREATE POLICY agent_driver_routes_admin ON agent_driver_routes FOR ALL USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
) WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
);

COMMENT ON TABLE agent_price_groups IS 'Group rate harga produk ejen bawah RKJ Distributor Sdn Bhd';
COMMENT ON TABLE agent_driver_routes IS 'Laluan driver untuk penghantaran ejen dan cawangan berdasarkan Driver Road PDF';
