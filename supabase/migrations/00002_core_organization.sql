-- RKJ One: Core organization, regions, branches, profiles, RBAC
-- Migration 00002

-- ============================================================
-- ORGANIZATION (multi-tenant root)
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hq_address TEXT,
  hq_city TEXT DEFAULT 'Teluk Intan',
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- REGIONS
-- ============================================================

CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code region_code NOT NULL,
  name TEXT NOT NULL,
  manager_name TEXT,
  manager_profile_id UUID, -- FK added after profiles
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

-- ============================================================
-- BRANCHES (36 kiosks)
-- ============================================================

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES regions(id),
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  area TEXT,
  manager_name TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_code)
);

CREATE INDEX idx_branches_org ON branches(organization_id);
CREATE INDEX idx_branches_region ON branches(region_id);
CREATE INDEX idx_branches_status ON branches(status);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_code TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'STAFF',
  region_id UUID REFERENCES regions(id),
  branch_id UUID REFERENCES branches(id),
  avatar_url TEXT,
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_code)
);

CREATE INDEX idx_profiles_org ON profiles(organization_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_branch ON profiles(branch_id);
CREATE INDEX idx_profiles_region ON profiles(region_id);

ALTER TABLE regions
  ADD CONSTRAINT fk_regions_manager
  FOREIGN KEY (manager_profile_id) REFERENCES profiles(id);

-- Branch access for users with multi-branch scope
CREATE TABLE profile_branch_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, branch_id)
);

-- ============================================================
-- RBAC: Role permissions matrix
-- ============================================================

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  module TEXT NOT NULL,
  permission permission_level NOT NULL DEFAULT 'NONE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role, module)
);

-- Modules: pos, shift, stock_kiosk, stock_hq, fleet, payroll, finance, reports, user_management, approval

-- ============================================================
-- STAFF master
-- ============================================================

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id),
  region_id UUID REFERENCES regions(id),
  worker_type worker_type,
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  weekly_amount NUMERIC(10, 2),
  profile_id UUID REFERENCES profiles(id),
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  on_hold BOOLEAN NOT NULL DEFAULT false,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, staff_code)
);

CREATE INDEX idx_staff_branch ON staff(branch_id);
CREATE INDEX idx_staff_org ON staff(organization_id);

-- ============================================================
-- DRIVERS
-- ============================================================

CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  route_description TEXT,
  phone TEXT,
  profile_id UUID REFERENCES profiles(id),
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, driver_code)
);

-- ============================================================
-- VEHICLES
-- ============================================================

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_code TEXT NOT NULL,
  plate_number TEXT,
  vehicle_type TEXT NOT NULL,
  capacity TEXT,
  default_driver_id UUID REFERENCES drivers(id),
  status entity_status NOT NULL DEFAULT 'ACTIVE',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vehicle_code)
);

CREATE INDEX idx_vehicles_driver ON vehicles(default_driver_id);

-- Driver-vehicle assignments (historical)
CREATE TABLE driver_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
