import { HQ_FACTORY_ORDER_SECTIONS } from '@/lib/production/hq-order-format';
import {
 HQ_STOCK_ITEM_CODES,
 formatStockQuantity,
 getStockByCode,
 isHqStockItemCode,
} from '@/lib/stock/catalog';
import type { StockItemOption } from '@/lib/inventory/types';

export type BalanceStatus = 'OK' | 'LOW' | 'CRITICAL';

export function computeBalanceStatus(
 qty: number,
 min: number | null | undefined,
 critical: number | null | undefined): BalanceStatus {
 if (critical != null && qty <= critical) return 'CRITICAL';
 if (min != null && qty <= min) return 'LOW';
 return 'OK';
}

export function padHqStockBalances<
 T extends {
 id: string;
 location_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 stock_item: StockItemOption;
 }
>(locationId: string, rows: T[]): Array<T & { status: BalanceStatus }> {
 const byCode = new Map(rows.map((r) => [r.stock_item.item_code, r]));
 const padded: T[] = [];

 for (const code of HQ_STOCK_ITEM_CODES) {
 const existing = byCode.get(code);
 if (existing) {
 padded.push(existing);
 continue;
 }
 const def = getStockByCode(code);
 if (!def) continue;
 padded.push({
 id: `virtual-${locationId}-${code}`,
 location_id: locationId,
 stock_item_id: `virtual-${code}`,
 quantity: 0,
 unit: def.base_unit,
 stock_item: {
 id: `virtual-${code}`,
 item_code: code,
 name: def.name,
 category: def.category,
 base_unit: def.base_unit,
 min_threshold: null,
 critical_threshold: null,
 pack_quantity: def.pack_quantity,
 pack_unit: def.pack_unit,
 conversion_text: def.conversion_text,
 },
 } as T);
 }

 return padded.map((row) => ({...row,
 status: computeBalanceStatus(
 Number(row.quantity),
 row.stock_item.min_threshold,
 row.stock_item.critical_threshold),
 }));
}

export function formatBalanceDisplay(
 quantity: number,
 unit: string,
 itemCode: string,
 pack?: { pack_quantity?: number | null; pack_unit?: string | null }): string {
 return formatStockQuantity(quantity, unit, {
 item_code: itemCode,
 pack_quantity: pack?.pack_quantity ?? undefined,
 pack_unit: pack?.pack_unit ?? undefined,
 });
}

export const STOCK_CATEGORY_ORDER = HQ_FACTORY_ORDER_SECTIONS.map((s) => ({
 id: s.id,
 title: s.title,
 itemCodes: s.itemCodes,
}));

export function groupBalancesByCategory<
 T extends { stock_item: { item_code: string; category?: string | null } }
>(balances: T[]): Array<{ sectionId: string; title: string; items: T[] }> {
 return HQ_FACTORY_ORDER_SECTIONS.map((section) => ({
 sectionId: section.id,
 title: section.title,
 items: balances.filter((b) => section.itemCodes.includes(b.stock_item.item_code as never)),
 })).filter((g) => g.items.length > 0);
}

export function filterOfficialStockRows<
 T extends { stock_item?: { item_code?: string } | null }
>(rows: T[]): T[] {
 return rows.filter((r) => isHqStockItemCode(r.stock_item?.item_code ?? ''));
}
