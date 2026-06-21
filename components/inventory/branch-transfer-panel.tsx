'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Search, Store, AlertCircle } from 'lucide-react';
import {
  createTransfer,
  dispatchTransfer,
  completeTransfer,
  fetchBalances,
  fetchLocations,
  fetchStockItems,
  fetchTransfers,
} from '@/lib/inventory/api';
import type { InventoryBalanceRow, InventoryLocation, StockTransferRow } from '@/lib/inventory/types';
import {
  formatBranchDestination,
  formatBranchDestinationDetail,
  sortBranchesByName,
} from '@/lib/fleet/display-labels';
import { formatStockQuantity, HQ_ROTI_ITEM_CODES, isHqStockItemCode } from '@/lib/stock/catalog';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { isAreaManagerRole, isOperationManagerRole } from '@/lib/auth/stock-access';

const REASON_PRESETS = [
  { id: 'old_stock', label: 'Habiskan stok lama di cawangan asal' },
  { id: 'urgent', label: 'Keperluan mendesak di cawangan destinasi' },
  { id: 'rebalance', label: 'Pelarasan imbangan stok antara cawangan' },
] as const;

type LineDraft = {
  stock_item_id: string;
  item_code: string;
  name: string;
  max_qty: number;
  unit: string;
  quantity: string;
  production_date: string;
  is_roti: boolean;
};

export function BranchTransferPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isAreaManager = profile ? isAreaManagerRole(profile.role) : false;
  const isOperationManager = profile ? isOperationManagerRole(profile.role) : false;

  const [kiosks, setKiosks] = useState<InventoryLocation[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [reasonPreset, setReasonPreset] = useState<string>(REASON_PRESETS[0].id);
  const [notes, setNotes] = useState('');
  const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadKiosks = useCallback(async () => {
    setLoading(true);
    try {
      const { locations } = await fetchLocations('BRANCH_KIOSK');
      const sorted = sortBranchesByName(locations);
      setKiosks(sorted);
      if (sorted.length >= 2 && !fromId) {
        setFromId(sorted[0].id);
        setToId(sorted[1].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan cawangan');
    } finally {
      setLoading(false);
    }
  }, [fromId]);

  const loadTransfers = useCallback(async () => {
    try {
      const { transfers: list } = await fetchTransfers();
      const scopedKioskIds = new Set(kiosks.map((k) => k.id));
      const kioskOnly = (list as StockTransferRow[]).filter((t) => {
        if (
          t.from_location?.location_type !== 'BRANCH_KIOSK' ||
          t.to_location?.location_type !== 'BRANCH_KIOSK'
        ) {
          return false;
        }
        if (scopedKioskIds.size === 0) return true;
        const fromId = t.from_location.id;
        const toId = t.to_location.id;
        if (!fromId || !toId) return true;
        return scopedKioskIds.has(fromId) && scopedKioskIds.has(toId);
      });
      setTransfers(kioskOnly.slice(0, 20));
    } catch {
      setTransfers([]);
    }
  }, [kiosks]);

  useEffect(() => {
    loadKiosks();
    fetchStockItems({ hq: true }).catch(() => {});
  }, [loadKiosks]);

  useEffect(() => {
    if (kiosks.length) loadTransfers();
  }, [kiosks, loadTransfers]);

  useEffect(() => {
    if (!fromId) {
      setBalances([]);
      setLines([]);
      return;
    }
    fetchBalances(fromId)
      .then(({ balances: rows }) => {
        const official = rows.filter((r) => isHqStockItemCode(r.stock_item.item_code));
        setBalances(official);
        setLines(
          official
            .filter((r) => Number(r.quantity) > 0)
            .map((r) => ({
              stock_item_id: r.stock_item_id,
              item_code: r.stock_item.item_code,
              name: r.stock_item.name,
              max_qty: Number(r.quantity),
              unit: r.unit,
              quantity: '',
              production_date: '',
              is_roti: (HQ_ROTI_ITEM_CODES as readonly string[]).includes(r.stock_item.item_code),
            }))
        );
      })
      .catch(() => {
        setBalances([]);
        setLines([]);
      });
  }, [fromId]);

  const fromLoc = kiosks.find((k) => k.id === fromId);
  const toLoc = kiosks.find((k) => k.id === toId);

  const filterKiosks = (q: string, excludeId?: string) => {
    const text = q.trim().toLowerCase();
    return kiosks.filter((k) => {
      if (excludeId && k.id === excludeId) return false;
      if (!text) return true;
      const name = k.branch?.branch_name ?? k.name;
      const code = k.branch?.branch_code ?? '';
      return name.toLowerCase().includes(text) || code.toLowerCase().includes(text);
    });
  };

  const fromOptions = useMemo(() => filterKiosks(fromSearch, toId), [kiosks, fromSearch, toId]);
  const toOptions = useMemo(() => filterKiosks(toSearch, fromId), [kiosks, toSearch, fromId]);

  function buildNotes(): string {
    const preset = REASON_PRESETS.find((r) => r.id === reasonPreset)?.label ?? '';
    return [preset, notes.trim()].filter(Boolean).join(' — ');
  }

  async function submit(dispatchNow: boolean) {
    if (!fromId || !toId || fromId === toId) {
      toast.error('Pilih dua cawangan berbeza');
      return;
    }

    const items = lines
      .filter((l) => Number(l.quantity) > 0)
      .map((l) => {
        const qty = Number(l.quantity);
        if (qty > l.max_qty) {
          throw new Error(`${l.name}: kuantiti melebihi baki (${l.max_qty})`);
        }
        if (l.is_roti && !l.production_date) {
          throw new Error(`${l.name}: masukkan tarikh production batch roti`);
        }
        return {
          stock_item_id: l.stock_item_id,
          quantity: qty,
          unit: l.unit,
          ...(l.is_roti && l.production_date
            ? { production_date: l.production_date }
            : {}),
        };
      });

    if (!items.length) {
      toast.error('Masukkan kuantiti sekurang-kurangnya satu item');
      return;
    }

    setSubmitting(true);
    try {
      const { result } = await createTransfer({
        from_location_id: fromId,
        to_location_id: toId,
        items,
        notes: buildNotes(),
      });

      const transferId = (result as { transfer_id?: string }).transfer_id;
      if (dispatchNow && transferId) {
        await dispatchTransfer(transferId);
        toast.success('Stok ditolak dari cawangan asal — menunggu terima di destinasi');
      } else {
        toast.success('Pindahan dicipta — hantar dari tab senarai bila sedia');
      }

      setLines((prev) => prev.map((l) => ({ ...l, quantity: '', production_date: '' })));
      loadTransfers();
      if (fromId) {
        const { balances: rows } = await fetchBalances(fromId);
        setBalances(rows.filter((r) => isHqStockItemCode(r.stock_item.item_code)));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal cipta pindahan');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(transferId: string) {
    try {
      await completeTransfer(transferId);
      toast.success('Stok diterima di cawangan destinasi');
      loadTransfers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal terima pindahan');
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">Pindah Stok Antara Cawangan</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Untuk habiskan stok lama atau keperluan mendesak — stok keluar dari kiosk asal
            masuk ke kiosk destinasi.
            {isAreaManager && ' Hanya cawangan dalam kawasan anda.'}
            {isOperationManager && ' Semua cawangan organisasi.'}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <Store className="h-4 w-4 shrink-0 text-emerald-700" />
          <span className="font-medium">{fromLoc ? formatBranchDestination(fromLoc) : 'Asal'}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{toLoc ? formatBranchDestination(toLoc) : 'Destinasi'}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Dari cawangan</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Cari…"
                value={fromSearch}
                onChange={(e) => setFromSearch(e.target.value)}
              />
            </div>
            <Select value={fromId} onValueChange={(v) => setFromId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih asal">
                  {fromLoc ? formatBranchDestination(fromLoc) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {fromOptions.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className="flex flex-col items-start">
                      <span>{formatBranchDestination(k)}</span>
                      {formatBranchDestinationDetail(k) && (
                        <span className="text-xs text-muted-foreground">
                          {formatBranchDestinationDetail(k)}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Ke cawangan</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Cari…"
                value={toSearch}
                onChange={(e) => setToSearch(e.target.value)}
              />
            </div>
            <Select value={toId} onValueChange={(v) => setToId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih destinasi">
                  {toLoc ? formatBranchDestination(toLoc) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {toOptions.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className="flex flex-col items-start">
                      <span>{formatBranchDestination(k)}</span>
                      {formatBranchDestinationDetail(k) && (
                        <span className="text-xs text-muted-foreground">
                          {formatBranchDestinationDetail(k)}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Sebab pindahan</Label>
          <Select value={reasonPreset} onValueChange={(v) => setReasonPreset(v ?? '')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASON_PRESETS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Nota tambahan (pilihan)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>

        {lines.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Tiada baki stok di cawangan asal untuk dipindahkan.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Item dari baki cawangan asal
            </p>
            {lines.map((line, idx) => (
              <div
                key={line.stock_item_id}
                className="grid gap-2 border-b pb-2 last:border-0 sm:grid-cols-[1fr_100px_120px]"
              >
                <div>
                  <p className="text-sm font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Baki:{' '}
                    {formatStockQuantity(line.max_qty, line.unit, {
                      item_code: line.item_code,
                    })}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Pindah</Label>
                  <Input
                    type="number"
                    min="0"
                    max={line.max_qty}
                    step="1"
                    className="h-8"
                    value={line.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], quantity: val };
                        return next;
                      });
                    }}
                  />
                </div>
                {line.is_roti && (
                  <div>
                    <Label className="text-xs">Tarikh prod. batch</Label>
                    <Input
                      type="date"
                      className="h-8"
                      value={line.production_date}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], production_date: val };
                          return next;
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={submitting || !lines.some((l) => Number(l.quantity) > 0)}
            onClick={() => submit(true)}
          >
            {submitting ? 'Memproses…' : 'Hantar Terus'}
          </Button>
          <Button variant="outline" disabled={submitting} onClick={() => submit(false)}>
            Simpan Draf
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Hantar Terus: tolak stok dari cawangan asal serta-merta. Cawangan destinasi sahkan
          penerimaan di senarai kanan.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Pindahan Cawangan Terkini</h3>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pindahan kiosk → kiosk.</p>
        ) : (
          transfers.map((t) => (
            <div
              key={t.id}
              className={cn(
                'rounded-lg border p-3 text-sm',
                t.status === 'IN_TRANSIT' && 'border-violet-300 bg-violet-50/40'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.transfer_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.from_location.name} → {t.to_location.name}
                  </p>
                </div>
                <Badge variant={t.status === 'IN_TRANSIT' ? 'default' : 'outline'}>
                  {t.status}
                </Badge>
              </div>
              {t.status === 'IN_TRANSIT' && (
                <Button
                  size="sm"
                  className="mt-2 bg-amber-500 hover:bg-amber-600"
                  onClick={() => handleComplete(t.id)}
                >
                  Terima di Destinasi
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
