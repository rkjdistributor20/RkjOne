/** Roti: shelf life 5 hari dari tarikh production */
export const ROTI_SHELF_LIFE_DAYS = 5;

export interface RotiBatchAtLocation {
 batch_id: string;
 stock_item_id: string;
 item_code: string;
 item_name: string;
 quantity_remaining: number;
 unit: string;
 production_date: string;
 expires_on: string;
 days_until_expiry: number;
 expired: boolean;
 expiring_soon: boolean;
}

export interface RotiBatchesResponse {
 batches: RotiBatchAtLocation[];
 shelf_life_days: number;
}

export function computeExpiresOn(productionDate: string): string {
 const d = new Date(productionDate + 'T00:00:00');
 d.setDate(d.getDate() + ROTI_SHELF_LIFE_DAYS);
 return d.toISOString().slice(0, 10);
}

export function daysUntilExpiry(expiresOn: string, today = new Date()): number {
 const t = new Date(today);
 t.setHours(0, 0, 0, 0);
 const exp = new Date(expiresOn + 'T00:00:00');
 return Math.round((exp.getTime() ?? t.getTime()) / 86_400_000);
}

export function isRotiBatchExpired(expiresOn: string, today = new Date()): boolean {
 return daysUntilExpiry(expiresOn, today) < 0;
}

/** Hari terakhir masih boleh jual/guna (hari ke-5 dari production) */
export function isRotiBatchExpiringSoon(expiresOn: string, today = new Date()): boolean {
 const days = daysUntilExpiry(expiresOn, today);
 return days >= 0 && days <= 1;
}

export function rotiExpiryStatusLabel(daysUntil: number): {
 label: string;
 tone: 'ok' | 'warn' | 'danger';
} {
 if (daysUntil < 0) return { label: 'Luput', tone: 'danger' };
 if (daysUntil === 0) return { label: 'Luput hari ini', tone: 'danger' };
 if (daysUntil === 1) return { label: 'Luput esok', tone: 'warn' };
 if (daysUntil <= 2) return { label: `${daysUntil} hari lagi`, tone: 'warn' };
 return { label: `${daysUntil} hari lagi`, tone: 'ok' };
}

export interface ExpiredRotiBatch {
 batch_id: string;
 stock_item_id: string;
 item_code: string;
 item_name: string;
 pos_menu: string;
 quantity_remaining: number;
 unit: string;
 production_date: string;
 expires_on: string;
 days_expired: number;
 shelf_life_days: number;
}

export interface ExpiringSoonRotiBatch {
 stock_item_id: string;
 item_code: string;
 item_name: string;
 pos_menu: string;
 quantity_remaining: number;
 unit: string;
 production_date: string;
 expires_on: string;
 days_until_expiry: number;
}

export interface RotiExpirySummary {
 expired: ExpiredRotiBatch[];
 expiring_soon: ExpiringSoonRotiBatch[];
 has_expired: boolean;
 shelf_life_days: number;
}

export function groupExpiredForReject(batches: ExpiredRotiBatch[]) {
 const map = new Map<
 string,
 { stock_item_id: string; item_name: string; pos_menu: string; quantity: number; unit: string }
 >();

 for (const b of batches) {
 const existing = map.get(b.stock_item_id);
 const qty = Number(b.quantity_remaining);
 if (existing) {
 existing.quantity += qty;
 } else {
 map.set(b.stock_item_id, {
 stock_item_id: b.stock_item_id,
 item_name: b.item_name,
 pos_menu: b.pos_menu,
 quantity: qty,
 unit: b.unit,
 });
 }
 }

 return [...map.values()];
}

export function formatExpiryDate(isoDate: string): string {
 try {
 return new Date(isoDate + 'T00:00:00').toLocaleDateString('ms-MY', {
 day: 'numeric',
 month: 'short',
 year: 'numeric',
 });
 } catch {
 return isoDate;
 }
}
