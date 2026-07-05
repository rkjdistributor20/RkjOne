'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, User, TrendingUp, CalendarDays } from 'lucide-react';
import type { MalaysiaHolidayInWindow, OrderSuggestionBranch } from '@/lib/production/types';
import { formatHolidayDate, formatHolidayType } from '@/lib/production/holiday-labels';
import { HQ_FACTORY_ORDER_SECTIONS, getHqOrderUnitLabel } from '@/lib/production/hq-order-format';
import { driversForRegion } from '@/lib/production/driver-routing';
import {
 HQ_STOCK_ITEM_CODES,
 getStockByCode,
 resolveRejectToBaseQuantity,
} from '@/lib/stock/catalog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type BranchQtyMap = Record<string, Record<string, string>>;
export type BranchDriverMap = Record<string, string>;

export interface DriverOption {
 id: string;
 driver_code: string;
 full_name: string;
}

interface HqBranchOrderMatrixProps {
 branches: OrderSuggestionBranch[];
 branchCount?: number;
 orderLeadDays?: number;
 stockCoverageDays?: number;
 orderDeadlineNote?: string;
 holidayDemandBoost?: number;
 holidaysInWindow?: MalaysiaHolidayInWindow[];
 quantities: BranchQtyMap;
 branchDrivers: BranchDriverMap;
 onChange: (quantities: BranchQtyMap) => void;
 onDriverChange: (drivers: BranchDriverMap) => void;
 drivers?: DriverOption[];
 disabled?: boolean;
}

const REGION_LABELS: Record<string, string> = {
 UTARA: 'Utara',
 TENGAH: 'Tengah',
 SELATAN: 'Selatan',
};

const STOCK_STATUS_CLASS: Record<string, string> = {
 CRITICAL: 'border-red-300 bg-red-50',
 LOW: 'border-amber-300 bg-amber-50',
 OK: 'border-border bg-background',
};

function suggestedQty(item: OrderSuggestionBranch['items'][number]): number {
 return item.suggested_order_qty ?? item.suggested_bags ?? 0;
}

export function HqBranchOrderMatrix({
 branches,
 branchCount,
 orderLeadDays,
 stockCoverageDays,
 orderDeadlineNote,
 holidayDemandBoost,
 holidaysInWindow,
 quantities,
 branchDrivers,
 onChange,
 onDriverChange,
 drivers,
 disabled,
}: HqBranchOrderMatrixProps) {
 const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({
 UTARA: true,
 TENGAH: true,
 SELATAN: true,
 });
 const [loadedDrivers, setLoadedDrivers] = useState<DriverOption[]>([]);
 const allDrivers = drivers ?? loadedDrivers;

 useEffect(() => {
 if (drivers) return;
 fetch('/api/fleet/drivers').then((r) => r.json()).then((d) => setLoadedDrivers(d.drivers ?? [])).catch(() => setLoadedDrivers([]));
 }, [drivers]);

 const byRegion = useMemo(() => {
 const map = new Map<string, OrderSuggestionBranch[]>();
 for (const b of branches) {
 const region = (b.region_code ?? 'LAIN').toUpperCase();
 const list = map.get(region) ?? [];
 list.push(b);
 map.set(region, list);
 }
 for (const [, list] of map) {
 list.sort((a, b) => a.branch_code.localeCompare(b.branch_code));
 }
 return map;
 }, [branches]);

 const totalSuggestedLines = useMemo(() => {
 let n = 0;
 for (const b of branches) {
 for (const item of b.items) {
 if (suggestedQty(item) > 0) n += 1;
 }
 }
 return n;
 }, [branches]);

 function setQty(branchId: string, itemCode: string, value: string) {
 onChange({...quantities,
 [branchId]: { ...(quantities[branchId] ?? {}), [itemCode]: value },
 });
 }

 function setDriver(branchId: string, driverId: string) {
 onDriverChange({...branchDrivers, [branchId]: driverId });
 }

 function applySuggestion(branch: OrderSuggestionBranch) {
 const next = { ...quantities, [branch.branch_id]: { ...(quantities[branch.branch_id] ?? {}) } };
 for (const item of branch.items) {
 const qty = suggestedQty(item);
 if (qty > 0) {
 next[branch.branch_id][item.item_code] = String(qty);
 }
 }
 onChange(next);
 const suggestedDriver = branch.default_driver_id || driversForRegion(allDrivers, branch.region_code)[0]?.id;
 if (suggestedDriver) onDriverChange({...branchDrivers, [branch.branch_id]: suggestedDriver });
 }

 function applyAllDrivers() {
 const next = {...branchDrivers };
 for (const b of branches) {
 const suggestedDriver = b.default_driver_id || driversForRegion(allDrivers, b.region_code)[0]?.id;
 if (suggestedDriver) next[b.branch_id] = suggestedDriver;
 }
 onDriverChange(next);
 }

 if (branches.length === 0) {
 return (
 <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
 Tiada cawangan dijumpai - pastikan 36 kiosk cawangan wujud dalam sistem.
 </p>);
 }

 return (
 <div className="space-y-3">
 {(orderDeadlineNote || (holidaysInWindow?.length ?? 0) > 0) && (
 <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
 <p className="flex flex-wrap items-center gap-2 font-semibold">
 <CalendarDays className="h-4 w-4" />
 Perancangan stok lebuhraya
 {orderLeadDays != null && (
 <Badge variant="secondary" className="text-[10px]">
 {orderLeadDays} hari sebelum stok baharu
 </Badge>)}
 {holidayDemandBoost != null && holidayDemandBoost > 1.05 && (
 <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-900">
 Lonjakan cuti ×{holidayDemandBoost}
 </Badge>)}
 </p>
 {orderDeadlineNote && (
 <p className="mt-1 text-xs text-amber-900/90">{orderDeadlineNote}</p>)}
 {(holidaysInWindow?.length ?? 0) > 0 && (
 <div className="mt-2 flex flex-wrap gap-1.5">
 {holidaysInWindow!.slice(0, 8).map((h) => (
 <Badge
 key={`${h.date}-${h.name}`}
 variant="outline"
 className="text-[10px] font-normal"
 title={`Pengganda permintaan ×${h.demand_multiplier}`}
 >
 {formatHolidayDate(h.date)} - {h.name} ({formatHolidayType(h.type)})
 </Badge>))}
 {(holidaysInWindow?.length ?? 0) > 8 && (
 <Badge variant="secondary" className="text-[10px]">
 +{(holidaysInWindow?.length ?? 0) ?? 8} lagi
 </Badge>)}
 </div>)}
 {stockCoverageDays != null && stockCoverageDays > 0 && (
 <p className="mt-1.5 text-[10px] text-amber-800/80">
 Sasaran stok merangkumi {stockCoverageDays} hari selepas terima stok + cuti umum,
 cuti sekolah, festif &amp; puncak hujung minggu lebuhraya.
 </p>)}
 </div>)}

 <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-950">
 <p className="flex flex-wrap items-center gap-2 font-semibold">
 <TrendingUp className="h-4 w-4" />
 {branchCount ?? branches.length} cawangan - {totalSuggestedLines} baris cadangan AI
 </p>
 <p className="mt-1 text-xs text-violet-900/80">
 Order sekali gus per cawangan: <strong>roti + bahan + packaging</strong> - driver hantar
 ikut keperluan masing-masing kiosk. Klik <strong>Cadangan</strong> atau guna butang di
 atas.
 </p>
 </div>

 <div className="flex flex-wrap gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="gap-1 text-xs"
 onClick={applyAllDrivers}
 disabled={disabled || allDrivers.length === 0}
 title={allDrivers.length === 0 ? 'Tiada driver aktif untuk ditugaskan' : undefined}
 >
 <User className="h-3 w-3" />
 Auto-tugaskan driver ikut kawasan
 </Button>
 </div>

 {[...byRegion.entries()].map(([region, regionBranches]) => (
 <div key={region} className="overflow-hidden rounded-xl border bg-card">
 <button
 type="button"
 className="flex w-full items-center justify-between bg-muted/40 px-4 py-3 text-left"
 onClick={() => setOpenRegions((p) => ({...p, [region]: !p[region] }))}
 >
 <span className="font-semibold">
 {REGION_LABELS[region] ?? region} - {regionBranches.length} cawangan
 </span>
 {openRegions[region] ? (
 <ChevronDown className="h-4 w-4" />) : (
 <ChevronRight className="h-4 w-4" />)}
 </button>

 {openRegions[region] && (
 <div className="divide-y">
 {regionBranches.map((branch) => {
 const regionDrivers = driversForRegion(allDrivers, branch.region_code);
 const selectedDriver =
 branchDrivers[branch.branch_id] ?? branch.default_driver_id ?? '';
 const driverChoices = regionDrivers.length > 0 ? regionDrivers : allDrivers;
 const safeSelectedDriver = driverChoices.some((driver) => driver.id === selectedDriver)
 ? selectedDriver
 : '';
 const branchSuggested = branch.items.reduce((s, i) => s + suggestedQty(i), 0);

 return (
 <div key={branch.branch_id} className="px-4 py-3">
 <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
 <div className="min-w-0 flex-1">
 <p className="font-medium">{branch.branch_name}</p>
 <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
 <span>{branch.branch_code}</span>
 {branch.potential_factor != null && (
 <Badge variant="secondary" className="text-[10px]">
 Potensi x{branch.potential_factor}
 </Badge>)}
 {branch.branch_status === 'INACTIVE' && (
 <Badge variant="outline" className="text-[10px]">
 Tidak aktif
 </Badge>)}
 {branch.has_kiosk === false && (
 <Badge variant="destructive" className="text-[10px]">
 Tiada kiosk
 </Badge>)}
 {branch.avg_daily_sales != null && branch.avg_daily_sales > 0 && (
 <span>RM{branch.avg_daily_sales}/hari</span>)}
 {branchSuggested > 0 && (
 <span className="text-violet-700">AI: {branchSuggested} item</span>)}
 </p>
 </div>
 <select
 className="h-9 max-w-[200px] rounded-md border bg-background px-2 text-xs"
 disabled={disabled}
 value={safeSelectedDriver}
 onChange={(e) => setDriver(branch.branch_id, e.target.value)}
 >
 <option value="">Pilih driver...</option>
 {allDrivers.length === 0 && (
 <option value="" disabled>
 Tiada driver aktif didaftarkan
 </option>)}
 {regionDrivers.length === 0 && allDrivers.length > 0 && (
 <option value="" disabled>
 Tiada driver khusus kawasan - pilih dari semua driver
 </option>)}
 {driverChoices.map((d) => (
 <option key={d.id} value={d.id}>
 {d.full_name} ({d.driver_code})
 </option>))}
 </select>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-8 gap-1 text-xs"
 disabled={disabled}
 onClick={() => applySuggestion(branch)}
 >
 <Sparkles className="h-3 w-3" />
 Cadangan
 </Button>
 </div>

 {HQ_FACTORY_ORDER_SECTIONS.map((section) => (
 <div key={section.id} className="mb-3 last:mb-0">
 <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
 {section.title}
 </p>
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
 {section.itemCodes.map((code) => {
 const hint = branch.items.find((i) => i.item_code === code);
 const val = quantities[branch.branch_id]?.[code] ?? '';
 const status = hint?.stock_status ?? 'OK';
 const unitLabel =
 hint?.order_unit_label ?? getHqOrderUnitLabel(code).toLowerCase();
 const def = getStockByCode(code);
 const step = def?.pack_unit === 'TONG' ? '0.5' : '1';

 return (
 <div
 key={code}
 className={cn(
 'rounded-lg border px-2 py-1.5',
 section.id === 'roti'
 ? STOCK_STATUS_CLASS[status] ?? STOCK_STATUS_CLASS.OK
 : 'border-border bg-background')}
 >
 <div className="mb-1 flex items-center justify-between gap-1">
 <span className="truncate text-xs font-medium">
 {hint?.name ?? code.replace('ST-', '')}
 </span>
 {section.id === 'roti' && status !== 'OK' && (
 <Badge
 variant={status === 'CRITICAL' ? 'destructive' : 'outline'}
 className="h-4 px-1 text-[9px]"
 >
 {status}
 </Badge>)}
 </div>
 <div className="flex items-center gap-2">
 <Input
 type="number"
 min="0"
 step={step}
 disabled={disabled}
 className="h-8 w-14 px-1 text-center text-sm tabular-nums"
 placeholder="0"
 value={val}
 onChange={(e) => setQty(branch.branch_id, code, e.target.value)}
 />
 <span className="text-[10px] text-muted-foreground">{unitLabel}</span>
 </div>
 {hint && (
 <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
 {section.id === 'roti' ? (
 <>
 Stok: <strong>{hint.current_pcs}</strong> pcs
 {hint.daily_pcs_estimate != null &&
 hint.daily_pcs_estimate > 0 && (
 <> - ~{hint.daily_pcs_estimate} pcs/hari</>)}
 </>) : (
 <>
 Baki: <strong>{Number(hint.current_pcs).toLocaleString('ms-MY')}</strong>{' '}
 {hint.unit === 'GRAM' ? 'g' : hint.unit.toLowerCase()}
 </>)}
 {suggestedQty(hint) > 0 && (
 <>
 {' '}
 - cadangan{' '}
 <strong className="text-violet-700">{suggestedQty(hint)}</strong>{' '}
 {unitLabel}
 </>)}
 </p>)}
 {hint?.prediction_note && section.id === 'roti' && (
 <p className="mt-0.5 text-[9px] leading-tight text-violet-800/80">
 {hint.prediction_note}
 </p>)}
 </div>);
 })}
 </div>
 </div>))}
 </div>);
 })}
 </div>)}
 </div>))}
 </div>);
}

export function buildBranchItemsFromMatrix(
 branches: OrderSuggestionBranch[],
 quantities: BranchQtyMap,
 branchDrivers: BranchDriverMap,
 stockIdByCode: Map<string, string>) {
 const items: Array<{
 branch_id: string;
 stock_item_id: string;
 quantity: number;
 unit?: string;
 assigned_driver_id?: string;
 }> = [];

 for (const branch of branches) {
 const driverId = branchDrivers[branch.branch_id] ?? branch.default_driver_id ?? undefined;
 for (const code of HQ_STOCK_ITEM_CODES) {
 const orderQty = Number(quantities[branch.branch_id]?.[code]) || 0;
 if (orderQty <= 0) continue;
 const stockItemId = stockIdByCode.get(code);
 if (!stockItemId) continue;
 const resolved = resolveRejectToBaseQuantity(code, orderQty, false);
 items.push({
 branch_id: branch.branch_id,
 stock_item_id: stockItemId,
 quantity: resolved.quantity,
 unit: resolved.unit,
 assigned_driver_id: driverId,
 });
 }
 }
 return items;
}
