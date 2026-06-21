export interface SettingsUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  branch_id: string | null;
  region_id: string | null;
  branch: { branch_name: string; branch_code: string } | null;
  region?: { name: string; code?: string } | null;
  status: string;
}

export interface SettingsProduct {
  id: string;
  sku: string;
  name: string;
  selling_price: number;
  status: string;
  category?: string | null;
}

export interface SettingsBranch {
  id: string;
  branch_code: string;
  branch_name: string;
  region: { id?: string; name: string; manager_name?: string | null } | null;
  status: string;
  area?: string | null;
  region_id?: string;
}

export interface SettingsBranchGroup {
  region_id: string;
  region_code: string;
  region_name: string;
  manager_name: string | null;
  branches: Array<{
    id: string;
    branch_code: string;
    branch_name: string;
    status: string;
    area: string | null;
  }>;
}

export interface SettingsRegion {
  id: string;
  code: string;
  name: string;
  manager_name: string | null;
  status: string;
}

export interface SettingsStockItem {
  id: string;
  item_code: string;
  name: string;
  min_threshold: number | null;
  critical_threshold: number | null;
  status: string;
  category?: string | null;
}

export interface SettingsStockPlanning {
  stock_coverage_days: number;
  safety_buffer_pcs: number;
  updated_at: string | null;
}

export interface SettingsUpcomingHoliday {
  holiday_date: string;
  name: string;
  holiday_type: string;
  demand_multiplier: number;
}
