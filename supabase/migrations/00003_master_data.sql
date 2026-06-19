-- RKJ One: Products, stock items, BOM, shift templates, payroll & commission rules
-- Migration 00003

-- ============================================================
-- PRODUCTS (POS menu)
-- ============================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sale_unit TEXT,
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);

CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);

-- ============================================================
-- STOCK ITEMS (raw materials / packaging)
-- ============================================================

CREATE TABLE stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  base_unit stock_unit NOT NULL DEFAULT 'PCS',
  storage_unit TEXT,
  conversion_text TEXT,
  -- Conversion: e.g. 1 bag = 20 pcs
  pack_quantity NUMERIC(12, 4),
  pack_unit stock_unit,
  min_threshold NUMERIC(12, 4),
  critical_threshold NUMERIC(12, 4),
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, item_code)
);

CREATE INDEX idx_stock_items_org ON stock_items(organization_id);

-- ============================================================
-- PRODUCT BOM (Bill of Materials — admin editable formulas)
-- ============================================================

CREATE TABLE product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(12, 4) NOT NULL,
  unit stock_unit NOT NULL,
  min_qty NUMERIC(12, 4),
  max_qty NUMERIC(12, 4),
  auto_deduct BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, stock_item_id)
);

CREATE INDEX idx_product_bom_product ON product_bom(product_id);

-- ============================================================
-- SHIFT TEMPLATES
-- ============================================================

CREATE TABLE shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TIME,
  end_time TIME,
  default_hours NUMERIC(4, 2),
  crosses_midnight BOOLEAN NOT NULL DEFAULT false,
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_code)
);

-- ============================================================
-- PAYROLL RULES (admin editable)
-- ============================================================

CREATE TABLE payroll_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  worker_type worker_type NOT NULL,
  component TEXT NOT NULL,
  rate NUMERIC(10, 2),
  period payroll_period NOT NULL,
  shift_hours INT, -- for foreign worker tier matching (8, 9, 12, 16)
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rule_code)
);

-- ============================================================
-- COMMISSION TIERS (admin editable)
-- ============================================================

CREATE TABLE commission_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier_from NUMERIC(12, 2) NOT NULL,
  tier_to NUMERIC(12, 2), -- NULL = unlimited
  commission_amount NUMERIC(10, 2) NOT NULL,
  formula_description TEXT,
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commission_tiers_org ON commission_tiers(organization_id);

-- ============================================================
-- FINANCE FLOW CONFIG (reference for collection types)
-- ============================================================

CREATE TABLE finance_flow_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flow_code TEXT NOT NULL,
  collection_type collection_type NOT NULL,
  from_entity TEXT NOT NULL,
  to_entity TEXT NOT NULL,
  collector_role TEXT,
  auto_recorded BOOLEAN NOT NULL DEFAULT false,
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, flow_code)
);
