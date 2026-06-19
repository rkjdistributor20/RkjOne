export function formatRM(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

export function generateOfflineId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'rkj-pos-device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `device-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}
