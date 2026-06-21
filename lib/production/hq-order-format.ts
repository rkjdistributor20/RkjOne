/**
 * Format borang order HQ → Kilang (9 item rasmi, 3 seksyen).
 */

import { HQ_STOCK_ITEM_CODES, getStockByCode } from '@/lib/stock/catalog';

export interface HqOrderSectionDef {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  itemCodes: (typeof HQ_STOCK_ITEM_CODES)[number][];
}

export const HQ_FACTORY_ORDER_SECTIONS: HqOrderSectionDef[] = [
  {
    id: 'roti',
    number: 1,
    title: 'Stok Roti',
    subtitle: 'Isi kuantiti dalam BAG — sistem auto kira pcs ikut menu',
    itemCodes: ['ST-PLANTA', 'ST-KELAPA', 'ST-KACANG', 'ST-BENGGALI'],
  },
  {
    id: 'bahan',
    number: 2,
    title: 'Bahan',
    subtitle: 'Isi kuantiti dalam TONG',
    itemCodes: ['ST-KAYA', 'ST-BUTTER'],
  },
  {
    id: 'packaging',
    number: 3,
    title: 'Packaging',
    subtitle: 'Isi kuantiti dalam BAG',
    itemCodes: ['ST-PLASTIC-S', 'ST-PLASTIC-M', 'ST-PLASTIC-B'],
  },
];

export function getHqOrderUnitLabel(itemCode: string): string {
  const def = getStockByCode(itemCode);
  if (!def) return 'Unit';
  if (def.pack_unit === 'TONG') return 'Tong';
  if (def.category === 'Roti' || def.category === 'Packaging') return 'Bag';
  return def.base_unit;
}

export function formatHqOrderPreview(itemCode: string, orderQty: number): string | null {
  if (orderQty <= 0) return null;
  const def = getStockByCode(itemCode);
  if (!def) return `${orderQty} unit`;

  if (def.pack_unit === 'TONG') {
    const kg = (orderQty * def.pack_quantity) / 1000;
    return `≈ ${kg.toLocaleString('ms-MY', { maximumFractionDigits: 1 })} kg`;
  }

  if (def.category === 'Roti' || def.category === 'Packaging') {
    const pcs = orderQty * def.pack_quantity;
    return `≈ ${pcs.toLocaleString('ms-MY')} pcs`;
  }

  return `≈ ${orderQty.toLocaleString('ms-MY')} ${def.base_unit.toLowerCase()}`;
}

/** Susun item stok API ikut format borang */
export function sortStockItemsForHqOrder<
  T extends { item_code: string; name: string }
>(items: T[]): T[] {
  const order = new Map<string, number>(HQ_STOCK_ITEM_CODES.map((code, i) => [code, i]));
  return [...items].sort(
    (a, b) => (order.get(a.item_code) ?? 99) - (order.get(b.item_code) ?? 99)
  );
}
