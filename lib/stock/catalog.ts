/**
 * Sumber kebenaran - 9 item stok RKJ (Gudang HQ ↔ POS ↔ kiosk).
 * Digunakan untuk order stok ke cawangan & tolakan BOM POS.
 */

export type StockCategory = 'Roti' | 'Bahan' | 'Packaging';
export type StockOrigin = 'RKJ_MANUFACTURING' | 'SUPPLIER';
export type StockFlowCompany = 'RKJ_MFG' | 'RKJ_DIST' | 'RKJ';

export type PosRotiMenuCategory =
 | 'Roti Kaya'
 | 'Roti Kacang'
 | 'Roti Kelapa'
 | 'Roti Benggali';

export type PosMenuCategory = PosRotiMenuCategory | 'Pelbagai';

/** Menu roti dengan stok kiosk (papar di bar stok) */
export const POS_ROTI_MENU_CATEGORIES: PosRotiMenuCategory[] = [
 'Roti Kaya',
 'Roti Kacang',
 'Roti Kelapa',
 'Roti Benggali',
];

/** Semua tab menu POS termasuk Pelbagai */
export const POS_MENU_CATEGORIES: PosMenuCategory[] = [...POS_ROTI_MENU_CATEGORIES,
 'Pelbagai',
];

export type StockDisplayMode = 'pcs' | 'bag' | 'tong' | 'bag_pcs';

export interface RkjStockItemDef {
 item_code: string;
 name: string;
 category: StockCategory;
 /** Sumber sebenar stok untuk asingkan kerja kilang, distributor dan kiosk */
 origin: StockOrigin;
 /** Syarikat utama yang mengurus stok ini dalam aliran RKJ One */
 managed_by: StockFlowCompany;
 /** Produk buatan kilang yang perlu boleh diasingkan mengikut production date */
 production_date_tracking: boolean;
 base_unit: 'PCS' | 'GRAM';
 pack_quantity: number;
 pack_unit: 'BAG' | 'TONG';
 conversion_text: string;
 storage_unit: string;
 /** Menu POS yang guna stok roti ini */
 pos_menu?: PosMenuCategory;
 /** Cara papar di bar stok POS */
 pos_display: StockDisplayMode;
 /** Label ringkas bar stok POS */
 pos_label: string;
}

/** 9 item rasmi - mesti match POS & Gudang HQ */
export const RKJ_STOCK_CATALOG: RkjStockItemDef[] = [
 {
 item_code: 'ST-PLANTA',
 name: 'Roti Planta',
 category: 'Roti',
 origin: 'RKJ_MANUFACTURING',
 managed_by: 'RKJ_MFG',
 production_date_tracking: true,
 base_unit: 'PCS',
 pack_quantity: 20,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 20 pcs',
 storage_unit: 'Bag/Pcs',
 pos_menu: 'Roti Kaya',
 pos_display: 'bag_pcs',
 pos_label: 'Roti Kaya',
 },
 {
 item_code: 'ST-KELAPA',
 name: 'Roti Kelapa',
 category: 'Roti',
 origin: 'RKJ_MANUFACTURING',
 managed_by: 'RKJ_MFG',
 production_date_tracking: true,
 base_unit: 'PCS',
 pack_quantity: 28,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 28 pcs',
 storage_unit: 'Bag/Pcs',
 pos_menu: 'Roti Kelapa',
 pos_display: 'bag_pcs',
 pos_label: 'Roti Kelapa',
 },
 {
 item_code: 'ST-KACANG',
 name: 'Roti Kacang',
 category: 'Roti',
 origin: 'RKJ_MANUFACTURING',
 managed_by: 'RKJ_MFG',
 production_date_tracking: true,
 base_unit: 'PCS',
 pack_quantity: 24,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 24 pcs',
 storage_unit: 'Bag/Pcs',
 pos_menu: 'Roti Kacang',
 pos_display: 'bag_pcs',
 pos_label: 'Roti Kacang',
 },
 {
 item_code: 'ST-BENGGALI',
 name: 'Roti Benggali',
 category: 'Roti',
 origin: 'RKJ_MANUFACTURING',
 managed_by: 'RKJ_MFG',
 production_date_tracking: true,
 base_unit: 'PCS',
 pack_quantity: 2,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 2 pcs',
 storage_unit: 'Bag/Pcs',
 pos_menu: 'Roti Benggali',
 pos_display: 'bag_pcs',
 pos_label: 'Roti Benggali',
 },
 {
 item_code: 'ST-KAYA',
 name: 'Kaya',
 category: 'Bahan',
 origin: 'RKJ_MANUFACTURING',
 managed_by: 'RKJ_MFG',
 production_date_tracking: true,
 base_unit: 'GRAM',
 pack_quantity: 5000,
 pack_unit: 'TONG',
 conversion_text: '1 tong = 5kg',
 storage_unit: 'Tong/Kg/Gram',
 pos_display: 'tong',
 pos_label: 'Kaya',
 },
 {
 item_code: 'ST-BUTTER',
 name: 'Butter',
 category: 'Bahan',
 origin: 'SUPPLIER',
 managed_by: 'RKJ_MFG',
 production_date_tracking: false,
 base_unit: 'GRAM',
 pack_quantity: 4800,
 pack_unit: 'TONG',
 conversion_text: '1 tong = 4.8kg',
 storage_unit: 'Tong/Kg/Gram',
 pos_display: 'tong',
 pos_label: 'Butter',
 },
 {
 item_code: 'ST-PLASTIC-S',
 name: 'Plastic S',
 category: 'Packaging',
 origin: 'SUPPLIER',
 managed_by: 'RKJ_MFG',
 production_date_tracking: false,
 base_unit: 'PCS',
 pack_quantity: 100,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 100 pcs',
 storage_unit: 'Bag/Pcs',
 pos_display: 'bag_pcs',
 pos_label: 'Plastic S',
 },
 {
 item_code: 'ST-PLASTIC-M',
 name: 'Plastic M',
 category: 'Packaging',
 origin: 'SUPPLIER',
 managed_by: 'RKJ_MFG',
 production_date_tracking: false,
 base_unit: 'PCS',
 pack_quantity: 100,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 100 pcs',
 storage_unit: 'Bag/Pcs',
 pos_display: 'bag_pcs',
 pos_label: 'Plastic M',
 },
 {
 item_code: 'ST-PLASTIC-B',
 name: 'Plastic B',
 category: 'Packaging',
 origin: 'SUPPLIER',
 managed_by: 'RKJ_MFG',
 production_date_tracking: false,
 base_unit: 'PCS',
 pack_quantity: 100,
 pack_unit: 'BAG',
 conversion_text: '1 bag = 100 pcs',
 storage_unit: 'Bag/Pcs',
 pos_display: 'bag_pcs',
 pos_label: 'Plastic B',
 },
];

export const HQ_STOCK_ITEM_CODES = RKJ_STOCK_CATALOG.map(
 (i) => i.item_code) as [
 'ST-PLANTA',
 'ST-KELAPA',
 'ST-KACANG',
 'ST-BENGGALI',
 'ST-KAYA',
 'ST-BUTTER',
 'ST-PLASTIC-S',
 'ST-PLASTIC-M',
 'ST-PLASTIC-B',
];

export type HqStockItemCode = (typeof HQ_STOCK_ITEM_CODES)[number];

/** 4 jenis stok roti kiosk */
export const HQ_ROTI_ITEM_CODES = [
 'ST-PLANTA',
 'ST-KELAPA',
 'ST-KACANG',
 'ST-BENGGALI',
] as const;

export type HqRotiItemCode = (typeof HQ_ROTI_ITEM_CODES)[number];

/** 5 produk buatan sendiri kilang RKJ Manufacturing */
export const RKJ_MANUFACTURING_OWN_PRODUCT_CODES = [
 'ST-PLANTA',
 'ST-KELAPA',
 'ST-KACANG',
 'ST-BENGGALI',
 'ST-KAYA',
] as const;

/** Stok yang kilang beli daripada supplier sebagai simpanan/operasi */
export const RKJ_SUPPLIER_RESERVE_STOCK_CODES = [
 'ST-BUTTER',
 'ST-PLASTIC-S',
 'ST-PLASTIC-M',
 'ST-PLASTIC-B',
] as const;

export function isRkjManufacturingOwnProduct(code: string) {
 return RKJ_MANUFACTURING_OWN_PRODUCT_CODES.includes(code as (typeof RKJ_MANUFACTURING_OWN_PRODUCT_CODES)[number]);
}

export function tracksProductionDate(code: string) {
 return Boolean(getStockByCode(code)?.production_date_tracking);
}

export const LEGACY_STOCK_ITEM_ALIASES: Record<string, HqStockItemCode> = {
 STK001: 'ST-PLANTA',
 STK002: 'ST-KELAPA',
 STK003: 'ST-KACANG',
 STK004: 'ST-BENGGALI',
 STK005: 'ST-KAYA',
 STK006: 'ST-BUTTER',
 PKG001: 'ST-PLASTIC-S',
 PKG002: 'ST-PLASTIC-M',
 PKG003: 'ST-PLASTIC-B',
};

export function getStockByCode(code: string): RkjStockItemDef | undefined {
 return RKJ_STOCK_CATALOG.find((i) => i.item_code === code);
}

export function isHqStockItemCode(code: string): code is HqStockItemCode {
 return HQ_STOCK_ITEM_CODES.includes(code as HqStockItemCode);
}

/** POS: kod stok ikut menu roti (Pelbagai guna BOM produk, bukan satu stok menu) */
export const POS_MENU_STOCK_CODES: Record<PosRotiMenuCategory, HqStockItemCode> =
 Object.fromEntries(
 RKJ_STOCK_CATALOG.filter((i) => i.pos_menu).map((i) => [i.pos_menu!, i.item_code])) as Record<PosRotiMenuCategory, HqStockItemCode>;

/** POS: bahan & plastik (supplement bar) */
export function getPosSupplementStock() {
 return RKJ_STOCK_CATALOG.filter((i) => !i.pos_menu).map((i) => ({
 key: i.item_code.toLowerCase(),
 itemCode: i.item_code,
 label: i.pos_label,
 display: i.pos_display,
 packQuantity: i.pack_quantity,
 }));
}

export interface StockPackInfo {
 pack_quantity?: number | null;
 pack_unit?: string | null;
 conversion_text?: string | null;
 item_code?: string;
}

/** pcs per bag - catalog roti (4 jenis) adalah sumber kebenaran */
export function resolvePackQuantity(
 itemCode: string | undefined,
 pack?: StockPackInfo | null): number | null {
 const fromCatalog = itemCode ? getStockByCode(itemCode)?.pack_quantity : undefined;
 if (fromCatalog != null && fromCatalog > 0) return fromCatalog;
 const fromDb = pack?.pack_quantity != null ? Number(pack.pack_quantity) : null;
 if (fromDb != null && fromDb > 0) return fromDb;
 return null;
}

/** Tukar baki DB ke jumlah pcs */
export function toTotalPcs(
 quantity: number,
 balanceUnit: string,
 pcsPerBag: number): number {
 const unit = balanceUnit.toUpperCase();
 const q = Number(quantity);
 if (unit === 'BAG') return Math.round(q * pcsPerBag);
 return Math.round(q);
}

/** Pecah jumlah pcs ke bag penuh + baki pcs (ikut pack_quantity setiap jenis roti) */
export function splitBagAndPcs(totalPcs: number, pcsPerBag: number) {
 const total = Math.max(0, Math.round(totalPcs));
 const perBag = pcsPerBag > 0 ? pcsPerBag : 1;
 return {
 totalPcs: total,
 bags: Math.floor(total / perBag),
 remainderPcs: total % perBag,
 };
}

/** Papar stok roti/plastik: contoh 42 pcs @ 20/bag ke "2 bag - 2 pcs" */
export function formatBagPcsLabel(totalPcs: number, pcsPerBag: number): string {
 const { bags, remainderPcs, totalPcs: total } = splitBagAndPcs(totalPcs, pcsPerBag);
 if (total <= 0) return '0 pcs';
 if (bags > 0 && remainderPcs > 0) {
 return `${bags} bag - ${remainderPcs.toLocaleString('ms-MY')} pcs`;
 }
 if (bags > 0) {
 return `${bags} bag`;
 }
 return `${total.toLocaleString('ms-MY')} pcs`;
}

/** Tukar kuantiti order (bag/tong) ke unit asas (pcs/gram) */
export function toBaseQuantity(
 qty: number,
 item: Pick<RkjStockItemDef, 'pack_quantity' | 'base_unit'>): number {
 return qty * item.pack_quantity;
}

export type RejectOrderUnit = 'tong' | 'bag' | 'base';

/** Unit operasi kiosk untuk reject stok POS */
export function getRejectOrderUnit(itemCode: string): {
 orderUnit: RejectOrderUnit;
 orderLabel: string;
 baseUnit: string;
 conversionText: string;
 step: string;
} {
 const def = getStockByCode(itemCode);
 if (!def) {
 return {
 orderUnit: 'base',
 orderLabel: 'Kuantiti',
 baseUnit: 'PCS',
 conversionText: '',
 step: '1',
 };
 }

 if (def.pack_unit === 'TONG') {
 return {
 orderUnit: 'tong',
 orderLabel: 'Kuantiti (tong)',
 baseUnit: 'GRAM',
 conversionText: def.conversion_text,
 step: '0.01',
 };
 }

 if (def.category === 'Roti' || def.category === 'Packaging') {
 return {
 orderUnit: 'bag',
 orderLabel: 'Kuantiti (bag)',
 baseUnit: def.base_unit,
 conversionText: def.conversion_text,
 step: '0.01',
 };
 }

 return {
 orderUnit: 'base',
 orderLabel: `Kuantiti (${def.base_unit.toLowerCase()})`,
 baseUnit: def.base_unit,
 conversionText: def.conversion_text,
 step: def.base_unit === 'GRAM' ? '1' : '1',
 };
}

/** Tukar input reject (bag/tong) ke kuantiti asas untuk API */
export function resolveRejectToBaseQuantity(
 itemCode: string,
 orderQty: number,
 useBaseUnit = false): { quantity: number; unit: string } {
 const def = getStockByCode(itemCode);
 if (!def) return { quantity: orderQty, unit: 'PCS' };

 const { orderUnit } = getRejectOrderUnit(itemCode);
 if (!useBaseUnit && (orderUnit === 'tong' || orderUnit === 'bag')) {
 return { quantity: toBaseQuantity(orderQty, def), unit: def.base_unit };
 }
 return { quantity: orderQty, unit: def.base_unit };
}

/** Pratonton penolakan selepas tukar unit */
export function formatRejectPreview(
 itemCode: string,
 orderQty: number,
 useBaseUnit = false): string | null {
 if (!orderQty || orderQty <= 0 || !Number.isFinite(orderQty)) return null;
 const { quantity, unit } = resolveRejectToBaseQuantity(itemCode, orderQty, useBaseUnit);
 const label = unit === 'GRAM' ? 'g' : unit.toLowerCase();
 return ` ke ${quantity.toLocaleString('ms-MY')} ${label} akan ditolak`;
}

/** Papar stok HQ / inventori */
export function formatStockQuantity(
 quantity: number,
 unit: string,
 pack?: StockPackInfo | null): string {
 const itemCode = pack?.item_code;
 const packQty = resolvePackQuantity(itemCode, pack);
 const packUnit = (
 pack?.pack_unit ??
 getStockByCode(itemCode ?? '')?.pack_unit ??
 'bag').toLowerCase();

 if (!packQty) {
 return `${Number(quantity).toLocaleString('ms-MY')} ${unit}`;
 }

 const totalPcs = toTotalPcs(quantity, unit, packQty);

 if (packUnit === 'tong') {
 const { bags } = splitBagAndPcs(totalPcs, packQty);
 const kg = totalPcs / 1000;
 return `${bags} tong - ${kg.toLocaleString('ms-MY', { maximumFractionDigits: 1 })} kg`;
 }

 return formatBagPcsLabel(totalPcs, packQty);
}

/** Payload sync ke jadual stock_items */
export function stockItemDbPayload(item: RkjStockItemDef) {
 return {
 name: item.name,
 category: item.category,
 base_unit: item.base_unit,
 storage_unit: item.storage_unit,
 conversion_text: item.conversion_text,
 pack_quantity: item.pack_quantity,
 pack_unit: item.pack_unit,
 status: 'ACTIVE' as const,
 };
}
