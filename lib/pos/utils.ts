import {
  POS_MENU_CATEGORIES,
  POS_MENU_STOCK_CODES,
  POS_ROTI_MENU_CATEGORIES,
  getPosSupplementStock,
  formatBagPcsLabel,
  resolvePackQuantity,
  splitBagAndPcs,
  toTotalPcs,
  type PosMenuCategory,
  type PosRotiMenuCategory,
} from '@/lib/stock/catalog';

export { POS_MENU_CATEGORIES, POS_MENU_STOCK_CODES, POS_ROTI_MENU_CATEGORIES };
export type { PosMenuCategory, PosRotiMenuCategory };

export type KioskStockDisplayMode = 'pcs' | 'bag' | 'tong' | 'bag_pcs';

export interface KioskStockRowConfig {
  key: string;
  itemCode: string;
  label: string;
  display: KioskStockDisplayMode;
  packQuantity?: number;
}

/** Bahan & plastik — sama catalog dengan Gudang HQ */
export const POS_SUPPLEMENT_STOCK: KioskStockRowConfig[] = getPosSupplementStock();

export const INVENTORY_STOCK_CATEGORIES = ['Roti', 'Bahan', 'Packaging'] as const;

const LOW_THRESHOLD: Record<KioskStockDisplayMode, number> = {
  pcs: 5,
  bag: 5,
  tong: 0.5,
  bag_pcs: 5,
};

export interface KioskStockDisplayResult {
  displayQuantity: number;
  displayUnit: string;
  statusValue: number;
  displayBags?: number;
  displayRemainderPcs?: number;
  packQuantity?: number;
}

export function toKioskStockDisplay(
  quantity: number,
  balanceUnit: string,
  display: KioskStockDisplayMode,
  packQuantity?: number | null,
  itemCode?: string
): KioskStockDisplayResult {
  const unit = balanceUnit.toUpperCase();
  const resolvedPack =
    resolvePackQuantity(itemCode, { pack_quantity: packQuantity }) ??
    (packQuantity && packQuantity > 0 ? Number(packQuantity) : null);

  if (display === 'tong') {
    const grams =
      unit === 'KG' || unit === 'KILOGRAM' ? quantity * 1000 : quantity;
    const tongSize = resolvedPack && resolvedPack > 0 ? resolvedPack : 5000;
    const tongs = grams / tongSize;
    return { displayQuantity: tongs, displayUnit: 'tong', statusValue: tongs };
  }

  if (display === 'bag') {
    const pcsPerBag = resolvedPack && resolvedPack > 0 ? resolvedPack : 100;
    const bags = unit === 'BAG' ? quantity : quantity / pcsPerBag;
    return { displayQuantity: bags, displayUnit: 'bag', statusValue: bags };
  }

  if (display === 'bag_pcs') {
    const pcsPerBag = resolvedPack && resolvedPack > 0 ? resolvedPack : 1;
    const totalPcs = toTotalPcs(quantity, balanceUnit, pcsPerBag);
    const { bags, remainderPcs } = splitBagAndPcs(totalPcs, pcsPerBag);
    return {
      displayQuantity: totalPcs,
      displayUnit: 'bag_pcs',
      statusValue: totalPcs,
      displayBags: bags,
      displayRemainderPcs: remainderPcs,
      packQuantity: pcsPerBag,
    };
  }

  const pcsPerBag = resolvedPack && resolvedPack > 0 ? resolvedPack : 1;
  const totalPcs = toTotalPcs(quantity, balanceUnit, pcsPerBag);
  return {
    displayQuantity: totalPcs,
    displayUnit: balanceUnit || 'pcs',
    statusValue: totalPcs,
  };
}

export function kioskStockStatus(
  statusValue: number,
  display: KioskStockDisplayMode
): 'OK' | 'LOW' | 'OUT' {
  if (statusValue <= 0) return 'OUT';
  if (statusValue <= LOW_THRESHOLD[display]) return 'LOW';
  return 'OK';
}

export function formatKioskStockLabel(
  input:
    | {
        displayQuantity: number;
        displayUnit: string;
        displayBags?: number;
        displayRemainderPcs?: number;
        packQuantity?: number;
        itemCode?: string;
      }
    | number,
  displayUnit?: string
): string {
  const balance =
    typeof input === 'number'
      ? { displayQuantity: input, displayUnit: displayUnit ?? 'pcs' }
      : input;

  if (balance.displayUnit === 'bag_pcs') {
    const packQty =
      resolvePackQuantity(balance.itemCode, {
        pack_quantity: balance.packQuantity,
      }) ?? 1;
    return formatBagPcsLabel(Math.round(balance.displayQuantity), packQty);
  }

  if (balance.displayUnit === 'tong') {
    const formatted =
      balance.displayQuantity >= 10
        ? balance.displayQuantity.toFixed(1)
        : balance.displayQuantity.toFixed(2);
    return `${formatted} tong`;
  }
  if (balance.displayUnit === 'bag') {
    return `${Math.floor(balance.displayQuantity).toLocaleString()} bag`;
  }
  return `${Math.floor(balance.displayQuantity).toLocaleString()} ${balance.displayUnit}`;
}

const LEGACY_CATEGORY: Record<string, PosMenuCategory> = {
  Benggali: 'Roti Benggali',
  Bengali: 'Roti Benggali',
  Kelapa: 'Roti Kelapa',
  Kacang: 'Roti Kacang',
  Kaya: 'Roti Kaya',
  Planta: 'Roti Kaya',
  Pelbagai: 'Pelbagai',
  Miscellaneous: 'Pelbagai',
};

export function normalizePosCategory(
  category: string | null | undefined
): PosMenuCategory | null {
  const value = category?.trim() ?? '';
  if (!value) return null;
  if ((POS_MENU_CATEGORIES as readonly string[]).includes(value)) {
    return value as PosMenuCategory;
  }
  return LEGACY_CATEGORY[value] ?? null;
}

export function isPosMenuCategory(value: string): value is PosMenuCategory {
  return (POS_MENU_CATEGORIES as readonly string[]).includes(value);
}

export function parsePrice(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function formatRM(amount: unknown): string {
  const n = parsePrice(amount);
  if (n === 0 && amount !== 0 && amount !== '0' && amount !== '0.00') {
    return 'RM —';
  }
  return `RM ${n.toFixed(2)}`;
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
