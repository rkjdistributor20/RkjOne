'use client';

import { useState } from 'react';
import type {
  InventoryBalanceRow,
  LineItemInput,
  StockItemOption,
} from '@/lib/inventory/types';
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

type FormMode = 'receive' | 'adjust' | 'count' | 'writeoff';

interface StockLineFormProps {
  mode: FormMode;
  stockItems: StockItemOption[];
  balances?: InventoryBalanceRow[];
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
}

export function StockLineForm({
  mode,
  stockItems,
  balances = [],
  onSubmit,
  onSubmitAdjust,
  onSubmitCount,
  onSubmitWriteOff,
}: StockLineFormProps) {
  const [lines, setLines] = useState<LineState[]>([
    { stock_item_id: stockItems[0]?.id ?? '', quantity: '' },
  ]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  function addLine() {
    setLines([...lines, { stock_item_id: stockItems[0]?.id ?? '', quantity: '' }]);
  }

  function updateLine(idx: number, field: keyof LineState, value: string) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'receive' && onSubmit) {
        await onSubmit(
          lines
            .filter((l) => l.stock_item_id && l.quantity)
            .map((l) => ({
              stock_item_id: l.stock_item_id,
              quantity: Number(l.quantity),
            })),
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
            .map((l) => ({
              stock_item_id: l.stock_item_id,
              quantity: Number(l.quantity),
            }))
        );
      }
      setLines([{ stock_item_id: stockItems[0]?.id ?? '', quantity: '' }]);
      setReason('');
      setNotes('');
    } finally {
      setLoading(false);
    }
  }

  const qtyLabel =
    mode === 'adjust'
      ? 'New Quantity'
      : mode === 'count'
        ? 'Counted Qty'
        : 'Quantity';

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      {lines.map((line, idx) => {
        const balance = balances.find((b) => b.stock_item_id === line.stock_item_id);
        return (
          <div key={idx} className="flex flex-wrap gap-2 rounded-lg border p-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label>Stock Item</Label>
              <Select
                value={line.stock_item_id}
                onValueChange={(v) => v && updateLine(idx, 'stock_item_id', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {stockItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.item_code} — {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {balance && mode === 'count' && (
                <p className="text-xs text-muted-foreground">
                  System: {Number(balance.quantity).toLocaleString()} {balance.unit}
                </p>
              )}
            </div>
            <div className="w-28 space-y-1">
              <Label>{qtyLabel}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.quantity}
                onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                required
              />
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        + Add Line
      </Button>

      {(mode === 'adjust' || mode === 'writeoff') && (
        <div className="space-y-1">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows={2} />
        </div>
      )}

      {(mode === 'receive' || mode === 'count') && (
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      )}

      <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
        {loading ? 'Submitting…' : `Submit ${mode.replace('off', '-off')}`}
      </Button>
    </form>
  );
}
