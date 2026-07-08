import type { SystemHealthSnapshot } from "@/lib/system/health";
import type {
  SettingsBranch,
  SettingsBranchGroup,
  SettingsProduct,
  SettingsRegion,
  SettingsStockItem,
  SettingsStockPlanning,
  SettingsUpcomingHoliday,
  SettingsUser,
} from "./types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function fetchSettingsUsers() {
  return fetchJson<{
    users: SettingsUser[];
    total: number;
    staff_total?: number;
    login_total?: number;
  }>("/api/settings/users");
}

export async function fetchSettingsProducts() {
  return fetchJson<{ products: SettingsProduct[] }>("/api/settings/products");
}

export async function fetchSettingsBranches() {
  return fetchJson<{ branches: SettingsBranch[] }>("/api/settings/branches");
}

export async function fetchSettingsBranchesGrouped() {
  return fetchJson<{ groups: SettingsBranchGroup[] }>(
    "/api/settings/branches?grouped=1",
  );
}

export async function fetchSettingsRegions() {
  return fetchJson<{ regions: SettingsRegion[] }>("/api/settings/regions");
}

export async function fetchSettingsStockItems() {
  return fetchJson<{ items: SettingsStockItem[] }>("/api/settings/stock-items");
}

export async function fetchStockPlanningSettings() {
  return fetchJson<{
    settings: SettingsStockPlanning;
    upcoming_holidays: SettingsUpcomingHoliday[];
    can_edit: boolean;
  }>("/api/settings/stock-planning");
}

export async function fetchSystemHealth() {
  return fetchJson<{ snapshot: SystemHealthSnapshot }>("/api/system/health");
}

export async function updateStockPlanningSettings(payload: {
  stock_coverage_days?: number;
  safety_buffer_pcs?: number;
}) {
  return fetchJson<{ settings: SettingsStockPlanning }>(
    "/api/settings/stock-planning",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateStockThresholds(
  itemId: string,
  min: number | null,
  critical: number | null,
) {
  return fetchJson<{ result: unknown }>(`/api/settings/stock-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ min_threshold: min, critical_threshold: critical }),
  });
}

export async function createProduct(payload: {
  sku: string;
  name: string;
  price: number;
  category?: string;
  sale_unit?: string;
  status?: string;
  sort_order?: number;
  notes?: string | null;
}) {
  return fetchJson<{ product: SettingsProduct }>("/api/settings/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProduct(
  id: string,
  payload: {
    sku?: string;
    name?: string;
    price?: number;
    category?: string | null;
    sale_unit?: string | null;
    status?: string;
    sort_order?: number;
    notes?: string | null;
  },
) {
  return fetchJson<{ product: SettingsProduct }>(
    `/api/settings/products/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteProduct(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/products/${id}`, {
    method: "DELETE",
  });
}

export async function createStockItem(payload: {
  item_code: string;
  name: string;
  category?: string;
  base_unit?: string;
}) {
  return fetchJson<{ item: SettingsStockItem }>("/api/settings/stock-items", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteStockItem(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/stock-items/${id}`, {
    method: "DELETE",
  });
}

export async function createBranch(payload: {
  region_id: string;
  branch_code: string;
  branch_name: string;
  area?: string;
  manager_name?: string;
}) {
  return fetchJson<{ result: unknown }>("/api/settings/branches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBranch(
  id: string,
  payload: {
    status?: "ACTIVE" | "INACTIVE";
    branch_name?: string;
    area?: string | null;
    manager_name?: string | null;
    region_id?: string;
  },
) {
  return fetchJson<{ branch: SettingsBranch }>(`/api/settings/branches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteBranch(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/branches/${id}`, {
    method: "DELETE",
  });
}

export async function createUser(payload: {
  email: string;
  full_name: string;
  role: string;
  branch_id?: string;
  region_id?: string;
}) {
  return fetchJson<{ user: SettingsUser; temporary_password?: string | null }>(
    "/api/settings/users",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateUser(
  id: string,
  payload: {
    full_name?: string;
    role?: string;
    status?: string;
    branch_id?: string | null;
    region_id?: string | null;
    auto_dashboard?: boolean;
    dashboard_profile?: string;
    dashboard_label?: string;
    dashboard_home?: string;
    dashboard_ai_reason?: string;
  },
) {
  return fetchJson<{ user: SettingsUser }>(`/api/settings/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchDashboardAdvice(userId?: string) {
  const q = userId ? `?user_id=${userId}` : "";
  return fetchJson<{
    count: number;
    results: Array<{
      user_id: string;
      full_name: string;
      role: string;
      advice: {
        profile_id: string;
        label: string;
        home_path: string;
        module_labels: string[];
        reason: string;
        companies: string[];
      };
    }>;
  }>(`/api/settings/users/dashboard-advice${q}`);
}

export async function applyDashboardAdviceAll() {
  return fetchJson<{ count: number; applied: boolean; results: unknown[] }>(
    "/api/settings/users/dashboard-advice",
    {
      method: "POST",
      body: JSON.stringify({ apply: true }),
    },
  );
}

export async function deleteUser(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/users/${id}`, {
    method: "DELETE",
  });
}

export async function createStaffMember(payload: {
  staff_code: string;
  full_name: string;
  branch_id?: string | null;
  role?: string;
  phone?: string | null;
  ic_number?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  job_title?: string | null;
  department?: string | null;
  employment_start_date?: string | null;
  work_scope?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  remarks?: string | null;
  worker_type: "LOCAL" | "FOREIGN";
  shift_hours?: number;
  shifts_per_week?: number;
  monthly_amount?: number;
  weekly_amount?: number;
  legal_entity_code?: string;
}) {
  return fetchJson<{
    staff: unknown;
    portal?: { login_email: string; portal_password: string };
    message?: string;
  }>("/api/settings/staff", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type StaffDetailResponse = {
  staff: {
    id: string;
    staff_code: string;
    full_name: string;
    status: string;
    branch_id: string | null;
    worker_type: "LOCAL" | "FOREIGN" | null;
    weekly_amount: number | null;
    monthly_amount: number | null;
    shift_hours: number | null;
    shifts_per_week: number | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    remarks: string | null;
    on_hold: boolean;
    profile_id: string | null;
    branch?: { branch_code: string; branch_name: string };
    legal_entity?: {
      code: string;
      name: string;
      legal_name: string;
      scope: string | null;
    } | null;
  };
  portal: {
    login_email: string;
    portal_password: string;
    updated_at?: string;
  } | null;
  login: {
    must_change_password: boolean;
    last_login_at: string | null;
    status: string;
  } | null;
};

export async function fetchStaffDetail(id: string) {
  return fetchJson<StaffDetailResponse>(`/api/settings/staff/${id}`);
}

export async function updateStaffMember(
  id: string,
  payload: Record<string, unknown>,
) {
  return fetchJson<{
    staff: unknown;
    portal?: { login_email: string; portal_password: string };
  }>(`/api/settings/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function resetStaffPortalPassword(id: string) {
  return fetchJson<{
    portal: { login_email: string; portal_password: string };
    message: string;
  }>(`/api/settings/staff/${id}/reset-password`, { method: "POST" });
}

export async function deleteStaffMember(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/staff/${id}`, {
    method: "DELETE",
  });
}
