-- RKJ One: Inventory locations, balances, movements, transfers
-- Migration 00004

-- ============================================================
-- INVENTORY LOCATIONS
-- Factory | HQ Warehouse | Fleet Vehicle | Branch Kiosk
-- ============================================================

CREATE TABLE inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_type location_type NOT NULL,
  name TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id),
  vehicle_id UUID REFERENCES vehicles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_location_ref CHECK (
    (location_type = 'BRANCH_KIOSK' AND branch_id IS NOT NULL) OR
    (location_type = 'FLEET_VEHICLE' AND vehicle_id IS NOT NULL) OR
    (location_type IN ('FACTORY', 'HQ_WAREHOUSE'))
  )
);

CREATE INDEX idx_inv_locations_org ON inventory_locations(organization_id);
CREATE INDEX idx_inv_locations_type ON inventory_locations(location_type);
CREATE UNIQUE INDEX idx_inv_locations_branch ON inventory_locations(branch_id) WHERE branch_id IS NOT NULL;
CREATE UNIQUE INDEX idx_inv_locations_vehicle ON inventory_locations(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ============================================================
-- INVENTORY BALANCES (current stock per location)
-- ============================================================

CREATE TABLE inventory_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit stock_unit NOT NULL,
  last_movement_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, stock_item_id)
);

CREATE INDEX idx_inv_balances_location ON inventory_balances(location_id);
CREATE INDEX idx_inv_balances_item ON inventory_balances(stock_item_id);

-- ============================================================
-- STOCK MOVEMENTS (audit trail)
-- ============================================================

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  movement_type movement_type NOT NULL,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL,
  unit stock_unit NOT NULL,
  balance_before NUMERIC(14, 4),
  balance_after NUMERIC(14, 4),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_org ON stock_movements(organization_id);
CREATE INDEX idx_stock_movements_location ON stock_movements(location_id);
CREATE INDEX idx_stock_movements_item ON stock_movements(stock_item_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_ref ON stock_movements(reference_type, reference_id);

-- ============================================================
-- STOCK TRANSFERS (header)
-- ============================================================

CREATE TABLE stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_number TEXT NOT NULL,
  from_location_id UUID NOT NULL REFERENCES inventory_locations(id),
  to_location_id UUID NOT NULL REFERENCES inventory_locations(id),
  status transfer_status NOT NULL DEFAULT 'DRAFT',
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  scheduled_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transfer_number)
);

CREATE INDEX idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX idx_stock_transfers_from ON stock_transfers(from_location_id);
CREATE INDEX idx_stock_transfers_to ON stock_transfers(to_location_id);

CREATE TABLE stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL,
  unit stock_unit NOT NULL,
  received_quantity NUMERIC(14, 4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- STOCK ADJUSTMENTS
-- ============================================================

CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  adjustment_number TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  reason TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'PENDING',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, adjustment_number)
);

CREATE TABLE stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity_before NUMERIC(14, 4) NOT NULL,
  quantity_after NUMERIC(14, 4) NOT NULL,
  unit stock_unit NOT NULL,
  notes TEXT
);

-- ============================================================
-- STOCK COUNTS (physical audit)
-- ============================================================

CREATE TABLE stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  count_number TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status approval_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  counted_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, count_number)
);

CREATE TABLE stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  system_quantity NUMERIC(14, 4) NOT NULL,
  counted_quantity NUMERIC(14, 4) NOT NULL,
  variance NUMERIC(14, 4) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  unit stock_unit NOT NULL,
  notes TEXT
);

-- ============================================================
-- STOCK WRITE-OFFS
-- ============================================================

CREATE TABLE stock_write_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  write_off_number TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  reason TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'PENDING',
  approved_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, write_off_number)
);

CREATE TABLE stock_write_off_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  write_off_id UUID NOT NULL REFERENCES stock_write_offs(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL,
  unit stock_unit NOT NULL,
  notes TEXT
);

-- ============================================================
-- STOCK RECEIVES (factory → HQ, external)
-- ============================================================

CREATE TABLE stock_receives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receive_number TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  source TEXT NOT NULL DEFAULT 'FACTORY',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  received_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, receive_number)
);

CREATE TABLE stock_receive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receive_id UUID NOT NULL REFERENCES stock_receives(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(14, 4) NOT NULL,
  unit stock_unit NOT NULL
);
