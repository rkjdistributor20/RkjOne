/** Roti: shelf life 5 hari dari tarikh production */
export const ROTI_SHELF_LIFE_DAYS = 5;

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
