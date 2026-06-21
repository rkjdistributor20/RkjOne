'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Send, FileText, Sparkles, Clock, AlertTriangle } from 'lucide-react';
import type { StockItemOption } from '@/lib/inventory/types';
import type { OrderSuggestion, PublishedProductionDate } from '@/lib/production/types';
import { ORDER_PHASE_LABELS } from '@/lib/production/types';
import { fetchOrderSuggestion } from '@/lib/production/api';
import {
  HQ_FACTORY_ORDER_SECTIONS,
  formatHqOrderPreview,
  getHqOrderUnitLabel,
} from '@/lib/production/hq-order-format';
import {
  formatOrderCutoff,
  getOrderWindowCountdown,
  isCutoffPassed,
} from '@/lib/production/order-window';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { getStockByCode, resolveRejectToBaseQuantity } from '@/lib/stock/catalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  HqBranchOrderMatrix,
  buildBranchItemsFromMatrix,
  type BranchQtyMap,
  type BranchDriverMap,
} from '@/components/warehouse/hq-branch-order-matrix';

interface HqFactoryOrderFormProps {
  stockItems: StockItemOption[];
  publishedDates: PublishedProductionDate[];
  onSubmit: (payload: {
    production_date: string;
    items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
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
  const [factoryQty, setFactoryQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestion, setSuggestion] = useState<OrderSuggestion | null>(null);

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
      setFactoryQty({});
    }
  }, [productionDate, loadSuggestion]);

  function applyAllSuggestions() {
    if (!suggestion) return;
    const next: BranchQtyMap = {};
    for (const branch of suggestion.branches) {
      next[branch.branch_id] = {};
      for (const item of branch.items) {
        if (item.suggested_bags > 0) {
          next[branch.branch_id][item.item_code] = String(item.suggested_bags);
        }
      }
    }
    setBranchQty(next);

    const fd: BranchDriverMap = { ...branchDrivers };
    for (const branch of suggestion.branches) {
      if (branch.default_driver_id) fd[branch.branch_id] = branch.default_driver_id;
    }
    setBranchDrivers(fd);

    const fq: Record<string, string> = {};
    for (const item of suggestion.factory_items) {
      fq[item.item_code] = String(item.suggested_qty);
    }
    setFactoryQty(fq);
  }

  const branchItems = useMemo(() => {
    if (!suggestion) return [];
    return buildBranchItemsFromMatrix(suggestion.branches, branchQty, branchDrivers, stockIdByCode);
  }, [suggestion, branchQty, branchDrivers, stockIdByCode]);

  const factoryItems = useMemo(() => {
    const items: Array<{ stock_item_id: string; quantity: number; unit?: string; code: string }> = [];
    for (const section of HQ_FACTORY_ORDER_SECTIONS) {
      if (section.id === 'roti') continue;
      for (const code of section.itemCodes) {
        const orderQty = Number(factoryQty[code]) || 0;
        if (orderQty <= 0) continue;
        const stockItemId = stockIdByCode.get(code);
        if (!stockItemId) continue;
        const resolved = resolveRejectToBaseQuantity(code, orderQty, false);
        items.push({
          code,
          stock_item_id: stockItemId,
          quantity: resolved.quantity,
          unit: resolved.unit,
        });
      }
    }
    return items;
  }, [factoryQty, stockIdByCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productionDate || !windowOpen) return;
    if (branchItems.length === 0 && factoryItems.length === 0) return;

    setLoading(true);
    try {
      await onSubmit({
        production_date: productionDate,
        branch_items: branchItems,
        items: factoryItems,
        notes: notes.trim() || undefined,
      });
      setBranchQty({});
      setBranchDrivers({});
      setFactoryQty({});
      setNotes('');
      loadSuggestion(productionDate);
    } finally {
      setLoading(false);
    }
  }

  if (publishedDates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Tiada jadual production diterbitkan. Minta kilang terbitkan di tab Jadual Kilang.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-amber-950">Order Ramalan HQ → Kilang (Per Cawangan + Driver)</p>
            <p className="mt-1 text-sm text-amber-900/80">
              Wajib isi <strong>order per cawangan</strong> — HQ tidak menyimpan stok. Bila kilang
              sahkan, stok auto dihantar terus ke kiosk; driver sahkan sampai di Armada. Susun laluan
              driver sebelum muktamad — kilang tidak boleh sahkan tanpa laluan.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">① Tarikh production kilang *</Label>
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
                      : 'border-border bg-background hover:border-amber-300'
                )}
              >
                <span className="font-semibold">{formatProductionDayLabel(d.production_date)}</span>
                {hasPrediction && !closed && (
                  <span
                    className={cn(
                      'mt-0.5 block text-xs font-medium',
                      productionDate === d.production_date ? 'text-white/90' : 'text-violet-700'
                    )}
                  >
                    ✓ Ramalan disimpan
                  </span>
                )}
                {!hasPrediction && d.window_open && (d.days_until_cutoff ?? 0) > 1 && (
                  <span
                    className={cn(
                      'mt-0.5 block text-xs',
                      productionDate === d.production_date ? 'text-white/85' : 'text-emerald-700'
                    )}
                  >
                    Buka untuk ramalan awal
                  </span>
                )}
                {d.cutoff_at && (
                  <span
                    className={cn(
                      'mt-0.5 block text-xs',
                      productionDate === d.production_date
                        ? 'text-white/85'
                        : 'text-muted-foreground'
                    )}
                  >
                    Tutup: {formatOrderCutoff(d.cutoff_at)}
                  </span>
                )}
                {closed && (
                  <span className="mt-0.5 block text-xs font-medium text-red-600">Order ditutup</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {cutoffAt && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
            windowOpen
              ? 'border border-blue-200 bg-blue-50 text-blue-950'
              : 'border border-red-200 bg-red-50 text-red-950'
          )}
        >
          {windowOpen ? <Clock className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {windowOpen ? (
            <span>
              Fasa <strong>{ORDER_PHASE_LABELS.PREDICTION}</strong> — tutup{' '}
              <strong>{formatOrderCutoff(cutoffAt)}</strong>
              {getOrderWindowCountdown(cutoffAt) && (
                <span className="ml-1">({getOrderWindowCountdown(cutoffAt)})</span>
              )}
            </span>
          ) : (
            <span>
              Tempoh order ditutup (deadline: {formatOrderCutoff(cutoffAt)}). Hubungi pentadbir jika perlu
              pengecualian.
            </span>
          )}
        </div>
      )}

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
              {loadingSuggest ? 'Mengira cadangan…' : 'Guna Cadangan Semua Cawangan'}
            </Button>
          </div>

          <Tabs defaultValue="branches" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="branches">Order Per Cawangan</TabsTrigger>
              <TabsTrigger value="factory">Bahan & Packaging Kilang</TabsTrigger>
            </TabsList>

            <TabsContent value="branches">
              {loadingSuggest ? (
                <p className="text-sm text-muted-foreground">Memuatkan cadangan stok cawangan…</p>
              ) : (
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
                  disabled={!windowOpen}
                />
              )}
            </TabsContent>

            <TabsContent value="factory" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Bahan tong & packaging bag — anggaran sistem ikut jumlah roti semua cawangan.
              </p>
              {HQ_FACTORY_ORDER_SECTIONS.filter((s) => s.id !== 'roti').map((section) => (
                <div key={section.id} className="rounded-xl border p-4">
                  <p className="mb-2 text-sm font-bold">{section.title}</p>
                  <div className="space-y-2">
                    {section.itemCodes.map((code) => {
                      const item = stockItems.find((s) => s.item_code === code);
                      const def = getStockByCode(code);
                      const orderQty = Number(factoryQty[code]) || 0;
                      const preview = formatHqOrderPreview(code, orderQty);
                      const suggest = suggestion?.factory_items.find((f) => f.item_code === code);
                      return (
                        <div key={code} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-sm">{item?.name ?? code}</span>
                          <Input
                            type="number"
                            min="0"
                            step={def?.pack_unit === 'TONG' ? '0.5' : '1'}
                            className="h-9 w-20 text-center"
                            value={factoryQty[code] ?? ''}
                            onChange={(e) =>
                              setFactoryQty((p) => ({ ...p, [code]: e.target.value }))
                            }
                          />
                          <span className="w-10 text-xs text-muted-foreground">
                            {getHqOrderUnitLabel(code)}
                          </span>
                          {suggest && (
                            <span className="text-[10px] text-muted-foreground">
                              cadangan: {suggest.suggested_qty}
                            </span>
                          )}
                          {preview && (
                            <span className="text-xs text-amber-800">{preview}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="hq-order-notes">Nota order (pilihan)</Label>
            <Textarea
              id="hq-order-notes"
              rows={2}
              placeholder="Contoh: Promo hujung minggu — tambahan Kaya di Utara…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {(branchItems.length > 0 || factoryItems.length > 0) && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm">
              <p className="font-semibold text-violet-950">
                Ringkasan · {formatProductionDayLabel(productionDate)}
              </p>
              <p className="mt-1 text-muted-foreground">
                {branchItems.length} baris cawangan · {factoryItems.length} item kilang (bahan/packaging)
              </p>
            </div>
          )}

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
            {loading ? 'Menghantar…' : 'Simpan Order Ramalan ke Kilang'}
          </Button>
        </>
      )}

      {productionDate && !windowOpen && cutoffAt && isCutoffPassed(cutoffAt) && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Order untuk {formatProductionDayLabel(productionDate)} sudah ditutup automatik.
        </p>
      )}
    </form>
  );
}
