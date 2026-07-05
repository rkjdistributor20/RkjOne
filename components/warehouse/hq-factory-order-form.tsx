'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Send, FileText, Sparkles, Clock, AlertTriangle, CalendarDays, ArrowRight } from 'lucide-react';
import type { StockItemOption } from '@/lib/inventory/types';
import type { OrderSuggestion, PublishedProductionDate } from '@/lib/production/types';
import { ORDER_PHASE_LABELS } from '@/lib/production/types';
import { fetchOrderSuggestion } from '@/lib/production/api';
import { driversForRegion } from '@/lib/production/driver-routing';
import {
 formatOrderCutoff,
 getOrderWindowCountdown,
 isCutoffPassed,
} from '@/lib/production/order-window';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
 HqBranchOrderMatrix,
 buildBranchItemsFromMatrix,
 type BranchQtyMap,
 type BranchDriverMap,
 type DriverOption,
} from '@/components/warehouse/hq-branch-order-matrix';

interface HqFactoryOrderFormProps {
 stockItems: StockItemOption[];
 publishedDates: PublishedProductionDate[];
 onSubmit: (payload: {
 production_date: string;
 items?: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
 branch_items?: Array<{
 branch_id: string;
 stock_item_id: string;
 quantity: number;
 unit?: string;
 assigned_driver_id?: string;
 }>;
 notes?: string;
 }) => Promise<{ order_id?: string } | void>;
}

export function HqFactoryOrderForm({
 stockItems,
 publishedDates,
 onSubmit,
}: HqFactoryOrderFormProps) {
 const [productionDate, setProductionDate] = useState('');
 const [branchQty, setBranchQty] = useState<BranchQtyMap>({});
 const [branchDrivers, setBranchDrivers] = useState<BranchDriverMap>({});
 const [notes, setNotes] = useState('');
 const [loading, setLoading] = useState(false);
 const [loadingSuggest, setLoadingSuggest] = useState(false);
 const [suggestion, setSuggestion] = useState<OrderSuggestion | null>(null);
 const [drivers, setDrivers] = useState<DriverOption[]>([]);

 const stockIdByCode = useMemo(() => {
 const map = new Map<string, string>();
 for (const item of stockItems) map.set(item.item_code, item.id);
 return map;
 }, [stockItems]);

 const selectedDayMeta = publishedDates.find((d) => d.production_date === productionDate);
 const windowOpen = selectedDayMeta?.window_open !== false && suggestion?.window_open !== false;
 const cutoffAt = selectedDayMeta?.cutoff_at ?? suggestion?.cutoff_at;

 useEffect(() => {
 if (!productionDate && publishedDates.length > 0) {
 const open = publishedDates.find((d) => d.window_open !== false) ?? publishedDates[0];
 setProductionDate(open.production_date);
 }
 }, [publishedDates, productionDate]);

 useEffect(() => {
 fetch('/api/fleet/drivers').then((r) => r.json()).then((d) => setDrivers(d.drivers ?? [])).catch(() => setDrivers([]));
 }, []);

 const loadSuggestion = useCallback(async (date: string) => {
 if (!date) return;
 setLoadingSuggest(true);
 try {
 const { suggestion: data } = await fetchOrderSuggestion(date);
 setSuggestion(data);
 } catch (err) {
 setSuggestion(null);
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan cadangan cawangan');
 } finally {
 setLoadingSuggest(false);
 }
 }, []);

 useEffect(() => {
 if (productionDate) {
 loadSuggestion(productionDate);
 setBranchQty({});
 setBranchDrivers({});
 }
 }, [productionDate, loadSuggestion]);

 function applyAllSuggestions() {
 if (!suggestion) return;
 const next: BranchQtyMap = {};
 for (const branch of suggestion.branches) {
 next[branch.branch_id] = {};
 for (const item of branch.items) {
 const qty = item.suggested_order_qty ?? item.suggested_bags;
 if (qty > 0) {
 next[branch.branch_id][item.item_code] = String(qty);
 }
 }
 }
 setBranchQty(next);

 const fd: BranchDriverMap = {...branchDrivers };
 for (const branch of suggestion.branches) {
 const suggestedDriver = branch.default_driver_id || driversForRegion(drivers, branch.region_code)[0]?.id;
 if (suggestedDriver) fd[branch.branch_id] = suggestedDriver;
 }
 setBranchDrivers(fd);
 }

 const branchItems = useMemo(() => {
 if (!suggestion) return [];
 return buildBranchItemsFromMatrix(suggestion.branches, branchQty, branchDrivers, stockIdByCode);
 }, [suggestion, branchQty, branchDrivers, stockIdByCode]);

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!productionDate || !windowOpen) return;
 if (branchItems.length === 0) return;

 setLoading(true);
 try {
 await onSubmit({
 production_date: productionDate,
 branch_items: branchItems,
 notes: notes.trim() || undefined,
 });
 setBranchQty({});
 setBranchDrivers({});
 setNotes('');
 loadSuggestion(productionDate);
 } finally {
 setLoading(false);
 }
 }

 if (publishedDates.length === 0) {
 return (
 <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-6 text-sm text-amber-950">
 <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
 <div className="max-w-2xl">
 <div className="flex items-center gap-2 font-bold">
 <CalendarDays className="h-5 w-5" />
 Tiada jadual production terbuka untuk pre-order
 </div>
 <p className="mt-2 leading-relaxed text-amber-900/80">
 Jadual yang diterbitkan sebelum ini sudah lepas atau sudah ditutup. Kilang perlu
 terbitkan minggu production akan datang dahulu, kemudian tarikh itu akan muncul
 di sini untuk HQ buat order ramalan/pre-order per cawangan.
 </p>
 <ol className="mt-3 list-decimal space-y-1 pl-5 text-amber-900">
 <li>Buka Kilang &gt; Jadual Production.</li>
 <li>Pilih minggu akan datang dan hari production.</li>
 <li>Tekan Terbitkan ke HQ, kemudian kembali ke Order Kilang.</li>
 </ol>
 </div>
 <Link href="/factory" className={buttonVariants({ className: 'shrink-0 gap-1 bg-amber-500 hover:bg-amber-600' })}>
 Buka Jadual Kilang
 <ArrowRight className="h-4 w-4" />
 </Link>
 </div>
 </div>);
 }

 return (
 <form onSubmit={handleSubmit} className="space-y-5">
 <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
 <div className="flex items-start gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
 <FileText className="h-5 w-5" />
 </div>
 <div>
 <p className="font-bold text-amber-950">Order Ramalan HQ ke Kilang (Semua Stok Per Cawangan)</p>
 <p className="mt-1 text-sm text-amber-900/80">
 Wajib isi <strong>roti + bahan + packaging per cawangan</strong> - driver hantar ikut
 keperluan masing-masing kiosk. Bila kilang sahkan, stok auto dihantar terus ke kiosk.
 Susun laluan driver sebelum muktamad.
 </p>
 </div>
 </div>
 </div>

 <div className="space-y-2">
 <Label className="text-sm font-semibold">1 Tarikh production kilang *</Label>
 <div className="flex flex-wrap gap-2">
 {publishedDates.map((d) => {
 const closed = d.window_open === false || d.orders_locked;
 const hasPrediction = d.has_prediction || d.order_phase === 'PREDICTION';
 return (
 <button
 key={d.production_date}
 type="button"
 disabled={closed}
 onClick={() => setProductionDate(d.production_date)}
 className={cn(
 'rounded-xl border-2 px-4 py-2.5 text-left text-sm transition-all',
 productionDate === d.production_date
 ? 'border-amber-500 bg-amber-500 text-white shadow-md'
 : closed
 ? 'cursor-not-allowed border-border bg-muted/50 opacity-60'
 : 'border-border bg-background hover:border-amber-300')}
 >
 <span className="font-semibold">{formatProductionDayLabel(d.production_date)}</span>
 {hasPrediction && !closed && (
 <span
 className={cn(
 'mt-0.5 block text-xs font-medium',
 productionDate === d.production_date ? 'text-white/90' : 'text-violet-700')}
 >
 Ramalan disimpan
 </span>)}
 {!hasPrediction && d.window_open && (d.days_until_cutoff ?? 0) > 1 && (
 <span
 className={cn(
 'mt-0.5 block text-xs',
 productionDate === d.production_date ? 'text-white/85' : 'text-emerald-700')}
 >
 Buka untuk ramalan awal
 </span>)}
 {d.cutoff_at && (
 <span
 className={cn(
 'mt-0.5 block text-xs',
 productionDate === d.production_date
 ? 'text-white/85'
 : 'text-muted-foreground')}
 >
 Tutup: {formatOrderCutoff(d.cutoff_at)}
 </span>)}
 {closed && (
 <span className="mt-0.5 block text-xs font-medium text-red-600">Order ditutup</span>)}
 </button>);
 })}
 </div>
 </div>

 {cutoffAt && (
 <div
 className={cn(
 'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
 windowOpen
 ? 'border border-blue-200 bg-blue-50 text-blue-950'
 : 'border border-red-200 bg-red-50 text-red-950')}
 >
 {windowOpen ? <Clock className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
 {windowOpen ? (
 <span>
 Fasa <strong>{ORDER_PHASE_LABELS.PREDICTION}</strong> - tutup{' '}
 <strong>{formatOrderCutoff(cutoffAt)}</strong>
 {getOrderWindowCountdown(cutoffAt) && (
 <span className="ml-1">({getOrderWindowCountdown(cutoffAt)})</span>)}
 </span>) : (
 <span>
 Tempoh order ditutup (deadline: {formatOrderCutoff(cutoffAt)}). Hubungi pentadbir jika perlu
 pengecualian.
 </span>)}
 </div>)}

 {productionDate && windowOpen && (
 <>
 <div className="flex flex-wrap gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="gap-1"
 disabled={loadingSuggest || !suggestion}
 onClick={applyAllSuggestions}
 >
 <Sparkles className="h-4 w-4" />
 {loadingSuggest ? 'Mengira cadangan...' : 'Guna Cadangan Semua Cawangan'}
 </Button>
 </div>

 {loadingSuggest ? (
 <p className="text-sm text-muted-foreground">Memuatkan cadangan stok cawangan...</p>) : (
 <HqBranchOrderMatrix
 branches={suggestion?.branches ?? []}
 branchCount={suggestion?.branch_count}
 orderLeadDays={suggestion?.order_lead_days}
 stockCoverageDays={suggestion?.stock_coverage_days}
 orderDeadlineNote={suggestion?.order_deadline_note}
 holidayDemandBoost={suggestion?.holiday_demand_boost}
 holidaysInWindow={suggestion?.holidays_in_window}
 quantities={branchQty}
 branchDrivers={branchDrivers}
 onChange={setBranchQty}
 onDriverChange={setBranchDrivers}
 drivers={drivers}
 disabled={!windowOpen}
 />)}

 <div className="space-y-1.5">
 <Label htmlFor="hq-order-notes">Nota order (pilihan)</Label>
 <Textarea
 id="hq-order-notes"
 rows={2}
 placeholder="Contoh: Promo hujung minggu - tambahan Kaya di Utara..."
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 />
 </div>

 {branchItems.length > 0 && (
 <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm">
 <p className="font-semibold text-violet-950">
 Ringkasan - {formatProductionDayLabel(productionDate)}
 </p>
 <p className="mt-1 text-muted-foreground">
 {branchItems.length} baris stok - {' '}
 {new Set(branchItems.map((i) => i.branch_id)).size} cawangan (roti + bahan + packaging)
 </p>
 </div>)}

 <Button
 type="submit"
 className="h-12 w-full gap-2 bg-amber-500 text-base font-bold hover:bg-amber-600"
 disabled={
 loading ||
 !windowOpen ||
 branchItems.length === 0
 }
 >
 <Send className="h-5 w-5" />
 {loading ? 'Menghantar...' : 'Simpan Order Ramalan ke Kilang'}
 </Button>
 </>)}

 {productionDate && !windowOpen && cutoffAt && isCutoffPassed(cutoffAt) && (
 <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
 Order untuk {formatProductionDayLabel(productionDate)} sudah ditutup automatik.
 </p>)}
 </form>);
}
