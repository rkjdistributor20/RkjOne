'use client';

import { useEffect, useMemo, useState } from 'react';
import { Send, FileText } from 'lucide-react';
import type { StockItemOption } from '@/lib/inventory/types';
import type { PublishedProductionDate } from '@/lib/production/types';
import {
  HQ_FACTORY_ORDER_SECTIONS,
  formatHqOrderPreview,
  getHqOrderUnitLabel,
} from '@/lib/production/hq-order-format';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { getStockByCode, resolveRejectToBaseQuantity } from '@/lib/stock/catalog';
import { ROTI_SHELF_LIFE_DAYS } from '@/lib/stock/expiry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface HqFactoryOrderFormProps {
  stockItems: StockItemOption[];
  publishedDates: PublishedProductionDate[];
  onSubmit: (payload: {
    production_date: string;
    items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
    notes?: string;
  }) => Promise<void>;
}

export function HqFactoryOrderForm({
  stockItems,
  publishedDates,
  onSubmit,
}: HqFactoryOrderFormProps) {
  const [productionDate, setProductionDate] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productionDate && publishedDates.length > 0) {
      setProductionDate(publishedDates[0].production_date);
    }
  }, [publishedDates, productionDate]);

  const itemsByCode = useMemo(() => {
    const map = new Map<string, StockItemOption>();
    for (const item of stockItems) {
      map.set(item.item_code, item);
    }
    return map;
  }, [stockItems]);

  const selectedDayMeta = publishedDates.find((d) => d.production_date === productionDate);

  const linePreview = useMemo(() => {
    const lines: Array<{
      itemCode: string;
      name: string;
      orderQty: number;
      unitLabel: string;
      preview: string | null;
      stockItemId: string;
    }> = [];

    for (const section of HQ_FACTORY_ORDER_SECTIONS) {
      for (const code of section.itemCodes) {
        const item = itemsByCode.get(code);
        if (!item) continue;
        const orderQty = Number(quantities[code]) || 0;
        if (orderQty <= 0) continue;
        lines.push({
          itemCode: code,
          name: item.name,
          orderQty,
          unitLabel: getHqOrderUnitLabel(code),
          preview: formatHqOrderPreview(code, orderQty),
          stockItemId: item.id,
        });
      }
    }
    return lines;
  }, [quantities, itemsByCode]);

  function setQty(code: string, value: string) {
    setQuantities((prev) => ({ ...prev, [code]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productionDate) return;
    if (linePreview.length === 0) return;

    setLoading(true);
    try {
      const items = linePreview.map((line) => {
        const resolved = resolveRejectToBaseQuantity(line.itemCode, line.orderQty, false);
        return {
          stock_item_id: line.stockItemId,
          quantity: resolved.quantity,
          unit: resolved.unit,
        };
      });
      await onSubmit({
        production_date: productionDate,
        items,
        notes: notes.trim() || undefined,
      });
      setQuantities({});
      setNotes('');
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
            <p className="font-bold text-amber-950">Borang Order HQ → Kilang</p>
            <p className="mt-1 text-sm text-amber-900/80">
              Satu borang per <strong>hari production</strong>. Isi bag/tong diperlukan — kosongkan
              item yang tidak perlu. Expiry roti = production + {ROTI_SHELF_LIFE_DAYS} hari.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          ① Tarikh production kilang <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {publishedDates.map((d) => (
            <button
              key={d.production_date}
              type="button"
              onClick={() => setProductionDate(d.production_date)}
              className={cn(
                'rounded-xl border-2 px-4 py-2.5 text-left text-sm transition-all',
                productionDate === d.production_date
                  ? 'border-amber-500 bg-amber-500 text-white shadow-md'
                  : 'border-border bg-background hover:border-amber-300'
              )}
            >
              <span className="font-semibold">{formatProductionDayLabel(d.production_date)}</span>
              {d.day_notes && (
                <span
                  className={cn(
                    'mt-0.5 block text-xs',
                    productionDate === d.production_date
                      ? 'text-white/85'
                      : 'text-muted-foreground'
                  )}
                >
                  {d.day_notes}
                </span>
              )}
            </button>
          ))}
        </div>
        {selectedDayMeta?.week_notes && (
          <p className="text-xs text-muted-foreground">Nota minggu kilang: {selectedDayMeta.week_notes}</p>
        )}
      </div>

      {productionDate && (
        <>
          {HQ_FACTORY_ORDER_SECTIONS.map((section) => (
            <section
              key={section.id}
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className="border-b bg-muted/40 px-4 py-3">
                <p className="text-sm font-bold">
                  {section.number}. {section.title}
                </p>
                <p className="text-xs text-muted-foreground">{section.subtitle}</p>
              </div>
              <div className="divide-y">
                {section.itemCodes.map((code) => {
                  const item = itemsByCode.get(code);
                  if (!item) return null;
                  const def = getStockByCode(code);
                  const orderQty = Number(quantities[code]) || 0;
                  const preview = formatHqOrderPreview(code, orderQty);
                  const unitLabel = getHqOrderUnitLabel(code);

                  return (
                    <div
                      key={code}
                      className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {def?.conversion_text ?? item.item_code}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step={def?.pack_unit === 'TONG' ? '0.5' : '1'}
                          placeholder="0"
                          className="h-11 w-24 text-center text-lg font-semibold tabular-nums"
                          value={quantities[code] ?? ''}
                          onChange={(e) => setQty(code, e.target.value)}
                        />
                        <span className="w-12 text-sm font-medium text-muted-foreground">
                          {unitLabel}
                        </span>
                      </div>
                      <p className="text-right text-sm font-medium text-amber-800 sm:min-w-[7rem]">
                        {preview ?? '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="hq-order-notes">Nota order (pilihan)</Label>
            <Textarea
              id="hq-order-notes"
              rows={2}
              placeholder="Contoh: Tambahan 2 bag Kaya untuk promo hujung minggu…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {linePreview.length > 0 && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <p className="mb-2 text-sm font-semibold text-violet-950">
                Ringkasan sebelum hantar · {formatProductionDayLabel(productionDate)}
              </p>
              <ul className="space-y-1 text-sm">
                {linePreview.map((line) => (
                  <li key={line.itemCode} className="flex justify-between gap-2">
                    <span>{line.name}</span>
                    <span className="shrink-0 tabular-nums font-medium">
                      {line.orderQty} {line.unitLabel.toLowerCase()}
                      {line.preview && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({line.preview})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full gap-2 bg-amber-500 text-base font-bold hover:bg-amber-600"
            disabled={loading || !productionDate || linePreview.length === 0}
          >
            <Send className="h-5 w-5" />
            {loading ? 'Menghantar…' : 'Submit Order ke Kilang'}
          </Button>
        </>
      )}
    </form>
  );
}
