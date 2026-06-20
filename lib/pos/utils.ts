/** Empat menu rasmi RKJ — tiada kategori lain di POS */
export const POS_MENU_CATEGORIES = [
  'Roti Kaya',
  'Roti Kacang',
  'Roti Kelapa',
  'Roti Benggali',
] as const;

/**
 * Kategori stok inventory (HQ/kiosk) — kekal termasuk Packaging.
 * POS hanya papar 4 menu; plastik ditolak via BOM setiap jualan.
 */
export const INVENTORY_STOCK_CATEGORIES = [
  'Roti',
  'Bahan',
  'Packaging',
] as const;

export type PosMenuCategory = (typeof POS_MENU_CATEGORIES)[number];

/** Stok roti asas di kiosk ikut menu POS */
export const POS_MENU_STOCK_CODES: Record<PosMenuCategory, string> = {
  'Roti Kaya': 'ST-PLANTA',
  'Roti Kacang': 'ST-KACANG',
  'Roti Kelapa': 'ST-KELAPA',
  'Roti Benggali': 'ST-BENGGALI',
};

export type KioskStockDisplayMode = 'pcs' | 'kg' | 'pack';

export interface KioskStockRowConfig {
  key: string;
  itemCode: string;
  label: string;
  display: KioskStockDisplayMode;
}

/** Bahan & packaging — dipapar di bar stok POS */
export const POS_SUPPLEMENT_STOCK: KioskStockRowConfig[] = [
  { key: 'kaya', itemCode: 'ST-KAYA', label: 'Kaya', display: 'kg' },
  { key: 'butter', itemCode: 'ST-BUTTER', label: 'Butter', display: 'kg' },
  { key: 'plastic-s', itemCode: 'ST-PLASTIC-S', label: 'Plastik S', display: 'pack' },
  { key: 'plastic-m', itemCode: 'ST-PLASTIC-M', label: 'Plastik M', display: 'pack' },
  { key: 'plastic-b', itemCode: 'ST-PLASTIC-B', label: 'Plastik B', display: 'pack' },
];

const LOW_THRESHOLD: Record<KioskStockDisplayMode, number> = {
  pcs: 5,
  kg: 0.5,
  pack: 5,
};

export function toKioskStockDisplay(
  quantity: number,
  balanceUnit: string,
  display: KioskStockDisplayMode,
  packQuantity?: number | null
): { displayQuantity: number; displayUnit: string; statusValue: number } {
  const unit = balanceUnit.toUpperCase();

  if (display === 'kg') {
    const grams =
      unit === 'KG' || unit === 'KILOGRAM' ? quantity * 1000 : quantity;
    const kg = grams / 1000;
    return { displayQuantity: kg, displayUnit: 'kg', statusValue: kg };
  }

  if (display === 'pack') {
    const pcsPerPack = packQuantity && packQuantity > 0 ? Number(packQuantity) : 100;
    const packs =
      unit === 'PACK' ? quantity : quantity / pcsPerPack;
    return { displayQuantity: packs, displayUnit: 'pack', statusValue: packs };
  }

  return {
    displayQuantity: quantity,
    displayUnit: balanceUnit || 'pcs',
    statusValue: quantity,
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
  displayQuantity: number,
  displayUnit: string
): string {
  if (displayUnit === 'kg') {
    const formatted =
      displayQuantity >= 10
        ? displayQuantity.toFixed(1)
        : displayQuantity.toFixed(2);
    return `${formatted} kg`;
  }
  if (displayUnit === 'pack') {
    return `${Math.floor(displayQuantity).toLocaleString()} pack`;
  }
  return `${Math.floor(displayQuantity).toLocaleString()} ${displayUnit}`;
}

const LEGACY_CATEGORY: Record<string, PosMenuCategory> = {
  Benggali: 'Roti Benggali',
  Kelapa: 'Roti Kelapa',
  Kacang: 'Roti Kacang',
  Kaya: 'Roti Kaya',
  Planta: 'Roti Kaya',
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
