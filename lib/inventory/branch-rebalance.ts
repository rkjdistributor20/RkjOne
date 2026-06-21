import {
  getStockByCode,
  HQ_ROTI_ITEM_CODES,
  HQ_STOCK_ITEM_CODES,
} from '@/lib/stock/catalog';
import { isRotiBatchExpired, computeExpiresOn } from '@/lib/stock/expiry';

export function isRotiItemCode(code: string): boolean {
  return (HQ_ROTI_ITEM_CODES as readonly string[]).includes(code);
}

export const MAX_REBALANCE_BRANCHES = 10;

export type RebalanceItemQty = {
  stock_item_id: string;
  item_code: string;
  quantity: number;
  unit: string;
  production_date?: string;
  expires_on?: string;
};

export type PickupAllocation = {
  locationId: string;
  items: RebalanceItemQty[];
};

export type DropAllocation = {
  locationId: string;
  items: RebalanceItemQty[];
};

export type TransferLeg = {
  from_location_id: string;
  to_location_id: string;
  items: RebalanceItemQty[];
};

export function countUniqueBranches(
  pickups: PickupAllocation[],
  drops: DropAllocation[]
): number {
  const ids = new Set<string>();
  for (const p of pickups) ids.add(p.locationId);
  for (const d of drops) ids.add(d.locationId);
  return ids.size;
}

export function itemTotals(
  allocations: Array<{ items: RebalanceItemQty[] }>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const alloc of allocations) {
    for (const item of alloc.items) {
      totals.set(item.item_code, (totals.get(item.item_code) ?? 0) + item.quantity);
    }
  }
  return totals;
}

export function validateRebalancePlan(
  pickups: PickupAllocation[],
  drops: DropAllocation[]
): { ok: true } | { ok: false; message: string } {
  if (!pickups.length) {
    return { ok: false, message: 'Tambah sekurang-kurangnya satu cawangan ambil (pickup)' };
  }
  if (!drops.length) {
    return { ok: false, message: 'Tambah sekurang-kurangnya satu cawangan hantar (drop)' };
  }

  const branchCount = countUniqueBranches(pickups, drops);
  if (branchCount > MAX_REBALANCE_BRANCHES) {
    return {
      ok: false,
      message: `Maksimum ${MAX_REBALANCE_BRANCHES} cawangan — kini ${branchCount}`,
    };
  }

  const pickupIds = new Set(pickups.map((p) => p.locationId));
  for (const drop of drops) {
    if (pickupIds.has(drop.locationId)) {
      return {
        ok: false,
        message: 'Cawangan ambil dan hantar mestilah berbeza',
      };
    }
  }

  const pickTotals = itemTotals(pickups);
  const dropTotals = itemTotals(drops);

  let hasQty = false;
  for (const code of HQ_STOCK_ITEM_CODES) {
    const pick = pickTotals.get(code) ?? 0;
    const drop = dropTotals.get(code) ?? 0;
    if (pick > 0 || drop > 0) hasQty = true;
    if (pick !== drop) {
      const name = getStockByCode(code)?.name ?? code;
      return {
        ok: false,
        message: `${name}: diambil ${pick} ≠ dihantar ${drop}`,
      };
    }
  }

  if (!hasQty) {
    return { ok: false, message: 'Masukkan kuantiti sekurang-kurangnya satu jenis stok' };
  }

  for (const pickup of pickups) {
    for (const item of pickup.items) {
      if (isRotiItemCode(item.item_code) && item.quantity > 0) {
        if (!item.production_date) {
          const name = getStockByCode(item.item_code)?.name ?? item.item_code;
          return {
            ok: false,
            message: `${name}: pilih batch roti dengan tarikh production`,
          };
        }
        const expiresOn = item.expires_on ?? computeExpiresOn(item.production_date);
        if (isRotiBatchExpired(expiresOn)) {
          const name = getStockByCode(item.item_code)?.name ?? item.item_code;
          return {
            ok: false,
            message: `${name} (${item.production_date}): batch sudah luput — tolak/reject dahulu`,
          };
        }
      }
    }
  }

  return { ok: true };
}

/** Pecahkan pelan ambil/hantar kepada pindahan kiosk→kiosk individu */
export function buildTransferLegs(
  pickups: PickupAllocation[],
  drops: DropAllocation[]
): TransferLeg[] {
  const legsMap = new Map<string, TransferLeg>();

  for (const itemCode of HQ_STOCK_ITEM_CODES) {
    const roti = isRotiItemCode(itemCode);

    const pickRemaining = pickups
      .flatMap((p) =>
        p.items
          .filter((i) => i.item_code === itemCode && i.quantity > 0)
          .map((i) => ({
            locationId: p.locationId,
            qty: i.quantity,
            meta: i,
          }))
      );

    if (roti) {
      pickRemaining.sort((a, b) =>
        (a.meta.production_date ?? '').localeCompare(b.meta.production_date ?? '')
      );
    }

    const dropRemaining = drops
      .map((d) => ({
        locationId: d.locationId,
        qty: d.items.find((i) => i.item_code === itemCode)?.quantity ?? 0,
      }))
      .filter((x) => x.qty > 0);

    let pi = 0;
    let di = 0;
    while (pi < pickRemaining.length && di < dropRemaining.length) {
      const pick = pickRemaining[pi];
      const drop = dropRemaining[di];
      const move = Math.min(pick.qty, drop.qty);
      if (move <= 0) break;

      const key = `${pick.locationId}:${drop.locationId}`;
      let leg = legsMap.get(key);
      if (!leg) {
        leg = {
          from_location_id: pick.locationId,
          to_location_id: drop.locationId,
          items: [],
        };
        legsMap.set(key, leg);
      }

      const existing = leg.items.find(
        (i) =>
          i.item_code === itemCode &&
          (!roti || i.production_date === pick.meta.production_date)
      );
      if (existing) {
        existing.quantity += move;
      } else {
        leg.items.push({
          stock_item_id: pick.meta.stock_item_id,
          item_code: itemCode,
          quantity: move,
          unit: pick.meta.unit,
          ...(roti && pick.meta.production_date
            ? {
                production_date: pick.meta.production_date,
                expires_on: pick.meta.expires_on,
              }
            : {}),
        });
      }

      pick.qty -= move;
      drop.qty -= move;
      if (pick.qty <= 0) pi++;
      if (drop.qty <= 0) di++;
    }
  }

  return [...legsMap.values()].filter((l) => l.items.length > 0);
}
