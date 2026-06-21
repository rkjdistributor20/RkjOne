import type {
  SettingsBranch,
  SettingsBranchGroup,
  SettingsProduct,
  SettingsRegion,
  SettingsStockItem,
  SettingsUser,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export async function fetchSettingsUsers() {
  return fetchJson<{ users: SettingsUser[]; total: number }>('/api/settings/users');
}

export async function fetchSettingsProducts() {
  return fetchJson<{ products: SettingsProduct[] }>('/api/settings/products');
}

export async function fetchSettingsBranches() {
  return fetchJson<{ branches: SettingsBranch[] }>('/api/settings/branches');
}

export async function fetchSettingsBranchesGrouped() {
  return fetchJson<{ groups: SettingsBranchGroup[] }>(
    '/api/settings/branches?grouped=1'
  );
}

export async function fetchSettingsRegions() {
  return fetchJson<{ regions: SettingsRegion[] }>('/api/settings/regions');
}

export async function fetchSettingsStockItems() {
  return fetchJson<{ items: SettingsStockItem[] }>('/api/settings/stock-items');
}

export async function updateStockThresholds(
  itemId: string,
  min: number | null,
  critical: number | null
) {
  return fetchJson<{ result: unknown }>(`/api/settings/stock-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ min_threshold: min, critical_threshold: critical }),
  });
}

export async function createProduct(payload: {
  sku: string;
  name: string;
  price: number;
  category?: string;
}) {
  return fetchJson<{ product: SettingsProduct }>('/api/settings/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteProduct(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/products/${id}`, {
    method: 'DELETE',
  });
}

export async function createStockItem(payload: {
  item_code: string;
  name: string;
  category?: string;
  base_unit?: string;
}) {
  return fetchJson<{ item: SettingsStockItem }>('/api/settings/stock-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteStockItem(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/stock-items/${id}`, {
    method: 'DELETE',
  });
}

export async function createBranch(payload: {
  region_id: string;
  branch_code: string;
  branch_name: string;
  area?: string;
}) {
  return fetchJson<{ result: unknown }>('/api/settings/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBranch(
  id: string,
  payload: { status?: 'ACTIVE' | 'INACTIVE'; branch_name?: string }
) {
  return fetchJson<{ branch: SettingsBranch }>(`/api/settings/branches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteBranch(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/branches/${id}`, {
    method: 'DELETE',
  });
}

export async function createUser(payload: {
  email: string;
  full_name: string;
  role: string;
  branch_id?: string;
  region_id?: string;
}) {
  return fetchJson<{ user: SettingsUser }>('/api/settings/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/users/${id}`, {
    method: 'DELETE',
  });
}

export async function createStaffMember(payload: {
  staff_code: string;
  full_name: string;
  branch_id: string;
  worker_type: 'LOCAL' | 'FOREIGN';
  shift_hours?: number;
  shifts_per_week?: number;
}) {
  return fetchJson<{ staff: unknown }>('/api/settings/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteStaffMember(id: string) {
  return fetchJson<{ result: unknown }>(`/api/settings/staff/${id}`, {
    method: 'DELETE',
  });
}
