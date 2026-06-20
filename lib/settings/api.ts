import type {
  SettingsBranch,
  SettingsProduct,
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
  return fetchJson<{ users: SettingsUser[] }>('/api/settings/users');
}

export async function fetchSettingsProducts() {
  return fetchJson<{ products: SettingsProduct[] }>('/api/settings/products');
}

export async function fetchSettingsBranches() {
  return fetchJson<{ branches: SettingsBranch[] }>('/api/settings/branches');
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
