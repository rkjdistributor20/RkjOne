'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 AlertTriangle,
 Brain,
 Boxes,
 CheckCircle2,
 ClipboardCheck,
 Clock3,
 Factory,
 LogIn,
 LogOut,
 PackageCheck,
 PackagePlus,
 RefreshCw,
 ShieldCheck,
 ShoppingBasket,
 Truck,
 Plus,
 Trash2,
 type LucideIcon,
} from 'lucide-react';
import {
 confirmPosStockDelivery,
 fetchPosStockSop,
 returnPosPresenceLeave,
 startPosPresenceLeave,
 submitPosStockCheck,
 submitPosSupplyRequest,
} from '@/lib/pos/api';
import { fetchStockItems } from '@/lib/inventory/api';
import type { StockItemOption } from '@/lib/inventory/types';
import type {
 PosPresenceReason,
 PosShiftStockCheckType,
 PosStockEstimateItem,
 PosStockReceipt,
 PosStockSopResponse,
} from '@/lib/pos/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
 Select,
 SelectContent,
 SelectGroup,
 SelectItem,
 SelectLabel,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { boundSelectValue } from '@/lib/ui/select-utils';
import { useAuthStore } from '@/stores/auth-store';
import {
 HQ_ROTI_ITEM_CODES,
 HQ_STOCK_ITEM_CODES,
 getStockByCode,
 tracksProductionDate,
} from '@/lib/stock/catalog';
import {
 productionAgeDays,
 ROTI_SHELF_LIFE_DAYS,
} from '@/lib/stock/expiry';

type Line = {
 stock_item_id: string;
 quantity: string;
 unit?: string;
 note?: string;
 production_date?: string;
};

type StockCountScope = 'sales' | 'factory';
type StockCountGroupKey =
 | 'sales_roti'
 | 'sales_material'
 | 'sales_packaging'
 | 'factory_raw'
 | 'factory_packaging';

type StockCountGroup = {
 key: StockCountGroupKey;
 label: string;
 description: string;
 icon: LucideIcon;
 accent: string;
 items: StockItemOption[];
};

type KioskEquipmentItem = {
 code: string;
 name: string;
 category: 'Peralatan Jualan' | 'Kebersihan' | 'Rekod & Sokongan';
 unit: string;
};

type KioskEquipmentGroup = {
 key: KioskEquipmentItem['category'];
 label: string;
 description: string;
 icon: LucideIcon;
 accent: string;
 items: KioskEquipmentItem[];
};

type RequestLine = {
 item_code: string;
 item_name: string;
 quantity: string;
 unit?: string;
 note?: string;
};

type PosStockSopSuccessAction =
 | 'confirm_delivery'
 | 'stock_check'
 | 'leave_start'
 | 'leave_return'
 | 'supply_request';

const STATUS_LABELS: Record<string, string> = {
 DRIVER_DROPPED: 'Wajib sahkan stok',
 STAFF_CONFIRMED: 'Staf sahkan - tunggu audit AM/OM',
 DISCREPANCY_PENDING_APPROVAL: 'Beza stok - tunggu AM/OM',
 APPROVED: 'Diluluskan',
 REJECTED: 'Ditolak',
 PENDING: 'Menunggu',
};

const CHECK_TYPES = [
 { value: 'OPENING', label: 'Sebelum mula jualan' },
 { value: 'MID_SHIFT', label: 'Pertengahan syif' },
 { value: 'CLOSE_SHIFT', label: 'Tutup syif' },
] as const;

const PRESENCE_REASONS: Array<{ value: PosPresenceReason; label: string; helper: string }> = [
 { value: 'REST', label: 'Rehat', helper: 'Dikira dalam elaun 1 jam' },
 { value: 'MEAL', label: 'Makan', helper: 'Dikira dalam elaun 1 jam' },
 { value: 'PRAYER', label: 'Solat', helper: 'Dikira dalam elaun 1 jam' },
 { value: 'TOILET', label: 'Tandas', helper: 'Dikira dalam elaun 1 jam' },
 { value: 'STOCK_PICKUP', label: 'Ambil stok', helper: 'Tidak potong masa rehat' },
 { value: 'OTHER', label: 'Lain-lain', helper: 'Dikira dalam elaun 1 jam' },
];

const STOCK_CHECK_LABEL: Record<PosShiftStockCheckType, string> = {
 OPENING: 'sebelum jualan',
 MID_SHIFT: 'pertengahan syif',
 CLOSE_SHIFT: 'tutup syif',
};

const SALES_SCOPE_CODES = new Set<string>([...HQ_STOCK_ITEM_CODES]);
const SALES_ROTI_CODE_ORDER = new Map<string, number>(HQ_ROTI_ITEM_CODES.map((code, index) => [code, index]));
const SALES_CORE_MATERIAL_CODES = ['ST-KAYA', 'ST-BUTTER'] as const;
const SALES_COUNT_CODE_ORDER = new Map<string, number>(
 [...HQ_ROTI_ITEM_CODES, ...SALES_CORE_MATERIAL_CODES].map((code, index) => [code, index]));
const KIOSK_EQUIPMENT_GROUPS: KioskEquipmentGroup[] = [
 {
 key: 'Peralatan Jualan',
 label: 'Peralatan Jualan',
 description: 'Perkakas wajib untuk potong, sapu dan sedia roti.',
 icon: PackagePlus,
 accent: 'border-emerald-200 bg-emerald-50 text-emerald-950',
 items: [
 { code: 'EQ-PISAU', name: 'Pisau', category: 'Peralatan Jualan', unit: 'UNIT' },
 { code: 'EQ-PISAU-BUTTER', name: 'Pisau Butter', category: 'Peralatan Jualan', unit: 'UNIT' },
 { code: 'EQ-BEKAS-BUTTER', name: 'Bekas Butter', category: 'Peralatan Jualan', unit: 'UNIT' },
 { code: 'EQ-BOILER', name: 'Boiler', category: 'Peralatan Jualan', unit: 'UNIT' },
 { code: 'EQ-PAPAN-PEMOTONG', name: 'Papan Pemotong', category: 'Peralatan Jualan', unit: 'UNIT' },
 { code: 'EQ-SUDIP', name: 'Sudip', category: 'Peralatan Jualan', unit: 'UNIT' },
 ],
 },
 {
 key: 'Kebersihan',
 label: 'Kebersihan Kiosk',
 description: 'Barang kebersihan dan keselamatan operasi kiosk.',
 icon: ShieldCheck,
 accent: 'border-sky-200 bg-sky-50 text-sky-950',
 items: [
 { code: 'EQ-KAIN-LAP', name: 'Kain Lap', category: 'Kebersihan', unit: 'UNIT' },
 { code: 'EQ-PENYAPU', name: 'Penyapu', category: 'Kebersihan', unit: 'UNIT' },
 { code: 'EQ-PENYODOK', name: 'Penyodok', category: 'Kebersihan', unit: 'UNIT' },
 { code: 'EQ-SABUN-CERMIN', name: 'Sabun Cermin', category: 'Kebersihan', unit: 'BOTOL' },
 { code: 'EQ-SABUN-CECAIR', name: 'Sabun Cecair', category: 'Kebersihan', unit: 'BOTOL' },
 { code: 'EQ-SABUN-SERBUK', name: 'Sabun Serbuk', category: 'Kebersihan', unit: 'BUNGKUS' },
 { code: 'EQ-TONG-SAMPAH', name: 'Tong Sampah', category: 'Kebersihan', unit: 'UNIT' },
 { code: 'EQ-SARUNG-TANGAN', name: 'Sarung Tangan', category: 'Kebersihan', unit: 'PASANG' },
 { code: 'EQ-PENYAPU-HABUK', name: 'Penyapu Habuk', category: 'Kebersihan', unit: 'UNIT' },
 { code: 'EQ-TISU', name: 'Tisu', category: 'Kebersihan', unit: 'PACK' },
 ],
 },
 {
 key: 'Rekod & Sokongan',
 label: 'Rekod & Sokongan',
 description: 'Keperluan rekod, kiraan dan operasi luar kiosk.',
 icon: ClipboardCheck,
 accent: 'border-amber-200 bg-amber-50 text-amber-950',
 items: [
 { code: 'EQ-BUKU', name: 'Buku', category: 'Rekod & Sokongan', unit: 'UNIT' },
 { code: 'EQ-PEN', name: 'Pen', category: 'Rekod & Sokongan', unit: 'UNIT' },
 { code: 'EQ-KALKULATOR', name: 'Kalkulator', category: 'Rekod & Sokongan', unit: 'UNIT' },
 { code: 'EQ-KANVAS', name: 'Kanvas', category: 'Rekod & Sokongan', unit: 'UNIT' },
 ],
 },
];
const KIOSK_EQUIPMENT_ITEMS = KIOSK_EQUIPMENT_GROUPS.flatMap((group) => group.items);
const KIOSK_EQUIPMENT_CODES = KIOSK_EQUIPMENT_ITEMS.map((item) => item.code);

function normalizeCode(code?: string | null) {
 return String(code ?? '').trim().toUpperCase();
}

function byCodeOrder(order: Map<string, number>) {
 return (a: StockItemOption, b: StockItemOption) => {
 const aOrder = order.get(normalizeCode(a.item_code)) ?? 999;
 const bOrder = order.get(normalizeCode(b.item_code)) ?? 999;
 if (aOrder !== bOrder) return aOrder - bOrder;
 return itemName(a).localeCompare(itemName(b));
 };
}

function isRawMaterialItem(item: StockItemOption) {
 const code = normalizeCode(item.item_code);
 const category = String(item.category ?? '').toLowerCase();
 return code.startsWith('RM-') || category.includes('bahan mentah') || category.includes('raw');
}

function isPackagingItem(item: StockItemOption) {
 const code = normalizeCode(item.item_code);
 const category = String(item.category ?? '').toLowerCase();
 return code.includes('PLASTIC') || code.startsWith('PKG-') || category.includes('packaging') || category.includes('pembungkusan');
}

function itemCatalogCategory(item: StockItemOption) {
 return getStockByCode(normalizeCode(item.item_code))?.category ?? item.category ?? null;
}

function getStockCountGroups(items: StockItemOption[], scope: StockCountScope): StockCountGroup[] {
 if (scope === 'factory') {
 const rawMaterials = items.filter(isRawMaterialItem).sort((a, b) => itemName(a).localeCompare(itemName(b)));
 const packaging = items
 .filter((item) => isPackagingItem(item) && !isRawMaterialItem(item))
 .sort((a, b) => itemName(a).localeCompare(itemName(b)));

 const groups: StockCountGroup[] = [
 {
 key: 'factory_raw',
 label: 'Bahan Mentah Kilang',
 description: 'Tepung, gula, garam, gas dan bahan production.',
 icon: Factory,
 accent: 'border-orange-200 bg-orange-50 text-orange-950',
 items: rawMaterials,
 },
 {
 key: 'factory_packaging',
 label: 'Packaging Kilang',
 description: 'Plastik dan bahan pembungkusan untuk production.',
 icon: Boxes,
 accent: 'border-sky-200 bg-sky-50 text-sky-950',
 items: packaging,
 },
 ];
 return groups.filter((group) => group.items.length > 0);
 }

 const salesItems = items.filter((item) => SALES_SCOPE_CODES.has(normalizeCode(item.item_code)));
 const roti = salesItems
 .filter((item) => SALES_ROTI_CODE_ORDER.has(normalizeCode(item.item_code)) || itemCatalogCategory(item) === 'Roti')
 .sort(byCodeOrder(SALES_ROTI_CODE_ORDER));
 const coreMaterials = salesItems
 .filter((item) => (SALES_CORE_MATERIAL_CODES as readonly string[]).includes(normalizeCode(item.item_code)))
 .sort(byCodeOrder(SALES_COUNT_CODE_ORDER));
 const groups: StockCountGroup[] = [
 {
 key: 'sales_roti',
 label: 'Stok Jualan Roti',
 description: 'Roti jualan yang perlu dikira ikut production date.',
 icon: ShoppingBasket,
 accent: 'border-emerald-200 bg-emerald-50 text-emerald-950',
 items: roti,
 },
 {
 key: 'sales_material',
 label: 'Kaya & Butter',
 description: 'Kaya ikut production date; Butter stok supplier untuk operasi jualan.',
 icon: Boxes,
 accent: 'border-amber-200 bg-amber-50 text-amber-950',
 items: coreMaterials,
 },
 ];
 return groups.filter((group) => group.items.length > 0);
}

function getScopedStockItems(items: StockItemOption[], scope: StockCountScope) {
 return getStockCountGroups(items, scope).flatMap((group) => group.items);
}

function todayIso() {
 return new Date().toISOString().slice(0, 10);
}

function itemName(item?: StockItemOption | null) {
 if (!item) return '';
 const code = normalizeCode(item.item_code);
 const name = String(item.name ?? '').trim();
 if (code && name) return `${code} - ${name}`;
 return name || code || 'Item stok';
}

function statusVariant(status: string) {
 if (status === 'DRIVER_DROPPED' || status === 'DISCREPANCY_PENDING_APPROVAL') return 'destructive' as const;
 if (status === 'STAFF_CONFIRMED' || status === 'PENDING') return 'secondary' as const;
 return 'outline' as const;
}

function formatMinutes(value?: number | null) {
 const total = Math.max(0, Math.round(Number(value ?? 0)));
 const hours = Math.floor(total / 60);
 const minutes = total % 60;
 if (hours > 0 && minutes > 0) return `${hours}j ${minutes}m`;
 if (hours > 0) return `${hours}j`;
 return `${minutes}m`;
}

function formatQuantity(value: number) {
 const quantity = Number(value);
 if (!Number.isFinite(quantity)) return '0';
 return new Intl.NumberFormat('ms-MY', { maximumFractionDigits: 2 }).format(quantity);
}

function quantityInputValue(value: number) {
 const quantity = Number(value);
 if (!Number.isFinite(quantity)) return '';
 return String(Number(quantity.toFixed(2)));
}

type StockCountInputMode = 'bag_pcs' | 'tong_kg' | 'unit';

type StockCountPackMeta = {
 mode: StockCountInputMode;
 baseUnit: string;
 packUnit: string;
 packQuantity: number;
 conversionText: string;
};

function stockCountPackMeta(stock?: StockItemOption | null): StockCountPackMeta {
 const catalog = getStockByCode(normalizeCode(stock?.item_code));
 const baseUnit = String(stock?.base_unit ?? catalog?.base_unit ?? 'PCS').toUpperCase();
 const packUnit = String(stock?.pack_unit ?? catalog?.pack_unit ?? '').toUpperCase();
 const packQuantity = Number(stock?.pack_quantity ?? catalog?.pack_quantity ?? 0);
 const conversionText = String(stock?.conversion_text ?? catalog?.conversion_text ?? '');

 if (packQuantity > 0 && baseUnit === 'PCS' && packUnit === 'BAG') {
 return { mode: 'bag_pcs', baseUnit, packUnit, packQuantity, conversionText };
 }

 if (packQuantity > 0 && baseUnit === 'GRAM' && packUnit === 'TONG') {
 return { mode: 'tong_kg', baseUnit, packUnit, packQuantity, conversionText };
 }

 return { mode: 'unit', baseUnit, packUnit, packQuantity: 0, conversionText };
}

function splitPackedQuantity(quantity: string | number, meta: StockCountPackMeta) {
 const total = Math.max(0, Number(quantity) || 0);
 if (meta.packQuantity <= 0) return { packs: 0, loose: total };
 const packs = Math.floor(total / meta.packQuantity);
 const loose = total - packs * meta.packQuantity;
 return {
 packs,
 loose: Number(loose.toFixed(2)),
 };
}

function formatPackedStockQuantity(quantity: number, stock?: StockItemOption | null, fallbackUnit = 'PCS') {
 const meta = stockCountPackMeta(stock);
 const total = Math.max(0, Number(quantity) || 0);

 if (meta.mode === 'bag_pcs') {
 const { packs, loose } = splitPackedQuantity(total, meta);
 return `${packs} bag ${formatQuantity(loose)} pcs`;
 }

 if (meta.mode === 'tong_kg') {
 const { packs, loose } = splitPackedQuantity(total, meta);
 return `${packs} tong ${formatQuantity(loose / 1000)} kg`;
 }

 return `${formatQuantity(total)} ${fallbackUnit || meta.baseUnit}`;
}

function emptyLine(firstItemId = '', firstUnit = 'PCS', productionDate = todayIso()): Line {
 return { stock_item_id: firstItemId, quantity: '', unit: firstUnit, note: '', production_date: productionDate };
}

function emptyRequestLine(item: KioskEquipmentItem = KIOSK_EQUIPMENT_ITEMS[0]): RequestLine {
 return { item_code: item.code, item_name: item.name, quantity: '', unit: item.unit, note: '' };
}

function equipmentName(item?: KioskEquipmentItem | null) {
 if (!item) return '';
 return `${item.code} - ${item.name}`;
}

export function PosStockSopPanel({
 branchId,
 onSuccess,
 onOpenRejectStock,
}: {
 branchId: string;
 onSuccess?: (event?: { action: PosStockSopSuccessAction; requiresManagerApproval?: boolean }) => void;
 onOpenRejectStock?: () => void;
}) {
 const profile = useAuthStore((s) => s.profile);
 const [data, setData] = useState<PosStockSopResponse | null>(null);
 const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
 const [loading, setLoading] = useState(true);
 const [savingId, setSavingId] = useState<string | null>(null);
 const [receiptQty, setReceiptQty] = useState<Record<string, Record<string, string>>>({});
 const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
 const [checkType, setCheckType] = useState<(typeof CHECK_TYPES)[number]['value']>('MID_SHIFT');
 const [productionDate, setProductionDate] = useState(todayIso());
 const [checkNotes, setCheckNotes] = useState('');
 const [checkLines, setCheckLines] = useState<Line[]>([emptyLine()]);
 const [presenceReason, setPresenceReason] = useState<PosPresenceReason>('REST');
 const [presenceNotes, setPresenceNotes] = useState('');
 const [requestPriority, setRequestPriority] = useState<'LOW' | 'NORMAL' | 'URGENT'>('NORMAL');
 const [requestNeededBy, setRequestNeededBy] = useState('');
 const [requestNotes, setRequestNotes] = useState('');
 const [requestLines, setRequestLines] = useState<RequestLine[]>([emptyRequestLine()]);
 const [showSecondaryTools, setShowSecondaryTools] = useState(false);

 const stockById = useMemo(() => {
 const map = new Map<string, StockItemOption>();
 stockItems.forEach((item) => map.set(item.id, item));
 return map;
 }, [stockItems]);

 const stockCountGroups = useMemo(() => getStockCountGroups(stockItems, 'sales'), [stockItems]);
 const visibleStockItems = useMemo(() => stockCountGroups.flatMap((group) => group.items), [stockCountGroups]);
 const visibleStockIds = useMemo(() => visibleStockItems.map((item) => item.id), [visibleStockItems]);
 const visibleStockIdSet = useMemo(() => new Set(visibleStockIds), [visibleStockIds]);
 const firstVisibleStock = visibleStockItems[0] ?? null;
 const sopStatus = data?.sopStatus;
 const requiredStockCheck = sopStatus?.required_stock_check ?? null;
 const activeLeave = sopStatus?.active_leave ?? null;
 const canBypassPosSop = profile?.role === 'SUPER_ADMIN';
 const aiStockEstimate = data?.stockEstimate ?? null;
 const aiEstimateByStockId = useMemo(() => {
 const map = new Map<string, PosStockEstimateItem>();
 (aiStockEstimate?.items ?? []).forEach((item) => map.set(item.stock_item_id, item));
 return map;
 }, [aiStockEstimate]);
 const visibleAiEstimateItems = useMemo(
 () => (aiStockEstimate?.items ?? []).filter((item) => visibleStockIdSet.has(item.stock_item_id)),
 [aiStockEstimate, visibleStockIdSet]);

 const lineTracksProductionDate = useCallback((stock?: StockItemOption | null) => {
 if (!stock) return false;
 return tracksProductionDate(normalizeCode(stock.item_code));
 }, []);

 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const [sop, items] = await Promise.all([
 fetchPosStockSop(branchId),
 fetchStockItems(),
 ]);
 setData(sop);
 setStockItems(items.items);
 if (sop.sopStatus?.required_stock_check) {
 setCheckType(sop.sopStatus.required_stock_check);
 }

 const defaults: Record<string, Record<string, string>> = {};
 sop.receipts.forEach((receipt) => {
 defaults[receipt.id] = {};
 receipt.items?.forEach((item) => {
 defaults[receipt.id][item.id] = String(item.actual_quantity ?? item.expected_quantity ?? 0);
 });
 });
 setReceiptQty(defaults);

 const first = getScopedStockItems(items.items, 'sales')[0];
 if (first) {
 setCheckLines((rows) => rows.map((row) => row.stock_item_id ? row : emptyLine(first.id, first.base_unit)));
 }
 setRequestLines((rows) => rows.length ? rows : [emptyRequestLine()]);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan SOP stok POS');
 } finally {
 setLoading(false);
 }
 }, [branchId]);

 useEffect(() => {
 loadData();
 }, [loadData]);

 useEffect(() => {
 if (!firstVisibleStock || visibleStockItems.length === 0) return;
 const visibleIds = new Set(visibleStockItems.map((item) => item.id));
 const normalizeRows = (rows: Line[]) =>
 (rows.length ? rows : [emptyLine(firstVisibleStock.id, firstVisibleStock.base_unit, productionDate)]).map((row) =>
 row.stock_item_id && visibleIds.has(row.stock_item_id)
 ? row
 : emptyLine(firstVisibleStock.id, firstVisibleStock.base_unit, productionDate));

 setCheckLines((rows) => normalizeRows(rows));
 }, [firstVisibleStock, visibleStockItems, productionDate]);

 useEffect(() => {
 if (requiredStockCheck) {
 setCheckType(requiredStockCheck);
 }
 }, [requiredStockCheck]);

 useEffect(() => {
 if (!requiredStockCheck || visibleStockItems.length === 0) return;
 setCheckLines((rows) => {
 const current = new Map(rows.filter((row) => row.stock_item_id).map((row) => [row.stock_item_id, row]));
 return visibleStockItems.map((item) => current.get(item.id) ?? emptyLine(item.id, item.base_unit, productionDate));
 });
 }, [requiredStockCheck, visibleStockItems, productionDate]);

 useEffect(() => {
 setRequestLines((rows) => (rows.length ? rows : [emptyRequestLine()]).map((row) => {
 const item = KIOSK_EQUIPMENT_ITEMS.find((equipment) => equipment.code === row.item_code) ?? KIOSK_EQUIPMENT_ITEMS[0];
 return item ? { ...row, item_code: item.code, item_name: item.name, unit: row.unit || item.unit } : row;
 }));
 }, []);

 function updateLine(
 rows: Line[],
 setRows: (rows: Line[]) => void,
 index: number,
 patch: Partial<Line>) {
 const next = rows.map((row, i) => {
 if (i !== index) return row;
 const stockItemId = patch.stock_item_id ?? row.stock_item_id;
 const stock = stockById.get(stockItemId);
 const shouldTrackProductionDate = lineTracksProductionDate(stock);
 return {
 ...row,
 ...patch,
 unit: patch.unit ?? stock?.base_unit ?? row.unit ?? 'PCS',
 production_date: shouldTrackProductionDate ? patch.production_date ?? row.production_date ?? productionDate : undefined,
 };
 });
 setRows(next);
 }

 function removeLine(rows: Line[], setRows: (rows: Line[]) => void, index: number) {
 setRows(rows.length <= 1 ? [emptyLine(firstVisibleStock?.id, firstVisibleStock?.base_unit, productionDate)] : rows.filter((_, i) => i !== index));
 }

 function updatePackedQuantity(index: number, line: Line, stock: StockItemOption | null | undefined, part: 'pack' | 'loose' | 'total', value: string) {
 const meta = stockCountPackMeta(stock);
 const current = splitPackedQuantity(line.quantity, meta);
 const numericValue = Math.max(0, Number(value) || 0);
 let total = numericValue;

 if (part === 'pack') {
 total = numericValue * Math.max(1, meta.packQuantity) + current.loose;
 } else if (part === 'loose') {
 const looseBase = meta.mode === 'tong_kg' ? numericValue * 1000 : numericValue;
 total = current.packs * Math.max(1, meta.packQuantity) + looseBase;
 }

 updateLine(checkLines, setCheckLines, index, {
 quantity: quantityInputValue(total),
 unit: stock?.base_unit ?? meta.baseUnit,
 });
 }

 function handleProductionDateChange(value: string) {
 const currentDate = productionDate;
 setProductionDate(value);
 setCheckLines((rows) => rows.map((row) => {
 const stock = stockById.get(row.stock_item_id);
 if (!lineTracksProductionDate(stock)) return row;
 return {
 ...row,
 production_date: !row.production_date || row.production_date === currentDate ? value : row.production_date,
 };
 }));
 }

 function appendStockGroup(group: StockCountGroup) {
 setCheckLines((rows) => {
 const filledRows = rows.filter((row) => row.stock_item_id);
 const additions = group.items.map((item) => emptyLine(item.id, item.base_unit, productionDate));

 if (!additions.length) return rows;
 return filledRows.length ? [...filledRows, ...additions] : additions;
 });
 }

 function appendStockLine(stock?: StockItemOption | null) {
 const item = stock ?? firstVisibleStock;
 if (!item) return;
 const line = emptyLine(item.id, item.base_unit, productionDate);
 setCheckLines((rows) => {
 const blankOnly = rows.length === 1 && !rows[0].stock_item_id && !rows[0].quantity;
 return blankOnly ? [line] : [...rows, line];
 });
 }

 function applyAiEstimateDraft() {
 if (!visibleAiEstimateItems.length) {
 toast.error('Belum ada anggaran AI daripada tutup syif terakhir. Buat kiraan fizikal dahulu.');
 return;
 }

 setCheckLines(visibleAiEstimateItems.map((item) => {
 const stock = stockById.get(item.stock_item_id);
 return {
 stock_item_id: item.stock_item_id,
 quantity: quantityInputValue(item.estimated_quantity),
 unit: item.unit || stock?.base_unit || 'PCS',
 note: 'Anggaran AI - staf wajib kira fizikal sebenar',
 production_date: lineTracksProductionDate(stock) ? aiStockEstimate?.production_date ?? productionDate : undefined,
 };
 }));
 toast.success('Anggaran AI dimasukkan sebagai draf. Staf wajib kira stok fizikal sebenar sebelum hantar.');
 }

 function updateRequestLine(index: number, patch: Partial<RequestLine>) {
 setRequestLines((rows) => rows.map((row, i) => {
 if (i !== index) return row;
 const itemCode = patch.item_code ?? row.item_code;
 const item = KIOSK_EQUIPMENT_ITEMS.find((equipment) => equipment.code === itemCode);
 return {
 ...row,
 ...patch,
 item_code: item?.code ?? itemCode,
 item_name: patch.item_name ?? item?.name ?? row.item_name,
 unit: patch.unit ?? item?.unit ?? row.unit ?? 'UNIT',
 };
 }));
 }

 function removeRequestLine(index: number) {
 setRequestLines((rows) => rows.length <= 1 ? [emptyRequestLine()] : rows.filter((_, i) => i !== index));
 }

 function appendEquipmentGroup(group: KioskEquipmentGroup) {
 setRequestLines((rows) => {
 const filledRows = rows.filter((row) => row.item_code);
 const existing = new Set(filledRows.map((row) => row.item_code));
 const additions = group.items
 .filter((item) => !existing.has(item.code))
 .map((item) => emptyRequestLine(item));

 if (!additions.length) return rows;
 return filledRows.length ? [...filledRows, ...additions] : additions;
 });
 }

 async function handleConfirmReceipt(receipt: PosStockReceipt) {
 const items = receipt.items ?? [];
 if (!items.length) {
 toast.error('Tiada item untuk disahkan');
 return;
 }

 const payloadItems = items.map((item) => ({
 receipt_item_id: item.id,
 stock_item_id: item.stock_item_id,
 actual_quantity: Number(receiptQty[receipt.id]?.[item.id] ?? item.expected_quantity ?? 0),
 note: item.staff_note ?? undefined,
 }));

 if (payloadItems.some((item) => Number.isNaN(item.actual_quantity) || item.actual_quantity < 0)) {
 toast.error('Kuantiti sebenar mesti nombor yang sah');
 return;
 }

 setSavingId(receipt.id);
 try {
 const { result } = await confirmPosStockDelivery({
 branch_id: branchId,
 receipt_id: receipt.id,
 items: payloadItems,
 notes: receiptNotes[receipt.id] || undefined,
 });
 const hasMismatch = Boolean(result.has_mismatch);
 toast.success(
 hasMismatch
 ? 'Beza stok dihantar untuk kelulusan AM/OM'
 : 'Stok disahkan dan masuk ke POS');
 await loadData();
 onSuccess?.({ action: 'confirm_delivery' });
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal sahkan stok');
 } finally {
 setSavingId(null);
 }
 }

 async function handleLeaveStart() {
 setSavingId('leave-start');
 try {
 await startPosPresenceLeave({
 branch_id: branchId,
 shift_id: data?.sopStatus?.shift_id ?? undefined,
 reason: presenceReason,
 notes: presenceNotes || undefined,
 });
 toast.success('Keluar kiosk direkod. Tekan kembali sebaik staf masuk semula.');
 setPresenceNotes('');
 await loadData();
 onSuccess?.({ action: 'leave_start' });
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal rekod keluar kiosk');
 } finally {
 setSavingId(null);
 }
 }

 async function handleLeaveReturn(presenceId: string) {
 setSavingId('leave-return');
 try {
 const { result } = await returnPosPresenceLeave({
 branch_id: branchId,
 presence_id: presenceId,
 });
 const excess = Number(result.excess_minutes ?? 0);
 toast.success(
 excess > 0
 ? `Kembali direkod. ${formatMinutes(excess)} melebihi elaun rehat untuk payroll.`
 : 'Kembali kiosk direkod.');
 await loadData();
 onSuccess?.({ action: 'leave_return' });
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal rekod kembali kiosk');
 } finally {
 setSavingId(null);
 }
 }

 function cleanStockCountLines(rows: Line[]) {
 return rows
 .map((row) => {
 const stock = stockById.get(row.stock_item_id);
 const quantity = Number(row.quantity);
 const itemCode = normalizeCode(stock?.item_code);
 const shouldTrackProductionDate = lineTracksProductionDate(stock);
 return {
 stock_item_id: row.stock_item_id,
 unit: row.unit || stock?.base_unit || 'PCS',
 note: row.note || undefined,
 item_code: itemCode || undefined,
 item_name: stock?.name,
 counted_quantity: quantity,
 production_date: shouldTrackProductionDate ? row.production_date || productionDate : undefined,
 };
 })
 .filter((row) => {
 return row.stock_item_id && visibleStockIdSet.has(row.stock_item_id) && Number.isFinite(row.counted_quantity) && row.counted_quantity >= 0;
 });
 }

 function cleanRequestLines(rows: RequestLine[]) {
 return rows
 .map((row) => {
 const item = KIOSK_EQUIPMENT_ITEMS.find((equipment) => equipment.code === row.item_code);
 const quantity = Number(row.quantity);
 return {
 item_code: item?.code ?? row.item_code,
 item_name: item?.name ?? row.item_name,
 request_category: item?.category ?? 'Peralatan Kiosk',
 quantity,
 unit: row.unit || item?.unit || 'UNIT',
 note: row.note || undefined,
 };
 })
 .filter((row) => {
 return row.item_code && KIOSK_EQUIPMENT_CODES.includes(row.item_code) && Number.isFinite(row.quantity) && row.quantity > 0;
 });
 }

 async function handleStockCheck() {
 const hasPendingDriverDelivery = (data?.receipts ?? []).some(
 (receipt) => receipt.status === 'DRIVER_DROPPED' || receipt.status === 'DISCREPANCY_PENDING_APPROVAL');
 if (checkType === 'OPENING' && hasPendingDriverDelivery && !canBypassPosSop) {
 toast.error('Sahkan penerimaan stok driver dahulu sebelum kiraan stok pembukaan dan jualan POS.');
 return;
 }
 const items = cleanStockCountLines(checkLines) as Array<{
 stock_item_id: string;
 counted_quantity: number;
 unit?: string;
 item_code?: string;
 production_date?: string;
 item_name?: string;
 note?: string;
 }>;
 if (!items.length) {
 toast.error('Masukkan item dan kuantiti kiraan stok');
 return;
 }
 setSavingId('stock-check');
 try {
 const { result } = await submitPosStockCheck({
 branch_id: branchId,
 shift_id: data?.sopStatus?.shift_id ?? undefined,
 check_type: checkType,
 production_date: productionDate || undefined,
 notes: checkNotes || undefined,
 items,
 });
 const requiresManagerApproval = Boolean(
 (result as { requires_manager_approval?: boolean })?.requires_manager_approval);
 if (requiresManagerApproval) {
 toast.warning('Kiraan stok diterima. Ada beza daripada anggaran AI, jadi AM/OM perlu sahkan sebelum stok menjadi rasmi.');
 } else {
 toast.success('Kiraan stok disahkan. POS kembali ke Jualan.');
 }
 setCheckNotes('');
 setCheckLines([emptyLine(firstVisibleStock?.id, firstVisibleStock?.base_unit, productionDate)]);
 await loadData();
 onSuccess?.({ action: 'stock_check', requiresManagerApproval });
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar kiraan stok');
 } finally {
 setSavingId(null);
 }
 }

 async function handleSupplyRequest() {
 const items = cleanRequestLines(requestLines);
 if (!items.length) {
 toast.error('Masukkan peralatan/perkakas dan kuantiti request');
 return;
 }
 setSavingId('supply-request');
 try {
 await submitPosSupplyRequest({
 branch_id: branchId,
 priority: requestPriority,
 needed_by: requestNeededBy || undefined,
 notes: requestNotes || undefined,
 items,
 });
 toast.success('Request barang dihantar kepada AM/OM');
 setRequestNotes('');
 setRequestNeededBy('');
 setRequestPriority('NORMAL');
 setRequestLines([emptyRequestLine()]);
 await loadData();
 onSuccess?.({ action: 'supply_request' });
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar request barang');
 } finally {
 setSavingId(null);
 }
 }

 const receipts = data?.receipts ?? [];
 const activeReceipts = receipts.filter((r) => r.status === 'DRIVER_DROPPED' || r.status === 'DISCREPANCY_PENDING_APPROVAL');
 const selectedPresenceReason = PRESENCE_REASONS.find((reason) => reason.value === presenceReason);
 const shiftIsOpen = Boolean(sopStatus?.shift_id);
 const deliveryIsRequired = activeReceipts.length > 0;
 const stockCheckIsRequired = Boolean(requiredStockCheck);
 const openingStockLockedByDelivery =
 deliveryIsRequired && requiredStockCheck === 'OPENING' && !canBypassPosSop;
 const normalMode = shiftIsOpen && !activeLeave && !deliveryIsRequired && !stockCheckIsRequired;
 const showPresencePanel = shiftIsOpen && (Boolean(activeLeave) || showSecondaryTools);
 const showDeliveryPanel = deliveryIsRequired || showSecondaryTools;
 const showStockCheckPanel = !openingStockLockedByDelivery && (stockCheckIsRequired || showSecondaryTools);
 const showRequestPanel = showSecondaryTools;
 const showRecordPanel = showSecondaryTools;
 const focusTone = !shiftIsOpen || activeLeave || deliveryIsRequired || stockCheckIsRequired
 ? 'border-amber-200 bg-amber-50 text-amber-950'
 : 'border-emerald-200 bg-emerald-50 text-emerald-950';
 const focusTitle = !shiftIsOpen
 ? 'Buka syif POS dahulu'
 : activeLeave
 ? 'Staf masih keluar kiosk'
 : deliveryIsRequired
 ? 'Sahkan stok driver dahulu'
 : stockCheckIsRequired
 ? `Buat kiraan stok ${STOCK_CHECK_LABEL[requiredStockCheck as PosShiftStockCheckType]}`
 : 'POS sedia untuk jualan';
 const focusDescription = !shiftIsOpen
 ? 'Tekan Buka Syif pada bar POS di atas. Selepas syif dibuka, sistem akan tunjuk tugasan wajib seterusnya.'
 : activeLeave
 ? 'Tekan butang Staf kembali ke kiosk dahulu. Jualan disambung selepas masa keluar direkod lengkap.'
 : deliveryIsRequired
 ? `Ada ${activeReceipts.length} penghantaran stok belum disahkan. Sahkan jumlah sebenar driver dahulu; selepas itu sistem akan minta kiraan stok pembukaan sebelum jualan dibuka.`
 : stockCheckIsRequired
 ? canBypassPosSop
 ? 'SOP sebenar: staf perlu kira stok fizikal ikut production date. Dalam mode testing Pentadbir Utama, sistem hanya beri makluman dan benarkan tuan teruskan.'
 : 'Kira stok roti, kaya dan butter secara fizikal ikut production date. AI boleh bantu anggaran, tetapi staf wajib confirm jumlah sebenar.'
 : 'Tiada tugasan wajib. Fokus kepada jualan. Guna Tindakan tambahan hanya jika perlu keluar kiosk atau request barang.';

 if (loading) {
 return (
 <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
 Memuatkan SOP stok POS...
 </div>);
 }

 return (
 <div className="space-y-4">
 <div className={cn('rounded-2xl border p-4 shadow-sm', focusTone)}>
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm">
 {normalMode ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
 </div>
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Tugasan POS sekarang</p>
 <h3 className="mt-1 text-xl font-bold">{focusTitle}</h3>
 <p className="mt-1 max-w-3xl text-sm opacity-85">{focusDescription}</p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 {onOpenRejectStock && (
 <Button
 type="button"
 size="sm"
 className="bg-red-600 text-white hover:bg-red-700"
 onClick={onOpenRejectStock}
 >
 <Trash2 className="mr-2 h-4 w-4" />
 Reject Stok Rosak / Expired
 </Button>)}
 <Button variant="outline" size="sm" className="bg-white/80" onClick={loadData}>
 <RefreshCw className="mr-2 h-4 w-4" />
 Refresh
 </Button>
 <Button
 type="button"
 variant={showSecondaryTools ? 'secondary' : 'outline'}
 size="sm"
 className="bg-white/80"
 onClick={() => setShowSecondaryTools((value) => !value)}
 >
 {showSecondaryTools ? 'Sorok tambahan' : 'Tindakan tambahan'}
 </Button>
 </div>
 </div>
 </div>

 {(showSecondaryTools || showPresencePanel) && (
 <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
 {showSecondaryTools && (
 <div className="rounded-2xl border bg-card p-4 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
 <Brain className="h-4 w-4" />
 AI SOP stok syif
 </div>
 <h3 className="mt-1 text-lg font-bold">Kiraan stok wajib ikut production date</h3>
 <p className="mt-1 text-sm text-muted-foreground">
 {canBypassPosSop
 ? 'Pentadbir Utama dalam mode testing hanya diberi makluman. Staf biasa tetap akan ditahan jika kiraan wajib atau stok driver belum disahkan.'
 : 'POS akan tahan jualan jika kiraan wajib belum selesai atau stok driver belum disahkan.'}
 </p>
 </div>
 {requiredStockCheck && (
 <Badge variant="destructive" className="px-3 py-1">
 Wajib kira {STOCK_CHECK_LABEL[requiredStockCheck]}
 </Badge>)}
 </div>
 <div className="mt-4 grid gap-3 md:grid-cols-3">
 {CHECK_TYPES.map((type) => {
 const done =
 type.value === 'OPENING'
 ? sopStatus?.opening_done
 : type.value === 'MID_SHIFT'
 ? sopStatus?.mid_shift_done
 : sopStatus?.close_shift_done;
 const isRequired = requiredStockCheck === type.value;
 return (
 <button
 key={type.value}
 type="button"
 onClick={() => setCheckType(type.value)}
 className={cn(
 'rounded-xl border p-3 text-left transition hover:border-amber-400',
 done && 'border-emerald-200 bg-emerald-50 text-emerald-950',
 isRequired && 'border-red-300 bg-red-50 text-red-950',
 !done && !isRequired && 'bg-background')}
 >
 <div className="flex items-center justify-between gap-2">
 <p className="text-sm font-bold">{type.label}</p>
 {done ? (
 <CheckCircle2 className="h-4 w-4 text-emerald-600" />
 ) : isRequired ? (
 <AlertTriangle className="h-4 w-4 text-red-600" />
 ) : (
 <Clock3 className="h-4 w-4 text-muted-foreground" />
 )}
 </div>
 <p className="mt-1 text-xs opacity-75">
 {done ? 'Selesai direkod' : isRequired ? 'Perlu dibuat sekarang' : 'Belum wajib'}
 </p>
 </button>);
 })}
 </div>
 </div>
 )}

 {showPresencePanel && (
 <div className={cn(
 'rounded-2xl border p-4 shadow-sm',
 activeLeave ? 'border-orange-300 bg-orange-50 text-orange-950' : 'bg-card')}
 >
 <div className="flex items-start gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
 <Brain className="h-5 w-5 text-amber-600" />
 </div>
 <div className="min-w-0 flex-1">
 <h3 className="font-bold">AI kawal staf di POS</h3>
 <p className="text-sm text-muted-foreground">
 Rehat/makan/solat/tandas digabung maksimum 1 jam sehari. Ambil stok tidak dipotong.
 </p>
 </div>
 </div>
 <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
 <div className="rounded-xl border bg-white/80 p-3">
 <p className="text-xs text-muted-foreground">Digunakan</p>
 <p className="text-lg font-bold">{formatMinutes(sopStatus?.break_used_minutes)}</p>
 </div>
 <div className="rounded-xl border bg-white/80 p-3">
 <p className="text-xs text-muted-foreground">Baki elaun</p>
 <p className="text-lg font-bold">{formatMinutes(sopStatus?.break_balance_minutes)}</p>
 </div>
 <div className="rounded-xl border bg-white/80 p-3">
 <p className="text-xs text-muted-foreground">Status</p>
 <p className="text-lg font-bold">{activeLeave ? 'Keluar' : 'Di POS'}</p>
 </div>
 <div className="rounded-xl border bg-white/80 p-3">
 <p className="text-xs text-muted-foreground">Semakan AI</p>
 <p className="text-lg font-bold">{sopStatus?.presence_check_today_count ?? 0}</p>
 <p className={cn(
 'mt-0.5 text-xs',
 Number(sopStatus?.presence_check_missed_count ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground')}
 >
 {sopStatus?.presence_check_missed_count ?? 0} gagal respon
 </p>
 </div>
 </div>

 {activeLeave ? (
 <div className="mt-4 rounded-xl border border-orange-300 bg-white p-3">
 <p className="font-semibold">
 Staf keluar: {PRESENCE_REASONS.find((reason) => reason.value === activeLeave.reason)?.label ?? activeLeave.reason}
 </p>
 <p className="text-sm text-muted-foreground">
 Masa berjalan {formatMinutes(activeLeave.minutes_now)}. {activeLeave.payroll_deductible ? 'Dikira dalam 1 jam harian.' : 'Tidak dipotong kerana ambil stok.'}
 </p>
 {activeLeave.notes && <p className="mt-1 text-sm">{activeLeave.notes}</p>}
 <Button
 className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700"
 onClick={() => handleLeaveReturn(activeLeave.id)}
 disabled={savingId === 'leave-return'}
 >
 <LogIn className="mr-2 h-4 w-4" />
 {savingId === 'leave-return' ? 'Merekod...' : 'Staf kembali ke kiosk'}
 </Button>
 </div>
 ) : (
 <div className="mt-4 space-y-3">
 <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
 <div className="space-y-1.5">
 <Label>Sebab keluar</Label>
 <Select value={presenceReason} onValueChange={(value) => setPresenceReason(value as PosPresenceReason)}>
 <SelectTrigger className="bg-white">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {PRESENCE_REASONS.map((reason) => (
 <SelectItem key={reason.value} value={reason.value}>
 {reason.label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>Catatan ringkas</Label>
 <Input
 value={presenceNotes}
 onChange={(e) => setPresenceNotes(e.target.value)}
 placeholder="Contoh: solat zohor / ambil stok di HQ"
 />
 </div>
 </div>
 <p className="text-xs text-muted-foreground">
 {selectedPresenceReason?.helper}
 </p>
 <Button
 variant="outline"
 className="w-full bg-white"
 onClick={handleLeaveStart}
 disabled={savingId === 'leave-start'}
 >
 <LogOut className="mr-2 h-4 w-4" />
 {savingId === 'leave-start' ? 'Merekod...' : 'Rekod keluar kiosk'}
 </Button>
 </div>
 )}

 {(sopStatus?.recent_leaves ?? []).length > 0 && (
 <div className="mt-4 space-y-2">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rekod hari ini</p>
 {(sopStatus?.recent_leaves ?? []).slice(0, 4).map((leave) => (
 <div key={leave.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white/70 px-3 py-2 text-xs">
 <span>
 {PRESENCE_REASONS.find((reason) => reason.value === leave.reason)?.label ?? leave.reason}
 {leave.payroll_deductible ? '' : ' - tidak potong'}
 </span>
 <span className="font-semibold">
 {leave.status === 'OUT' ? 'Sedang keluar' : formatMinutes(leave.duration_minutes)}
 {leave.excess_minutes > 0 ? ` +${formatMinutes(leave.excess_minutes)} potong` : ''}
 </span>
 </div>))}
 </div>)}

 {(sopStatus?.recent_presence_checks ?? []).length > 0 && (
 <div className="mt-4 space-y-2">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Presence Check hari ini</p>
 {(sopStatus?.recent_presence_checks ?? []).slice(0, 4).map((check) => (
 <div key={check.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white/70 px-3 py-2 text-xs">
 <span>
 {check.status === 'CONFIRMED' ? 'Disahkan di POS' : 'Tidak dijawab'}
 {check.response_seconds ? ` - ${Math.round(Number(check.response_seconds))}s` : ''}
 </span>
 <span className={cn('font-semibold', check.status === 'MISSED' ? 'text-red-600' : 'text-emerald-700')}>
 {new Date(check.prompted_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
 </span>
 </div>))}
 </div>)}
 </div>
 )}
 </div>
 )}

 {showDeliveryPanel && (
 <div className={cn(
 'rounded-2xl border p-4',
 activeReceipts.length
 ? 'border-red-200 bg-red-50 text-red-950'
 : 'border-emerald-200 bg-emerald-50 text-emerald-950')}
 >
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex gap-3">
 <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">
 {activeReceipts.length ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
 </div>
 <div>
 <p className="font-bold">
 {activeReceipts.length ? 'Stok delivery perlu disahkan sebelum jualan' : 'Tiada stok delivery tertunggak'}
 </p>
 <p className="mt-1 text-sm opacity-80">
 Jika driver hantar ketika kedai tutup, staf syif pertama wajib sahkan jumlah sebenar di sini dahulu. Selepas semua delivery disahkan, sistem akan buka kiraan stok pembukaan sebelum jualan POS dibenarkan.
 </p>
 </div>
 </div>
 <Button variant="outline" size="sm" className="bg-white/80" onClick={loadData}>
 <RefreshCw className="mr-2 h-4 w-4" />
 Refresh
 </Button>
 </div>
 </div>
 )}

 {showDeliveryPanel && (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Truck className="h-5 w-5 text-amber-600" />
 Penerimaan Stok Driver
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {receipts.length === 0 ? (
 <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
 Tiada penghantaran driver yang menunggu pengesahan staf.
 </div>) : (
 receipts.map((receipt, receiptIndex) => (
 <div key={receipt.id} className="rounded-2xl border bg-background p-4 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-bold">Penghantaran driver #{receiptIndex + 1}</p>
 <Badge variant={statusVariant(receipt.status)}>
 {STATUS_LABELS[receipt.status] ?? receipt.status}
 </Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 Driver: {receipt.driver?.full_name ?? receipt.delivered_by_profile?.full_name ?? 'Belum direkod'}
 {receipt.delivered_at ? ` - ${new Date(receipt.delivered_at).toLocaleString('ms-MY')}` : ''}
 </p>
 </div>
 {receipt.status === 'STAFF_CONFIRMED' && (
 <Badge variant="secondary" className="gap-1">
 <CheckCircle2 className="h-3.5 w-3.5" />
 Stok sudah masuk POS
 </Badge>)}
 </div>

 <div className="mt-4 grid gap-2">
 {(receipt.items ?? []).map((item) => {
 const expected = Number(item.expected_quantity ?? 0);
 const actual = receiptQty[receipt.id]?.[item.id] ?? String(expected);
 const mismatch = Number(actual) !== expected;
 return (
 <div key={item.id} className={cn(
 'grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_120px_120px]',
 mismatch && 'border-orange-300 bg-orange-50/70')}
 >
 <div>
 <p className="font-medium">{item.stock_item?.name ?? 'Item stok tidak dikenal pasti'}</p>
 <p className="text-xs text-muted-foreground">
 {item.stock_item?.item_code} {item.production_date ? `- Production ${item.production_date}` : ''}
 </p>
 </div>
 <div>
 <Label className="text-xs text-muted-foreground">Driver update</Label>
 <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm font-semibold tabular-nums">
 {expected} {item.unit}
 </p>
 </div>
 <div>
 <Label className="text-xs text-muted-foreground">Staf sahkan</Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 value={actual}
 disabled={receipt.status !== 'DRIVER_DROPPED'}
 onChange={(e) =>
 setReceiptQty((current) => ({
 ...current,
 [receipt.id]: { ...(current[receipt.id] ?? {}), [item.id]: e.target.value },
 }))}
 className="mt-1 h-10 font-semibold tabular-nums"
 />
 </div>
 </div>);
 })}
 </div>

 <div className="mt-3 space-y-2">
 <Label className="text-xs text-muted-foreground">Nota staf (jika perlu)</Label>
 <Textarea
 rows={2}
 disabled={receipt.status !== 'DRIVER_DROPPED'}
 placeholder="Contoh: driver hantar 10 bag, staf kira 9 bag sebab 1 bag rosak / tiada."
 value={receiptNotes[receipt.id] ?? ''}
 onChange={(e) => setReceiptNotes((current) => ({ ...current, [receipt.id]: e.target.value }))}
 />
 </div>

 {receipt.status === 'DRIVER_DROPPED' && (
 <div className="mt-3 flex justify-end">
 <Button
 className="bg-emerald-600 hover:bg-emerald-700"
 onClick={() => handleConfirmReceipt(receipt)}
 disabled={savingId === receipt.id}
 >
 <PackageCheck className="mr-2 h-4 w-4" />
 {savingId === receipt.id ? 'Menyimpan...' : 'Sahkan stok diterima'}
 </Button>
 </div>)}
 </div>)))}
 </CardContent>
 </Card>
 )}

 {showStockCheckPanel && (
 <div className="grid gap-4 xl:grid-cols-2">
 <Card className="overflow-hidden border-emerald-200 shadow-sm">
 <CardHeader className="border-b bg-gradient-to-r from-emerald-50 via-white to-amber-50 pb-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <CardTitle className="flex items-center gap-2">
 <ClipboardCheck className="h-5 w-5 text-emerald-600" />
 SOP Staf - Kiraan Stok POS
 </CardTitle>
 <p className="mt-1 text-sm text-muted-foreground">
 Selesaikan kiraan ringkas di bawah. Isi ikut unit sebenar kiosk: roti dalam bag/pcs, kaya dan butter dalam tong/kg.
 </p>
 </div>
 <Badge variant="outline" className="gap-1 bg-white px-3 py-1.5 text-emerald-700">
 <ShoppingBasket className="h-3.5 w-3.5" />
 {CHECK_TYPES.find((type) => type.value === checkType)?.label ?? 'Kiraan stok'}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 {showSecondaryTools && (
 <div className="grid gap-2 sm:grid-cols-3">
 {stockCountGroups.map((group) => {
 const Icon = group.icon;
 return (
 <button
 key={group.key}
 type="button"
 onClick={() => appendStockGroup(group)}
 className={cn(
 'rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm',
 group.accent)}
 >
 <div className="flex items-center justify-between gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 shadow-sm">
 <Icon className="h-4 w-4" />
 </div>
 <span className="text-lg font-bold">{group.items.length}</span>
 </div>
 <p className="mt-2 font-bold">{group.label}</p>
 <p className="mt-1 text-xs opacity-75">{group.description}</p>
 <p className="mt-2 text-xs font-semibold">Tekan untuk tambah semua item</p>
 </button>);
 })}
 </div>
 )}

 {visibleStockItems.length === 0 && (
 <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
 Tiada stok jualan POS dijumpai. Semak Tetapan Stok untuk roti, ST-KAYA dan ST-BUTTER.
 </div>)}

 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Jenis pengesahan</Label>
 {showSecondaryTools ? (
 <Select value={checkType} onValueChange={(value) => setCheckType(value as typeof checkType)}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {CHECK_TYPES.map((type) => (
 <SelectItem key={type.value} value={type.value}>
 {type.label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 ) : (
 <div className="flex min-h-10 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold">
 {CHECK_TYPES.find((type) => type.value === checkType)?.label ?? 'Kiraan stok'}
 </div>)}
 </div>
 <div className="space-y-1.5">
 <Label>Production date</Label>
 <Input type="date" value={productionDate} onChange={(e) => handleProductionDateChange(e.target.value)} />
 <p className="text-xs text-muted-foreground">
 Tarikh ini digunakan sebagai default untuk Roti Kaya, Roti Kelapa, Roti Kacang, Roti Benggali dan Kaya.
 </p>
 </div>
 </div>

 <div className={cn(
 'rounded-2xl border p-4 shadow-sm',
 aiStockEstimate
 ? 'border-violet-200 bg-violet-50/70 text-violet-950'
 : 'border-dashed bg-muted/30 text-muted-foreground')}
 >
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
 <Brain className="h-5 w-5 text-violet-700" />
 </div>
 <div>
 <p className="font-bold">AI Anggaran Stok POS</p>
 {aiStockEstimate ? (
 <p className="mt-1 text-sm opacity-80">
 {aiStockEstimate.source === 'LAST_CLOSE_SHIFT'
 ? `Berdasarkan tutup syif terakhir ${aiStockEstimate.count_number}`
 : 'Berdasarkan stok semasa sistem POS'}
 {aiStockEstimate.production_date ? `, production ${aiStockEstimate.production_date}` : ''}
 {aiStockEstimate.completed_by_name ? ` oleh ${aiStockEstimate.completed_by_name}` : ''}.
 </p>
 ) : (
 <p className="mt-1 text-sm">
 Belum ada rekod tutup syif untuk dijadikan anggaran. Staf perlu kira stok manual dahulu.
 </p>)}
 </div>
 </div>
 <Button
 type="button"
 variant="outline"
 className="bg-white"
 onClick={applyAiEstimateDraft}
 disabled={!visibleAiEstimateItems.length}
 >
 <Brain className="mr-2 h-4 w-4" />
 Guna anggaran AI
 </Button>
 </div>

 {visibleAiEstimateItems.length > 0 && (
 <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
 {visibleAiEstimateItems.map((item) => (
 <div key={item.stock_item_id} className="min-w-0 rounded-xl border border-violet-200 bg-white/85 px-3 py-2 text-sm">
 <div className="flex min-w-0 items-center justify-between gap-3">
 <span className="min-w-0 truncate font-semibold">{item.item_code} - {item.item_name}</span>
 <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold tabular-nums text-violet-800">
 {formatPackedStockQuantity(item.estimated_quantity, stockById.get(item.stock_item_id), item.unit)}
 </span>
 </div>
 </div>))}
 </div>)}

 <p className="mt-3 rounded-xl border border-violet-200 bg-white/70 px-3 py-2 text-xs font-medium leading-relaxed">
 AI hanya isi draf. Staf wajib kira stok fizikal sebenar sebelum hantar; beza daripada AI akan dihantar kepada AM/OM untuk pengesahan.
 </p>
 </div>

 <div className="space-y-2">
 {checkLines.map((line, index) => {
 const selectedStock = visibleStockItems.find((item) => item.id === line.stock_item_id);
 const estimate = aiEstimateByStockId.get(line.stock_item_id);
 const selectValue = boundSelectValue(line.stock_item_id, visibleStockIds) ?? '';
 const trackProductionDate = lineTracksProductionDate(selectedStock);
 const packMeta = stockCountPackMeta(selectedStock);
 const packedQuantity = splitPackedQuantity(line.quantity, packMeta);
 const looseInputValue =
 packMeta.mode === 'tong_kg'
 ? quantityInputValue(packedQuantity.loose / 1000)
 : quantityInputValue(packedQuantity.loose);
 const officialQuantity = Number(line.quantity || 0);
 const estimateLabel = estimate
 ? formatPackedStockQuantity(estimate.estimated_quantity, selectedStock, estimate.unit)
 : null;
 const batchAge = trackProductionDate && (line.production_date ?? productionDate)
 ? productionAgeDays(line.production_date ?? productionDate)
 : null;
 const batchAgeValid = typeof batchAge === 'number' && Number.isFinite(batchAge);
 const batchExpired = batchAgeValid && batchAge > ROTI_SHELF_LIFE_DAYS;
 return (
 <div key={`check-${index}`} className="grid gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-emerald-200 xl:grid-cols-[minmax(260px,1fr)_180px_minmax(280px,1fr)_48px]">
 <Select
 value={selectValue}
 onValueChange={(value) => updateLine(checkLines, setCheckLines, index, { stock_item_id: String(value ?? '') })}
 >
 <SelectTrigger className="h-11 w-full bg-white">
 <span className="min-w-0 flex-1 truncate text-left font-semibold">
 {selectedStock ? itemName(selectedStock) : 'Pilih item'}
 </span>
 </SelectTrigger>
 <SelectContent>
 {stockCountGroups.map((group) => (
 <SelectGroup key={group.key}>
 <SelectLabel>{group.label}</SelectLabel>
 {group.items.map((item) => (
 <SelectItem key={item.id} value={item.id}>
 {itemName(item)}
 </SelectItem>))}
 </SelectGroup>))}
 </SelectContent>
 </Select>
 {trackProductionDate ? (
 <Input
 type="date"
 className="h-11 bg-white"
 value={line.production_date ?? productionDate}
 onChange={(e) => updateLine(checkLines, setCheckLines, index, { production_date: e.target.value })}
 aria-label={`Production date ${selectedStock ? itemName(selectedStock) : 'item'}`}
 />
 ) : (
 <div className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
 Supplier
 </div>
 )}
 <div className="rounded-xl border bg-muted/20 p-3">
 {packMeta.mode === 'bag_pcs' ? (
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label className="text-xs font-semibold text-muted-foreground">Bag</Label>
 <Input
 className="h-11 bg-white text-lg font-semibold tabular-nums"
 type="number"
 min="0"
 step="1"
 inputMode="numeric"
 value={String(packedQuantity.packs)}
 onChange={(e) => updatePackedQuantity(index, line, selectedStock, 'pack', e.target.value)}
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs font-semibold text-muted-foreground">Pcs</Label>
 <Input
 className="h-11 bg-white text-lg font-semibold tabular-nums"
 type="number"
 min="0"
 step="1"
 inputMode="numeric"
 value={looseInputValue}
 onChange={(e) => updatePackedQuantity(index, line, selectedStock, 'loose', e.target.value)}
 />
 </div>
 </div>
 ) : packMeta.mode === 'tong_kg' ? (
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label className="text-xs font-semibold text-muted-foreground">Tong</Label>
 <Input
 className="h-11 bg-white text-lg font-semibold tabular-nums"
 type="number"
 min="0"
 step="1"
 inputMode="numeric"
 value={String(packedQuantity.packs)}
 onChange={(e) => updatePackedQuantity(index, line, selectedStock, 'pack', e.target.value)}
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs font-semibold text-muted-foreground">Kg</Label>
 <Input
 className="h-11 bg-white text-lg font-semibold tabular-nums"
 type="number"
 min="0"
 step="0.01"
 inputMode="decimal"
 value={looseInputValue}
 onChange={(e) => updatePackedQuantity(index, line, selectedStock, 'loose', e.target.value)}
 />
 </div>
 </div>
 ) : (
 <Input
 className="h-11 bg-white text-lg font-semibold tabular-nums"
 type="number"
 min="0"
 step="0.01"
 placeholder={estimate ? `AI ${formatQuantity(estimate.estimated_quantity)} ${estimate.unit}` : 'Qty'}
 value={line.quantity}
 onChange={(e) => updatePackedQuantity(index, line, selectedStock, 'total', e.target.value)}
 />
 )}
 <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">
 Jumlah rasmi: {formatPackedStockQuantity(officialQuantity, selectedStock, line.unit)}
 {packMeta.conversionText ? ` - ${packMeta.conversionText}` : ''}
 </p>
 </div>
 <Button className="h-11 w-full xl:w-11" variant="outline" size="icon" onClick={() => removeLine(checkLines, setCheckLines, index)} aria-label="Buang item kiraan">
 <Trash2 className="h-4 w-4" />
 </Button>
 {estimate && (
 <p className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 xl:col-span-4">
 Cadangan AI: {estimateLabel}
 {aiStockEstimate?.source === 'LAST_CLOSE_SHIFT' ? ' dari tutup syif terakhir' : ' dari stok semasa sistem'}.
 Staf boleh ubah ikut kiraan sebenar di kiosk.
 </p>)}
 {trackProductionDate && (
 <div className={cn(
 'flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs xl:col-span-4',
 batchExpired
 ? 'border border-red-200 bg-red-50 text-red-900'
 : 'bg-emerald-50 text-emerald-900')}
 >
 <span>
 {batchExpired
 ? `Batch melebihi ${ROTI_SHELF_LIFE_DAYS} hari dari production - asingkan dan buat reject stok, jangan jual.`
 : `Batch item ini disimpan ikut production date${batchAgeValid ? ` (umur ${Math.max(0, batchAge)} hari)` : ''}.`}
 </span>
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-8 bg-white"
 onClick={() => appendStockLine(selectedStock)}
 >
 <Plus className="mr-1.5 h-3.5 w-3.5" />
 Batch tarikh lain
 </Button>
 </div>)}
 </div>);
 })}
 </div>
 <Button
 type="button"
 variant="outline"
 className="w-full border-dashed"
 onClick={() => appendStockLine()}
 disabled={!firstVisibleStock}
 >
 <Plus className="mr-2 h-4 w-4" />
 Tambah item / batch production date lain
 </Button>
 <Textarea
 rows={2}
 placeholder="Nota kiraan, contoh: closing stok production 2026-06-30 disahkan oleh staf syif malam."
 value={checkNotes}
 onChange={(e) => setCheckNotes(e.target.value)}
 />
 <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleStockCheck} disabled={savingId === 'stock-check'}>
 {savingId === 'stock-check' ? 'Menghantar...' : 'Hantar kiraan stok'}
 </Button>
 </CardContent>
 </Card>

 {showRequestPanel && (
 <Card className="overflow-hidden border-amber-200">
 <CardHeader className="border-b bg-gradient-to-r from-amber-50 via-white to-sky-50">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <CardTitle className="flex items-center gap-2">
 <PackagePlus className="h-5 w-5 text-amber-600" />
 Request Peralatan/Perkakas Kiosk
 </CardTitle>
 <p className="mt-1 text-sm text-muted-foreground">
 Senarai ini ikut fail SENARAI DOKUMEN DAN PERALATAN: peralatan jualan, kebersihan, rekod dan sokongan kiosk.
 </p>
 </div>
 <Badge variant="outline" className="bg-white px-3 py-1.5">
 Keperluan Kiosk
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid gap-2 sm:grid-cols-3">
 {KIOSK_EQUIPMENT_GROUPS.map((group) => {
 const Icon = group.icon;
 return (
 <button
 key={`request-${group.key}`}
 type="button"
 onClick={() => appendEquipmentGroup(group)}
 className={cn(
 'rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm',
 group.accent)}
 >
 <div className="flex items-center gap-2">
 <Icon className="h-4 w-4" />
 <span className="text-sm font-bold">{group.label}</span>
 </div>
 <p className="mt-1 text-xs opacity-75">{group.items.length} item tersedia</p>
 </button>);
 })}
 </div>

 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Priority</Label>
 <Select value={requestPriority} onValueChange={(value) => setRequestPriority(value as typeof requestPriority)}>
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="LOW">Rendah</SelectItem>
 <SelectItem value="NORMAL">Normal</SelectItem>
 <SelectItem value="URGENT">Segera</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>Tarikh diperlukan</Label>
 <Input type="date" value={requestNeededBy} onChange={(e) => setRequestNeededBy(e.target.value)} />
 </div>
 </div>
 <div className="space-y-2">
 {requestLines.map((line, index) => {
 const selectedEquipment = KIOSK_EQUIPMENT_ITEMS.find((item) => item.code === line.item_code);
 const selectValue = boundSelectValue(line.item_code, KIOSK_EQUIPMENT_CODES) ?? '';
 return (
 <div key={`request-${index}`} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_110px_44px]">
 <Select
 value={selectValue}
 onValueChange={(value) => updateRequestLine(index, { item_code: String(value ?? '') })}
 >
 <SelectTrigger className="w-full">
 <span className="min-w-0 flex-1 truncate text-left">
 {selectedEquipment ? equipmentName(selectedEquipment) : 'Pilih item'}
 </span>
 </SelectTrigger>
 <SelectContent>
 {KIOSK_EQUIPMENT_GROUPS.map((group) => (
 <SelectGroup key={group.key}>
 <SelectLabel>{group.label}</SelectLabel>
 {group.items.map((item) => (
 <SelectItem key={item.code} value={item.code}>
 {equipmentName(item)}
 </SelectItem>))}
 </SelectGroup>))}
 </SelectContent>
 </Select>
 <Input
 type="number"
 min="0"
 step="0.01"
 placeholder="Qty"
 value={line.quantity}
 onChange={(e) => updateRequestLine(index, { quantity: e.target.value })}
 />
 <Button variant="outline" size="icon" onClick={() => removeRequestLine(index)}>
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>);
 })}
 </div>
 <Button
 type="button"
 variant="outline"
 className="w-full"
 onClick={() => setRequestLines([...requestLines, emptyRequestLine()])}
 >
 <Plus className="mr-2 h-4 w-4" />
 Tambah item request
 </Button>
 <Textarea
 rows={2}
 placeholder="Contoh: Pisau Butter rosak, perlu gantian sebelum syif petang."
 value={requestNotes}
 onChange={(e) => setRequestNotes(e.target.value)}
 />
 <Button className="w-full" onClick={handleSupplyRequest} disabled={savingId === 'supply-request'}>
 {savingId === 'supply-request' ? 'Menghantar...' : 'Hantar request barang'}
 </Button>
 </CardContent>
 </Card>
 )}
 </div>
 )}

 {showRecordPanel && (
 <div className="grid gap-4 lg:grid-cols-2">
 <Card>
 <CardHeader>
 <CardTitle>Rekod request barang</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {(data?.supplyRequests ?? []).length === 0 ? (
 <p className="text-sm text-muted-foreground">Belum ada request barang.</p>) : (
 data?.supplyRequests.map((request) => (
 <div key={request.id} className="rounded-xl border p-3 text-sm">
 <div className="flex items-center justify-between gap-2">
 <p className="font-medium">{request.notes || 'Request barang POS'}</p>
 <Badge variant={statusVariant(request.status)}>{STATUS_LABELS[request.status] ?? request.status}</Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {new Date(request.created_at).toLocaleString('ms-MY')} - {request.priority}
 </p>
 </div>)))}
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Rekod kiraan stok</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {(data?.stockChecks ?? []).length === 0 ? (
 <p className="text-sm text-muted-foreground">Belum ada kiraan stok.</p>) : (
 data?.stockChecks.map((check) => (
 <div key={check.id} className="rounded-xl border p-3 text-sm">
 <div className="flex items-center justify-between gap-2">
 <p className="font-medium">{check.count_number}</p>
 <Badge variant={statusVariant(check.status)}>{STATUS_LABELS[check.status] ?? check.status}</Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {new Date(check.created_at).toLocaleString('ms-MY')}
 {check.notes ? ` - ${check.notes}` : ''}
 </p>
 </div>)))}
 </CardContent>
 </Card>
 </div>
 )}
 </div>);
}
