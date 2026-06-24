-- Platform Ejen Jualan — RKJ Distributor Sdn Bhd
-- Order stok ikut jadual kilang · bayaran online · langganan POS RM150/cawangan
-- Migration 00077 (role SALES_AGENT ditambah dalam 00076)

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE agent_account_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_outlet_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_order_status AS ENUM (
    'DRAFT', 'PENDING_PAYMENT', 'PAID', 'SUBMITTED_FACTORY', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_payment_purpose AS ENUM ('STOCK_ORDER', 'POS_SUBSCRIPTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE online_payment_method AS ENUM ('CARD', 'DEBIT', 'FPX');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- AKAUN EJEN
-- ============================================================

CREATE TABLE sales_agent_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  registration_no TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  business_address TEXT,
  status agent_account_status NOT NULL DEFAULT 'PENDING',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX idx_sales_agent_accounts_org ON sales_agent_accounts(organization_id);
CREATE INDEX idx_sales_agent_accounts_status ON sales_agent_accounts(status);

-- ============================================================
-- CAWANGAN EJEN (POS langganan)
-- ============================================================

CREATE TABLE agent_outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_account_id UUID NOT NULL REFERENCES sales_agent_accounts(id) ON DELETE CASCADE,
  outlet_code TEXT NOT NULL,
  outlet_name TEXT NOT NULL,
  address_line TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  pos_enabled BOOLEAN NOT NULL DEFAULT false,
  subscription_active BOOLEAN NOT NULL DEFAULT false,
  status agent_outlet_status NOT NULL DEFAULT 'PENDING',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_account_id, outlet_code)
);

CREATE INDEX idx_agent_outlets_agent ON agent_outlets(agent_account_id);

CREATE TABLE agent_outlet_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES agent_outlets(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount_rm NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
  payment_id UUID,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, period_start)
);

CREATE INDEX idx_agent_outlet_subs_outlet ON agent_outlet_subscriptions(outlet_id);

-- ============================================================
-- PEMBAYARAN ONLINE
-- ============================================================

CREATE TABLE agent_online_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_account_id UUID NOT NULL REFERENCES sales_agent_accounts(id) ON DELETE CASCADE,
  purpose agent_payment_purpose NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  amount_rm NUMERIC(12, 2) NOT NULL CHECK (amount_rm > 0),
  payment_method online_payment_method NOT NULL,
  status agent_payment_status NOT NULL DEFAULT 'PENDING',
  gateway_ref TEXT,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_payments_agent ON agent_online_payments(agent_account_id);
CREATE INDEX idx_agent_payments_ref ON agent_online_payments(reference_type, reference_id);

-- ============================================================
-- ORDER STOK EJEN → KILANG
-- ============================================================

CREATE TABLE agent_stock_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_account_id UUID NOT NULL REFERENCES sales_agent_accounts(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  production_date DATE NOT NULL,
  status agent_order_status NOT NULL DEFAULT 'DRAFT',
  total_amount_rm NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  payment_id UUID REFERENCES agent_online_payments(id),
  factory_order_id UUID,
  submitted_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, order_number)
);

CREATE INDEX idx_agent_stock_orders_agent ON agent_stock_orders(agent_account_id);
CREATE INDEX idx_agent_stock_orders_date ON agent_stock_orders(production_date DESC);

CREATE TABLE agent_stock_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES agent_stock_orders(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit stock_unit NOT NULL,
  unit_price_rm NUMERIC(10, 2) NOT NULL DEFAULT 0,
  line_total_rm NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, stock_item_id)
);

-- Antrian kilang (selepas bayaran penuh)
CREATE TABLE factory_agent_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_order_id UUID NOT NULL REFERENCES agent_stock_orders(id) ON DELETE CASCADE,
  agent_account_id UUID NOT NULL REFERENCES sales_agent_accounts(id),
  production_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
    status IN ('SUBMITTED', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED')
  ),
  company_name TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_order_id)
);

CREATE TABLE factory_agent_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_agent_order_id UUID NOT NULL REFERENCES factory_agent_orders(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit stock_unit NOT NULL,
  UNIQUE (factory_agent_order_id, stock_item_id)
);

-- ============================================================
-- HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION next_agent_order_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE v_next INT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(order_number, 'AO-([0-9]+)$'))[1]::INT), 0) + 1
  INTO v_next FROM agent_stock_orders WHERE organization_id = p_org_id;
  RETURN 'AO-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION agent_outlet_has_active_subscription(p_outlet_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agent_outlet_subscriptions s
    JOIN agent_outlets o ON o.id = s.outlet_id
    WHERE s.outlet_id = p_outlet_id
      AND s.status = 'ACTIVE'
      AND CURRENT_DATE BETWEEN s.period_start AND s.period_end
      AND o.subscription_active = true
      AND o.pos_enabled = true
  );
$$;

-- ============================================================
-- RPC: Sahkan bayaran & hantar order ke kilang
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_agent_payment_and_fulfill(
  p_payment_id UUID,
  p_gateway_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay agent_online_payments%ROWTYPE;
  v_order agent_stock_orders%ROWTYPE;
  v_sub agent_outlet_subscriptions%ROWTYPE;
  v_outlet agent_outlets%ROWTYPE;
  v_agent sales_agent_accounts%ROWTYPE;
  v_factory_id UUID;
BEGIN
  SELECT * INTO v_pay FROM agent_online_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembayaran tidak dijumpai';
  END IF;
  IF v_pay.status = 'PAID' THEN
    RETURN jsonb_build_object('ok', true, 'already_paid', true);
  END IF;

  UPDATE agent_online_payments SET
    status = 'PAID',
    paid_at = now(),
    gateway_ref = COALESCE(p_gateway_ref, gateway_ref),
    updated_at = now()
  WHERE id = p_payment_id;

  IF v_pay.purpose = 'STOCK_ORDER' THEN
    SELECT * INTO v_order FROM agent_stock_orders WHERE id = v_pay.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order stok tidak dijumpai'; END IF;

    IF NOT is_factory_order_window_open(v_order.organization_id, v_order.production_date) THEN
      RAISE EXCEPTION 'Tempoh order kilang untuk tarikh % sudah tutup', v_order.production_date;
    END IF;

    UPDATE agent_stock_orders SET
      status = 'SUBMITTED_FACTORY',
      payment_id = p_payment_id,
      submitted_at = now(),
      updated_at = now()
    WHERE id = v_order.id;

    SELECT * INTO v_agent FROM sales_agent_accounts WHERE id = v_order.agent_account_id;

    INSERT INTO factory_agent_orders (
      organization_id, agent_order_id, agent_account_id, production_date,
      company_name, status
    ) VALUES (
      v_order.organization_id, v_order.id, v_order.agent_account_id,
      v_order.production_date, v_agent.company_name, 'SUBMITTED'
    )
    RETURNING id INTO v_factory_id;

    INSERT INTO factory_agent_order_items (factory_agent_order_id, stock_item_id, quantity, unit)
    SELECT v_factory_id, i.stock_item_id, i.quantity, i.unit
    FROM agent_stock_order_items i WHERE i.order_id = v_order.id;

    UPDATE agent_stock_orders SET factory_order_id = v_factory_id WHERE id = v_order.id;

    RETURN jsonb_build_object('ok', true, 'purpose', 'STOCK_ORDER', 'factory_order_id', v_factory_id);

  ELSIF v_pay.purpose = 'POS_SUBSCRIPTION' THEN
    SELECT * INTO v_sub FROM agent_outlet_subscriptions WHERE id = v_pay.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Langganan tidak dijumpai'; END IF;

    UPDATE agent_outlet_subscriptions SET
      status = 'ACTIVE',
      payment_id = p_payment_id
    WHERE id = v_sub.id;

    UPDATE agent_outlets SET
      subscription_active = true,
      pos_enabled = true,
      status = 'ACTIVE',
      updated_at = now()
    WHERE id = v_sub.outlet_id;

    RETURN jsonb_build_object('ok', true, 'purpose', 'POS_SUBSCRIPTION', 'outlet_id', v_sub.outlet_id);
  END IF;

  RAISE EXCEPTION 'Tujuan pembayaran tidak disokong';
END;
$$;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE sales_agent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outlet_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_online_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_stock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_stock_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_agent_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_agent_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_agent_accounts_select ON sales_agent_accounts FOR SELECT USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'FINANCE')
    OR profile_id = auth.uid()
  )
);

CREATE POLICY sales_agent_accounts_insert ON sales_agent_accounts FOR INSERT WITH CHECK (
  organization_id = public.organization_id()
  AND (public.user_role() IN ('SUPER_ADMIN', 'ADMIN') OR profile_id = auth.uid())
);

CREATE POLICY sales_agent_accounts_update ON sales_agent_accounts FOR UPDATE USING (
  organization_id = public.organization_id()
  AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
);

CREATE POLICY agent_outlets_agent ON agent_outlets FOR ALL USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
    OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
  )
);

CREATE POLICY agent_orders_agent ON agent_stock_orders FOR ALL USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY')
    OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
  )
);

CREATE POLICY agent_order_items_via_order ON agent_stock_order_items FOR ALL USING (
  order_id IN (
    SELECT id FROM agent_stock_orders WHERE organization_id = public.organization_id()
  )
);

CREATE POLICY agent_payments_agent ON agent_online_payments FOR SELECT USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
    OR agent_account_id IN (SELECT id FROM sales_agent_accounts WHERE profile_id = auth.uid())
  )
);

CREATE POLICY factory_agent_orders_read ON factory_agent_orders FOR SELECT USING (
  organization_id = public.organization_id()
  AND public.user_role() IN (
    'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'CEO_FACTORY',
    'SALES_AGENT'
  )
);

CREATE POLICY factory_agent_items_read ON factory_agent_order_items FOR SELECT USING (
  factory_agent_order_id IN (
    SELECT id FROM factory_agent_orders WHERE organization_id = public.organization_id()
  )
);

-- ============================================================
-- PERMISSIONS
-- ============================================================

INSERT INTO role_permissions (organization_id, role, module, permission)
SELECT o.id, v.role::user_role, v.module, v.permission::permission_level
FROM organizations o
CROSS JOIN (VALUES
  ('SUPER_ADMIN', 'sales_agent', 'FULL'),
  ('ADMIN', 'sales_agent', 'FULL'),
  ('OPERATION_MANAGER', 'sales_agent', 'FULL'),
  ('FINANCE', 'sales_agent', 'VIEW'),
  ('CEO_FACTORY', 'sales_agent', 'VIEW'),
  ('SALES_AGENT', 'sales_agent', 'FULL_OWN'),
  ('SALES_AGENT', 'pos', 'FULL_OWN')
) AS v(role, module, permission)
WHERE o.code = 'RKJ'
ON CONFLICT (organization_id, role, module) DO UPDATE SET
  permission = EXCLUDED.permission,
  updated_at = now();
