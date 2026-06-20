import type { OfflineSalePayload } from './types';

const QUEUE_KEY = 'rkj-pos-offline-queue';

export function getOfflineQueue(): OfflineSalePayload[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineSalePayload[]) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineSalePayload[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOfflineSale(sale: OfflineSalePayload): void {
  const queue = getOfflineQueue();
  queue.push(sale);
  saveOfflineQueue(queue);
}

export function removeOfflineSale(offlineId: string): void {
  const queue = getOfflineQueue().filter((s) => s.offlineId !== offlineId);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(QUEUE_KEY);
}
