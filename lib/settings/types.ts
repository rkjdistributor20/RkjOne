export interface SettingsUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  branch: { branch_name: string } | null;
  status: string;
}

export interface SettingsProduct {
  id: string;
  sku: string;
  name: string;
  selling_price: number;
  status: string;
}

export interface SettingsBranch {
  id: string;
  branch_code: string;
  branch_name: string;
  region: { name: string } | null;
  status: string;
}

export interface SettingsStockItem {
  id: string;
  item_code: string;
  name: string;
  min_threshold: number | null;
  critical_threshold: number | null;
  status: string;
}
