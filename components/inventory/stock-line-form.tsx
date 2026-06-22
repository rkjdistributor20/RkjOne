'use client';

import { useEffect, useState } from 'react';
import type {
  InventoryBalanceRow,
  LineItemInput,
  StockItemOption,
} from '@/lib/inventory/types';
import {
  formatRejectPreview,
  getRejectOrderUnit,
  getStockByCode,
  resolveRejectToBaseQuantity,
  toBaseQuantity,
} from '@/lib/stock/catalog';
import { ROTI_SHELF_LIFE_DAYS } from '@/lib/stock/expiry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { boundSelectValue } from '@/lib/ui/select-utils';

type FormMode = 'receive' | 'adjust' | 'count' | 'writeoff';

interface StockLineFormProps {
  mode: FormMode;
  stockItems: StockItemOption[];
  balances?: InventoryBalanceRow[];
  /** Order stok HQ → kiosk: kuantiti dalam bag/tong */
  orderInPacks?: boolean;
  rejectMode?: boolean;
  /** Sebab praisi dari panel reject POS */
  defaultReason?: string;
  /** Prefill baris (cth. expired roti) */
  prefillLines?: Array<{ stock_item_id: string; quantity: number }>;
  /** Prefill dalam unit asas (pcs/gram) */
  prefillUseBaseUnit?: boolean;
  /** Wajib tarikh production untuk baris roti (pembuat order) */
  requireRotiProductionDate?: boolean;
  /** Senarai tarikh dibenarkan (dari jadual kilang) */
  productionDateOptions?: string[];
  /** Tarikh production lalai untuk semua baris roti */
  defaultProductionDate?: string;
  onSubmit?: (items: LineItemInput[], meta?: { notes?: string }) => Promise<void>;
  onSubmitAdjust?: (
    reason: string,
    items: Array<{ stock_item_id: string; quantity_after: number }>
  ) => Promise<void>;
  onSubmitCount?: (
    items: Array<{ stock_item_id: string; counted_quantity: number }>,
    notes?: string
  ) => Promise<void>;
  onSubmitWriteOff?: (reason: string, items: LineItemInput[]) => Promise<void>;
}

interface LineState {
  stock_item_id: string;
  quantity: string;
  production_date?: string;
}

export function StockLineForm({
  mode,
  stockItems,
  balances = [],
  orderInPacks = false,
  rejectMode = false,
  defaultReason = '',
  prefillLines,
  prefillUseBaseUnit = false,
  requireRotiProductionDate = false,
  productionDateOptions,
  defaultProductionDate,
  onSubmit,
  onSubmitAdjust,
  onSubmitCount,
  onSubmitWriteOff,
}: StockLineFormProps) {
  const [lines, setLines] = useState<LineState[]>([
    { stock_item_id: stockItems[0]?.id ?? '', quantity: '' },
  ]);
  const [reason, setReason] = useState(defaultReason);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [useBaseUnit, setUseBaseUnit] = useState(false);

  useEffect(() => {
    if (defaultReason) setReason(defaultReason);
  }, [defaultReason]);

  useEffect(() => {
    if (prefillUseBaseUnit) setUseBaseUnit(true);
  }, [prefillUseBaseUnit]);

  useEffect(() => {
    if (!prefillLines?.length) return;
    setLines(
      prefillLines.map((p) => ({
        stock_item_id: p.stock_item_id,
        quantity: String(p.quantity),
      }))
    );
    if (prefillUseBaseUnit) setUseBaseUnit(true);
  }, [prefillLines, prefillUseBaseUnit]);

  useEffect(() => {
    if (!stockItems.length) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.stock_item_id && stockItems.some((s) => s.id === l.stock_item_id)) return l;
        return { ...l, stock_item_id: stockItems[0].id };
      })
    );
  }, [stockItems]);

  function addLine() {
    setLines([...lines, { stock_item_id: stockItems[0]?.id ?? '', quantity: '' }]);
  }

  function updateLine(idx: number, field: keyof LineState, value: string) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function isRotiLine(stockItemId: string): boolean {
    const item = stockItems.find((s) => s.id === stockItemId);
    if (!item) return false;
    return item.category === 'Roti' || getStockByCode(item.item_code)?.category === 'Roti';
  }

  function defaultProductionDateValue(): string {
    return defaultProductionDate ?? new Date().toISOString().slice(0, 10);
  }

  function resolveLineItem(stockItemId: string, rawQty: number, productionDate?: string): LineItemInput {
    const item = stockItems.find((s) => s.id === stockItemId);
    if (!item) {
      return { stock_item_id: stockItemId, quantity: rawQty };
    }

    if (rejectMode && mode === 'writeoff') {
      const resolved = resolveRejectToBaseQuantity(item.item_code, rawQty, useBaseUnit);
      return {
        stock_item_id: stockItemId,
        quantity: resolved.quantity,
        unit: resolved.unit,
      };
    }

    const base: LineItemInput = {
      stock_item_id: stockItemId,
      quantity: rawQty,
      unit: item.base_unit,
    };

    if (requireRotiProductionDate && isRotiLine(stockItemId) && productionDate) {
      base.production_date = productionDate;
    }

    if (orderInPacks) {
      const def = getStockByCode(item.item_code);
      const qty = def ? toBaseQuantity(rawQty, def) : rawQty;
      return {
        ...base,
        quantity: qty,
        unit: def?.base_unit ?? item.base_unit,
        production_date: base.production_date,
      };
    }

    return base;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'receive' && onSubmit) {
        const filtered = lines.filter((l) => l.stock_item_id && l.quantity);
        for (const l of filtered) {
          if (
            requireRotiProductionDate &&
            isRotiLine(l.stock_item_id) &&
            !l.production_date
          ) {
            throw new Error('Tarikh production wajib untuk setiap baris roti');
          }
        }
        await onSubmit(
          filtered.map((l) => {
            const prod =
              requireRotiProductionDate && isRotiLine(l.stock_item_id)
                ? l.production_date || defaultProductionDateValue()
                : l.production_date;
            return resolveLineItem(l.stock_item_id, Number(l.quantity), prod);
          }),
          { notes: notes || undefined }
        );
      } else if (mode === 'adjust' && onSubmitAdjust) {
        await onSubmitAdjust(
          reason,
          lines
            .filter((l) => l.stock_item_id && l.quantity)
            .map((l) => ({
              stock_item_id: l.stock_item_id,
              quantity_after: Number(l.quantity),
            }))
        );
      } else if (mode === 'count' && onSubmitCount) {
        await onSubmitCount(
          lines
            .filter((l) => l.stock_item_id && l.quantity)
            .map((l) => ({
              stock_item_id: l.stock_item_id,
              counted_quantity: Number(l.quantity),
            })),
          notes || undefined
        );
      } else if (mode === 'writeoff' && onSubmitWriteOff) {
        await onSubmitWriteOff(
          reason,
          lines
            .filter((l) => l.stock_item_id && l.quantity)
            .map((l) => resolveLineItem(l.stock_item_id, Number(l.quantity)))
        );
      }
      setLines([{ stock_item_id: stockItems[0]?.id ?? '', quantity: '' }]);
      if (!defaultReason) setReason('');
      setNotes('');
    } finally {
      setLoading(false);
    }
  }

  function qtyLabelForItem(item?: StockItemOption): string {
    if (mode === 'adjust') return 'Kuantiti Baharu';
    if (mode === 'count') return 'Kiraan';
    if (rejectMode && item) {
      if (useBaseUnit) {
        const def = getStockByCode(item.item_code);
        return def?.base_unit === 'GRAM'
          ? 'Kuantiti (gram)'
          : `Kuantiti (${(def?.base_unit ?? 'pcs').toLowerCase()})`;
      }
      return getRejectOrderUnit(item.item_code).orderLabel;
    }
    if (orderInPacks) return 'Kuantiti (bag/tong)';
    return 'Kuantiti';
  }

  function stockItemLabel(si: StockItemOption): string {
    const cat = getStockByCode(si.item_code);
    return cat ? `${si.name} · ${cat.conversion_text}` : si.name;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      {requireRotiProductionDate && mode === 'receive' && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
          {productionDateOptions?.length ? (
            <>
              <strong>Tarikh production</strong> mesti dari jadual kilang yang diterbitkan.
              Expiry roti = production + {ROTI_SHELF_LIFE_DAYS} hari.
            </>
          ) : (
            <>
              <strong>Tarikh production roti</strong> — ikut jadual kilang (tab Jadual Kilang).
              Expiry = production + {ROTI_SHELF_LIFE_DAYS} hari.
            </>
          )}
        </p>
      )}

      {orderInPacks && mode === 'receive' && (
        <p className="text-sm text-muted-foreground">
          Masukkan kuantiti dalam <strong>bag</strong> (roti/plastik) atau{' '}
          <strong>tong</strong> (kaya/butter). Sistem auto tukar ke pcs/gram.
        </p>
      )}

      {rejectMode && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useBaseUnit}
            onChange={(e) => setUseBaseUnit(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>
            Masukkan terus dalam <strong>gram</strong> / <strong>pcs</strong> (bukan bag/tong)
          </span>
        </label>
      )}

      {lines.map((line, idx) => {
        const balance = balances.find((b) => b.stock_item_id === line.stock_item_id);
        const item = stockItems.find((s) => s.id === line.stock_item_id);
        const def = item ? getStockByCode(item.item_code) : undefined;
        const orderMeta = item ? getRejectOrderUnit(item.item_code) : null;
        const rawQty = Number(line.quantity);
        const preview =
          rejectMode && item && rawQty > 0
            ? formatRejectPreview(item.item_code, rawQty, useBaseUnit)
            : null;

        const showProdDate =
          requireRotiProductionDate && mode === 'receive' && isRotiLine(line.stock_item_id);

        const itemSelectValue = boundSelectValue(
          line.stock_item_id,
          stockItems.map((s) => s.id)
        );

        return (
          <div key={idx} className="flex flex-wrap gap-2 rounded-lg border p-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label>Item Stok</Label>
              <Select
                value={itemSelectValue ?? ''}
                onValueChange={(v) => v && updateLine(idx, 'stock_item_id', v)}
                disabled={stockItems.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih item">
                    {item ? stockItemLabel(item) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stockItems.map((si) => (
                    <SelectItem key={si.id} value={si.id}>
                      {stockItemLabel(si)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {def && (
                <p className="text-xs text-muted-foreground">{def.conversion_text}</p>
              )}
              {balance && mode === 'count' && (
                <p className="text-xs text-muted-foreground">
                  Sistem: {Number(balance.quantity).toLocaleString('ms-MY')} {balance.unit}
                </p>
              )}
            </div>
            <div className="w-32 space-y-1">
              <Label>{qtyLabelForItem(item)}</Label>
              <Input
                type="number"
                min="0"
                step={
                  rejectMode && item && !useBaseUnit
                    ? orderMeta?.step ?? '0.01'
                    : '1'
                }
                value={line.quantity}
                onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                required
                placeholder={
                  rejectMode && item && !useBaseUnit
                    ? orderMeta?.orderUnit === 'tong'
                      ? 'cth 0.5'
                      : 'cth 1'
                    : undefined
                }
              />
              {preview && (
                <p className={cn('text-xs font-medium text-amber-800')}>{preview}</p>
              )}
            </div>
            {showProdDate && (
              <div className="w-44 space-y-1">
                <Label>Tarikh production</Label>
                {productionDateOptions && productionDateOptions.length > 0 ? (
                  productionDateOptions.length === 1 ? (
                    <Input
                      type="text"
                      readOnly
                      className="bg-muted"
                      value={productionDateOptions[0]}
                    />
                  ) : (
                    <Select
                      value={line.production_date ?? defaultProductionDateValue()}
                      onValueChange={(v) => v && updateLine(idx, 'production_date', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tarikh" />
                      </SelectTrigger>
                      <SelectContent>
                        {productionDateOptions.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <Input
                    type="date"
                    value={line.production_date ?? defaultProductionDateValue()}
                    onChange={(e) => updateLine(idx, 'production_date', e.target.value)}
                    required
                    max={defaultProductionDateValue()}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        + Tambah Baris
      </Button>

      {(mode === 'adjust' || mode === 'writeoff') && (
        <div className="space-y-1">
          <Label>{rejectMode ? 'Sebab reject' : 'Sebab'}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={2}
            placeholder={
              rejectMode
                ? 'Contoh: Roti rosak, kaya basi, plastik koyak…'
                : undefined
            }
          />
        </div>
      )}

      {(mode === 'receive' || mode === 'count') && (
        <div className="space-y-1">
          <Label>Nota</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      )}

      <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
        {loading
          ? 'Menghantar…'
          : mode === 'receive'
            ? 'Hantar Order Stok'
            : mode === 'count'
              ? 'Hantar Audit'
              : rejectMode
                ? 'Hantar Reject Stok'
                : mode === 'writeoff'
                  ? 'Hantar Lupus Stok'
                  : 'Simpan'}
      </Button>
    </form>
  );
}
