-- RKJ One: Fleet management, delivery orders, proof of delivery
-- Migration 00007

-- ============================================================
-- DELIVERY ORDERS (multi-leg: Factory→HQ→Vehicle→Branch)
-- ============================================================

CREATE TABLE delivery_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_number TEXT NOT NULL,
 status transfer_status NOT NULL DEFAULT 'DRAFT',
 origin_location_id UUID NOT NULL REFERENCES inventory_locations(id),
 final_destination_id UUID NOT NULL REFERENCES inventory_locations(id),
 primary_driver_id UUID REFERENCES drivers(id),
 primary_vehicle_id UUID REFERENCES vehicles(id),
 scheduled_date DATE,
 notes TEXT,
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, order_number)
);

CREATE INDEX idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX idx_delivery_orders_driver ON delivery_orders(primary_driver_id);

-- ============================================================
-- DELIVERY LEGS (each hop in the chain)
-- Factory→HQ | HQ→Vehicle | Vehicle→Vehicle | Vehicle→Branch
-- ============================================================

CREATE TABLE delivery_legs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
 leg_sequence INT NOT NULL,
 leg_type delivery_leg_type NOT NULL,
 from_location_id UUID NOT NULL REFERENCES inventory_locations(id),
 to_location_id UUID NOT NULL REFERENCES inventory_locations(id),
 driver_id UUID REFERENCES drivers(id),
 vehicle_id UUID REFERENCES vehicles(id),
 stock_transfer_id UUID REFERENCES stock_transfers(id),
 status transfer_status NOT NULL DEFAULT 'PENDING',
 dispatched_at TIMESTAMPTZ,
 delivered_at TIMESTAMPTZ,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (delivery_order_id, leg_sequence)
);

CREATE INDEX idx_delivery_legs_order ON delivery_legs(delivery_order_id);
CREATE INDEX idx_delivery_legs_driver ON delivery_legs(driver_id);

CREATE TABLE delivery_leg_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 leg_id UUID NOT NULL REFERENCES delivery_legs(id) ON DELETE CASCADE,
 stock_item_id UUID NOT NULL REFERENCES stock_items(id),
 quantity NUMERIC(14, 4) NOT NULL,
 unit stock_unit NOT NULL,
 received_quantity NUMERIC(14, 4),
 notes TEXT
);

-- ============================================================
-- PROOF OF DELIVERY
-- ============================================================

CREATE TABLE proof_of_delivery (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 delivery_leg_id UUID NOT NULL REFERENCES delivery_legs(id),
 delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 receiver_name TEXT,
 receiver_signature_url TEXT,
 driver_id UUID REFERENCES drivers(id),
 driver_notes TEXT,
 gps_latitude DECIMAL(10, 7),
 gps_longitude DECIMAL(10, 7),
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pod_leg ON proof_of_delivery(delivery_leg_id);

-- ============================================================
-- DELIVERY IMAGES (Supabase Storage references)
-- ============================================================

CREATE TABLE delivery_images (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 proof_of_delivery_id UUID NOT NULL REFERENCES proof_of_delivery(id) ON DELETE CASCADE,
 image_url TEXT NOT NULL,
 caption TEXT,
 uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- WAREHOUSE AUDITS (HQ stock audit)
-- ============================================================

CREATE TABLE warehouse_audits (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 audit_number TEXT NOT NULL,
 location_id UUID NOT NULL REFERENCES inventory_locations(id),
 audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
 status approval_status NOT NULL DEFAULT 'PENDING',
 audited_by UUID REFERENCES profiles(id),
 approved_by UUID REFERENCES profiles(id),
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, audit_number)
);

CREATE TABLE warehouse_audit_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 audit_id UUID NOT NULL REFERENCES warehouse_audits(id) ON DELETE CASCADE,
 stock_item_id UUID NOT NULL REFERENCES stock_items(id),
 system_quantity NUMERIC(14, 4) NOT NULL,
 audited_quantity NUMERIC(14, 4) NOT NULL,
 variance NUMERIC(14, 4) GENERATED ALWAYS AS (audited_quantity - system_quantity) STORED,
 unit stock_unit NOT NULL
);

-- ============================================================
-- PRODUCTION OUTPUT (factory tracking)
-- ============================================================

CREATE TABLE production_output (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 output_date DATE NOT NULL DEFAULT CURRENT_DATE,
 product_id UUID REFERENCES products(id),
 stock_item_id UUID REFERENCES stock_items(id),
 quantity NUMERIC(14, 4) NOT NULL,
 unit stock_unit NOT NULL,
 location_id UUID NOT NULL REFERENCES inventory_locations(id),
 notes TEXT,
 recorded_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_output_date ON production_output(output_date DESC);

-- ============================================================
-- FLEET STATUS LOG
-- ============================================================

CREATE TABLE fleet_status_log (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 vehicle_id UUID NOT NULL REFERENCES vehicles(id),
 driver_id UUID REFERENCES drivers(id),
 status TEXT NOT NULL,
 location_description TEXT,
 gps_latitude DECIMAL(10, 7),
 gps_longitude DECIMAL(10, 7),
 logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 notes TEXT
);

CREATE INDEX idx_fleet_status_vehicle ON fleet_status_log(vehicle_id);
CREATE INDEX idx_fleet_status_logged ON fleet_status_log(logged_at DESC);
