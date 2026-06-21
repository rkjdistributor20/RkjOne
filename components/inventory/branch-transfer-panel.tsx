'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Plus,
  Search,
  Store,
  Trash2,
  Warehouse,
} from 'lucide-react';
import {
  createTransfer,
  dispatchTransfer,
  completeTransfer,
  fetchBalances,
  fetchLocations,
  fetchRotiBatches,
  fetchStockItems,
  fetchTransfers,
} from '@/lib/inventory/api';
import type {
  InventoryBalanceRow,
  InventoryLocation,
  StockItemOption,
  StockTransferRow,
} from '@/lib/inventory/types';
import {
  buildTransferLegs,
  countUniqueBranches,
  itemTotals,
  MAX_REBALANCE_BRANCHES,
  validateRebalancePlan,
  type DropAllocation,
  type PickupAllocation,
  type TransferLeg,
} from '@/lib/inventory/branch-rebalance';
import {
  TRANSFER_ROUTE_LABELS,
  type TransferRouteMode,
  isAllowedInventoryJourneyRoute,
  routeModeFromTransfer,
} from '@/lib/inventory/transfer-route';
import {
  formatBranchDestination,
  formatBranchDestinationDetail,
  sortBranchesByName,
} from '@/lib/fleet/display-labels';
import {
  formatStockQuantity,
  getStockByCode,
  HQ_ROTI_ITEM_CODES,
  HQ_STOCK_ITEM_CODES,
  isHqStockItemCode,
} from '@/lib/stock/catalog';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { isAreaManagerRole, isOperationManagerRole, canManageHqStockInOut } from '@/lib/auth/stock-access';
import {
  formatExpiryDate,
  ROTI_SHELF_LIFE_DAYS,
  rotiExpiryStatusLabel,
  type RotiBatchAtLocation,
} from '@/lib/stock/expiry';

const REASON_PRESETS = [
  { id: 'old_stock', label: 'Habiskan stok lama di cawangan asal' },
  { id: 'urgent', label: 'Keperluan mendesak di cawangan destinasi' },
  { id: 'rebalance', label: 'Pelarasan imbangan stok antara cawangan' },
] as const;

type RotiBatchLine = {
  batch_id: string;
  production_date: string;
  expires_on: string;
  days_until_expiry: number;
  balance: number;
  quantity: string;
  expired: boolean;
  expiring_soon: boolean;
};

type StockLine = {
  item_code: string;
  stock_item_id: string;
  name: string;
  unit: string;
  balance: number;
  quantity: string;
  production_date: string;
  is_roti: boolean;
  batches?: RotiBatchLine[];
};

type PickupStop = { key: string; locationId: string; lines: StockLine[] };
type DropStop = { key: string; locationId: string; lines: StockLine[] };

function newKey() {
  return crypto.randomUUID();
}

function emptyStockLines(stockItems: StockItemOption[]): StockLine[] {
  return HQ_STOCK_ITEM_CODES.map((code) => {
    const def = getStockByCode(code)!;
    const item = stockItems.find((s) => s.item_code === code);
    const is_roti = (HQ_ROTI_ITEM_CODES as readonly string[]).includes(code);
    return {
      item_code: code,
      stock_item_id: item?.id ?? '',
      name: def.name,
      unit: def.base_unit,
      balance: 0,
      quantity: '',
      production_date: '',
      is_roti,
      ...(is_roti ? { batches: [] } : {}),
    };
  });
}

function buildPickupLines(
  stockItems: StockItemOption[],
  balances: InventoryBalanceRow[],
  rotiBatches: RotiBatchAtLocation[]
): StockLine[] {
  const byCode = new Map(balances.map((b) => [b.stock_item.item_code, b]));
  const batchesByCode = new Map<string, RotiBatchAtLocation[]>();
  for (const batch of rotiBatches) {
    const list = batchesByCode.get(batch.item_code) ?? [];
    list.push(batch);
    batchesByCode.set(batch.item_code, list);
  }

  return HQ_STOCK_ITEM_CODES.map((code) => {
    const def = getStockByCode(code)!;
    const item = stockItems.find((s) => s.item_code === code);
    const row = byCode.get(code);
    const is_roti = (HQ_ROTI_ITEM_CODES as readonly string[]).includes(code);

    if (is_roti) {
      const batches: RotiBatchLine[] = (batchesByCode.get(code) ?? []).map((b) => ({
        batch_id: b.batch_id,
        production_date: b.production_date,
        expires_on: b.expires_on,
        days_until_expiry: b.days_until_expiry,
        balance: b.quantity_remaining,
        quantity: '',
        expired: b.expired,
        expiring_soon: b.expiring_soon,
      }));
      const activeBalance = batches
        .filter((b) => !b.expired)
        .reduce((sum, b) => sum + b.balance, 0);
      return {
        item_code: code,
        stock_item_id: item?.id ?? row?.stock_item_id ?? '',
        name: def.name,
        unit: row?.unit ?? def.base_unit,
        balance: activeBalance || Number(row?.quantity ?? 0),
        quantity: '',
        production_date: '',
        is_roti: true,
        batches,
      };
    }

    return {
      item_code: code,
      stock_item_id: item?.id ?? row?.stock_item_id ?? '',
      name: def.name,
      unit: row?.unit ?? def.base_unit,
      balance: Number(row?.quantity ?? 0),
      quantity: '',
      production_date: '',
      is_roti: false,
    };
  });
}

async function loadPickupLinesForLocation(
  locationId: string,
  stockItems: StockItemOption[]
): Promise<StockLine[]> {
  const [{ balances: rows }, { batches }] = await Promise.all([
    fetchBalances(locationId),
    fetchRotiBatches(locationId),
  ]);
  const official = rows.filter((r) => isHqStockItemCode(r.stock_item.item_code));
  return buildPickupLines(stockItems, official, batches);
}

function buildHqPickupLines(
  stockItems: StockItemOption[],
  balances: InventoryBalanceRow[]
): StockLine[] {
  const byCode = new Map(balances.map((b) => [b.stock_item.item_code, b]));
  return HQ_STOCK_ITEM_CODES.map((code) => {
    const def = getStockByCode(code)!;
    const item = stockItems.find((s) => s.item_code === code);
    const row = byCode.get(code);
    const is_roti = (HQ_ROTI_ITEM_CODES as readonly string[]).includes(code);
    return {
      item_code: code,
      stock_item_id: item?.id ?? row?.stock_item_id ?? '',
      name: def.name,
      unit: row?.unit ?? def.base_unit,
      balance: Number(row?.quantity ?? 0),
      quantity: '',
      production_date: '',
      is_roti,
    };
  });
}

async function loadHqPickupLines(
  locationId: string,
  stockItems: StockItemOption[]
): Promise<StockLine[]> {
  const { balances: rows } = await fetchBalances(locationId);
  const official = rows.filter((r) => isHqStockItemCode(r.stock_item.item_code));
  return buildHqPickupLines(stockItems, official);
}

function countStopUnits(lines: StockLine[]): number {
  let total = 0;
  for (const line of lines) {
    if (line.is_roti && line.batches?.length) {
      for (const batch of line.batches) total += Number(batch.quantity) || 0;
    } else {
      total += Number(line.quantity) || 0;
    }
  }
  return total;
}

function buildAllocationsFromStops(
  pickupStops: PickupStop[],
  dropStops: DropStop[]
): { pickups: PickupAllocation[]; drops: DropAllocation[] } {
  const pickups: PickupAllocation[] = pickupStops
    .filter((s) => s.locationId)
    .map((s) => {
      const items: PickupAllocation['items'] = [];
      for (const line of s.lines) {
        if (line.is_roti && line.batches?.length) {
          for (const batch of line.batches) {
            const qty = Number(batch.quantity);
            if (qty <= 0 || batch.expired) continue;
            items.push({
              stock_item_id: line.stock_item_id,
              item_code: line.item_code,
              quantity: qty,
              unit: line.unit,
              production_date: batch.production_date,
              expires_on: batch.expires_on,
            });
          }
        } else if (Number(line.quantity) > 0) {
          items.push({
            stock_item_id: line.stock_item_id,
            item_code: line.item_code,
            quantity: Number(line.quantity),
            unit: line.unit,
          });
        }
      }
      return { locationId: s.locationId, items };
    })
    .filter((p) => p.items.length > 0);

  const drops: DropAllocation[] = dropStops
    .filter((s) => s.locationId)
    .map((s) => ({
      locationId: s.locationId,
      items: s.lines
        .filter((l) => Number(l.quantity) > 0)
        .map((l) => ({
          stock_item_id: l.stock_item_id,
          item_code: l.item_code,
          quantity: Number(l.quantity),
          unit: l.unit,
        })),
    }))
    .filter((d) => d.items.length > 0);

  return { pickups, drops };
}

function formatLegItemLabel(item: TransferLeg['items'][number]): string {
  const name = getStockByCode(item.item_code)?.name ?? item.item_code;
  const qty = formatStockQuantity(item.quantity, item.unit, { item_code: item.item_code });
  if (item.production_date) {
    return `${name} ${qty} · prod ${formatExpiryDate(item.production_date)}`;
  }
  return `${name} ${qty}`;
}

function JourneyPreviewPanel({
  kiosks,
  pickupStops,
  dropStops,
  legs,
  totalsBalanced,
}: {
  kiosks: InventoryLocation[];
  pickupStops: PickupStop[];
  dropStops: DropStop[];
  legs: TransferLeg[];
  totalsBalanced: boolean;
}) {
  const labelFor = (locationId: string) => {
    const loc = kiosks.find((k) => k.id === locationId);
    return loc ? formatBranchDestination(loc) : 'Cawangan';
  };

  const pickupNodes = pickupStops
    .filter((s) => s.locationId)
    .map((s) => ({
      id: s.locationId,
      label: labelFor(s.locationId),
      sub: countStopUnits(s.lines) > 0 ? `${countStopUnits(s.lines)} unit` : 'Tiada kuantiti',
    }));

  const dropNodes = dropStops
    .filter((s) => s.locationId)
    .map((s) => ({
      id: s.locationId,
      label: labelFor(s.locationId),
      sub: countStopUnits(s.lines) > 0 ? `${countStopUnits(s.lines)} unit` : 'Tiada kuantiti',
    }));

  if (!pickupNodes.length && !dropNodes.length) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pratonton perjalanan
      </p>

      <div className="flex flex-wrap items-center gap-1">
        {pickupNodes.map((node, i) => (
          <div key={`pick-${node.id}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-center">
              <ArrowDownToLine className="mx-auto h-3.5 w-3.5 text-emerald-700" />
              <p className="text-[10px] font-semibold text-emerald-900">Ambil</p>
              <p className="max-w-[100px] truncate text-[9px] font-medium">{node.label}</p>
              <p className="max-w-[100px] truncate text-[9px] text-muted-foreground">{node.sub}</p>
            </div>
          </div>
        ))}

        {pickupNodes.length > 0 && dropNodes.length > 0 && (
          <ArrowRight className="mx-1 h-4 w-4 shrink-0 text-muted-foreground/70" />
        )}

        {dropNodes.map((node, i) => (
          <div key={`drop-${node.id}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-center">
              <ArrowUpFromLine className="mx-auto h-3.5 w-3.5 text-amber-700" />
              <p className="text-[10px] font-semibold text-amber-900">Hantar</p>
              <p className="max-w-[100px] truncate text-[9px] font-medium">{node.label}</p>
              <p className="max-w-[100px] truncate text-[9px] text-muted-foreground">{node.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {totalsBalanced && legs.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pindahan kiosk → kiosk ({legs.length})
          </p>
          {legs.map((leg, idx) => (
            <div key={`${leg.from_location_id}-${leg.to_location_id}-${idx}`} className="rounded-lg border bg-card p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                <Store className="h-3.5 w-3.5 text-emerald-700" />
                <span className="truncate">{labelFor(leg.from_location_id)}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <Store className="h-3.5 w-3.5 text-amber-700" />
                <span className="truncate">{labelFor(leg.to_location_id)}</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 pl-1 text-muted-foreground">
                {leg.items.map((item) => (
                  <li key={`${item.item_code}-${item.production_date ?? 'x'}`}>
                    · {formatLegItemLabel(item)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        pickupNodes.length > 0 &&
        dropNodes.length > 0 && (
          <p className="border-t pt-2 text-[11px] text-muted-foreground">
            {totalsBalanced
              ? 'Masukkan kuantiti stok untuk pratonton pindahan.'
              : 'Seimbangkan jumlah diambil = dihantar untuk pratonton pindahan penuh.'}
          </p>
        )
      )}
    </div>
  );
}

function BranchSelect({
  kiosks,
  value,
  excludeIds,
  onChange,
  placeholder,
}: {
  kiosks: InventoryLocation[];
  value: string;
  excludeIds: Set<string>;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState('');
  const selected = kiosks.find((k) => k.id === value);
  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kiosks.filter((k) => {
      if (excludeIds.has(k.id) && k.id !== value) return false;
      if (!q) return true;
      const name = k.branch?.branch_name ?? k.name;
      const code = k.branch?.branch_code ?? '';
      return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
    });
  }, [kiosks, search, excludeIds, value]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="h-9 pl-8 text-sm"
          placeholder="Cari cawangan…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder}>
            {selected ? formatBranchDestination(selected) : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-56">
          {options.map((k) => (
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
  );
}

function ExpiryBadge({ daysUntil }: { daysUntil: number }) {
  const { label, tone } = rotiExpiryStatusLabel(daysUntil);
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-normal',
        tone === 'danger' && 'border-red-300 bg-red-50 text-red-800',
        tone === 'warn' && 'border-amber-300 bg-amber-50 text-amber-900',
        tone === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-800'
      )}
    >
      {label}
    </Badge>
  );
}

function StockGrid({
  lines,
  mode,
  onChange,
  pickupRotiMode = 'batch',
}: {
  lines: StockLine[];
  mode: 'pickup' | 'drop';
  onChange: (lines: StockLine[]) => void;
  /** batch = kiosk batch roti; aggregate = HQ / single-line prod date */
  pickupRotiMode?: 'batch' | 'aggregate';
}) {
  function updateBatchQty(lineIdx: number, batchIdx: number, quantity: string) {
    onChange(
      lines.map((line, i) => {
        if (i !== lineIdx || !line.batches) return line;
        return {
          ...line,
          batches: line.batches.map((b, j) => (j === batchIdx ? { ...b, quantity } : b)),
        };
      })
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 font-medium">Stok (9 jenis)</th>
            {mode === 'pickup' && (
              <>
                <th className="px-2 py-2 font-medium w-28">Tarikh prod.</th>
                <th className="px-2 py-2 font-medium w-28">Luput</th>
                <th className="px-2 py-2 font-medium w-24">Status</th>
              </>
            )}
            <th className="px-2 py-2 font-medium w-24">Baki</th>
            <th className="px-2 py-2 font-medium w-24">
              {mode === 'pickup' ? 'Diambil' : 'Dihantar'}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const useRotiBatches =
              mode === 'pickup' && line.is_roti && pickupRotiMode === 'batch';

            if (useRotiBatches) {
              const batches = line.batches ?? [];
              if (!batches.length) {
                return (
                  <tr key={line.item_code} className="border-b bg-muted/10">
                    <td className="px-2 py-2" colSpan={6}>
                      <p className="font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Tiada batch roti direkod — baki agregat{' '}
                        {formatStockQuantity(line.balance, line.unit, {
                          item_code: line.item_code,
                        })}
                      </p>
                    </td>
                  </tr>
                );
              }
              return batches.map((batch, batchIdx) => (
                <tr
                  key={`${line.item_code}-${batch.production_date}`}
                  className={cn(
                    'border-b last:border-0',
                    batch.expired && 'bg-red-50/50 opacity-60',
                    batch.expiring_soon && !batch.expired && 'bg-amber-50/40'
                  )}
                >
                  <td className="px-2 py-1.5">
                    {batchIdx === 0 && (
                      <>
                        <p className="font-medium leading-tight">{line.name}</p>
                        <p className="text-[10px] text-muted-foreground">{line.item_code}</p>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{formatExpiryDate(batch.production_date)}</td>
                  <td className="px-2 py-1.5 text-xs">{formatExpiryDate(batch.expires_on)}</td>
                  <td className="px-2 py-1.5">
                    <ExpiryBadge daysUntil={batch.days_until_expiry} />
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {formatStockQuantity(batch.balance, line.unit, {
                      item_code: line.item_code,
                    })}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      max={batch.expired ? 0 : batch.balance}
                      step="1"
                      className="h-8"
                      disabled={batch.expired}
                      value={batch.quantity}
                      onChange={(e) => updateBatchQty(idx, batchIdx, e.target.value)}
                    />
                  </td>
                </tr>
              ));
            }

            return (
              <tr key={line.item_code} className="border-b last:border-0">
                <td
                  className="px-2 py-1.5"
                  colSpan={mode === 'pickup' && pickupRotiMode === 'aggregate' && line.is_roti ? 1 : mode === 'pickup' ? 4 : 1}
                >
                  <p className="font-medium leading-tight">{line.name}</p>
                  <p className="text-[10px] text-muted-foreground">{line.item_code}</p>
                  {mode === 'drop' && line.is_roti && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Tarikh prod. ikut batch ambil (shelf life {ROTI_SHELF_LIFE_DAYS} hari)
                    </p>
                  )}
                </td>
                {mode === 'pickup' && pickupRotiMode === 'aggregate' && line.is_roti && (
                  <>
                    <td className="px-2 py-1.5">
                      <Input
                        type="date"
                        className="h-8"
                        value={line.production_date}
                        onChange={(e) => {
                          const val = e.target.value;
                          onChange(
                            lines.map((l, i) =>
                              i === idx ? { ...l, production_date: val } : l
                            )
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {line.production_date
                        ? formatExpiryDate(
                            new Date(line.production_date + 'T00:00:00')
                              .toISOString()
                              .slice(0, 10)
                          )
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">—</td>
                  </>
                )}
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {mode === 'pickup'
                    ? formatStockQuantity(line.balance, line.unit, {
                        item_code: line.item_code,
                      })
                    : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min="0"
                    max={mode === 'pickup' ? line.balance : undefined}
                    step="1"
                    className="h-8"
                    value={line.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange(lines.map((l, i) => (i === idx ? { ...l, quantity: val } : l)));
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BranchTransferPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isAreaManager = profile ? isAreaManagerRole(profile.role) : false;
  const isOperationManager = profile ? isOperationManagerRole(profile.role) : false;

  const [kiosks, setKiosks] = useState<InventoryLocation[]>([]);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [pickupStops, setPickupStops] = useState<PickupStop[]>([]);
  const [dropStops, setDropStops] = useState<DropStop[]>([]);
  const [reasonPreset, setReasonPreset] = useState<string>(REASON_PRESETS[0].id);
  const [notes, setNotes] = useState('');
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadKiosks = useCallback(async () => {
    setLoading(true);
    try {
      const [{ locations }, { items }] = await Promise.all([
        fetchLocations('BRANCH_KIOSK'),
        fetchStockItems({ hq: true }),
      ]);
      setKiosks(sortBranchesByName(locations));
      setStockItems(items.filter((i) => isHqStockItemCode(i.item_code)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan cawangan');
    } finally {
      setLoading(false);
    }
  }, []);

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
  }, [loadKiosks]);

  useEffect(() => {
    if (kiosks.length) loadTransfers();
  }, [kiosks, loadTransfers]);

  const usedPickupIds = useMemo(
    () => new Set(pickupStops.map((s) => s.locationId).filter(Boolean)),
    [pickupStops]
  );
  const usedDropIds = useMemo(
    () => new Set(dropStops.map((s) => s.locationId).filter(Boolean)),
    [dropStops]
  );
  const excludeForPickup = useMemo(
    () => new Set([...usedPickupIds, ...usedDropIds]),
    [usedPickupIds, usedDropIds]
  );
  const excludeForDrop = useMemo(
    () => new Set([...usedPickupIds, ...usedDropIds]),
    [usedPickupIds, usedDropIds]
  );

  const branchCount = countUniqueBranches(
    pickupStops.filter((s) => s.locationId).map((s) => ({ locationId: s.locationId, items: [] })),
    dropStops.filter((s) => s.locationId).map((s) => ({ locationId: s.locationId, items: [] }))
  );

  const pickTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const stop of pickupStops) {
      for (const line of stop.lines) {
        if (line.is_roti && line.batches?.length) {
          for (const batch of line.batches) {
            const q = Number(batch.quantity);
            if (q > 0) {
              totals.set(line.item_code, (totals.get(line.item_code) ?? 0) + q);
            }
          }
        } else {
          const q = Number(line.quantity);
          if (q > 0) {
            totals.set(line.item_code, (totals.get(line.item_code) ?? 0) + q);
          }
        }
      }
    }
    return totals;
  }, [pickupStops]);

  const dropTotals = useMemo(() => {
    const drops = dropStops.map((s) => ({
      items: s.lines
        .filter((l) => Number(l.quantity) > 0)
        .map((l) => ({
          stock_item_id: l.stock_item_id,
          item_code: l.item_code,
          quantity: Number(l.quantity),
          unit: l.unit,
        })),
    }));
    return itemTotals(drops);
  }, [dropStops]);

  async function loadPickupBalances(stopKey: string, locationId: string) {
    if (!locationId) return;
    try {
      const lines = await loadPickupLinesForLocation(locationId, stockItems);
      setPickupStops((prev) =>
        prev.map((s) => (s.key === stopKey ? { ...s, locationId, lines } : s))
      );
    } catch {
      toast.error('Gagal memuatkan baki cawangan');
    }
  }

  async function addPickupStop() {
    if (branchCount >= MAX_REBALANCE_BRANCHES) {
      toast.error(`Maksimum ${MAX_REBALANCE_BRANCHES} cawangan`);
      return;
    }
    const available = kiosks.find((k) => !excludeForPickup.has(k.id));
    const stopKey = newKey();
    const locationId = available?.id ?? '';
    let lines = emptyStockLines(stockItems);
    if (locationId) {
      try {
        lines = await loadPickupLinesForLocation(locationId, stockItems);
      } catch {
        toast.error('Gagal memuatkan baki cawangan');
        return;
      }
    }
    setPickupStops((prev) => [...prev, { key: stopKey, locationId, lines }]);
  }

  function addDropStop() {
    if (branchCount >= MAX_REBALANCE_BRANCHES) {
      toast.error(`Maksimum ${MAX_REBALANCE_BRANCHES} cawangan`);
      return;
    }
    const available = kiosks.find((k) => !excludeForDrop.has(k.id));
    setDropStops((prev) => [
      ...prev,
      {
        key: newKey(),
        locationId: available?.id ?? '',
        lines: emptyStockLines(stockItems),
      },
    ]);
  }

  function buildNotes(): string {
    const preset = REASON_PRESETS.find((r) => r.id === reasonPreset)?.label ?? '';
    return [preset, notes.trim()].filter(Boolean).join(' — ');
  }

  function toAllocations(): { pickups: PickupAllocation[]; drops: DropAllocation[] } {
    const { pickups, drops } = buildAllocationsFromStops(pickupStops, dropStops);

    for (const s of pickupStops) {
      for (const line of s.lines) {
        if (line.is_roti && line.batches?.length) {
          for (const batch of line.batches) {
            const qty = Number(batch.quantity);
            if (qty <= 0) continue;
            if (batch.expired) {
              throw new Error(`${line.name} (${batch.production_date}): batch sudah luput`);
            }
            if (qty > batch.balance) {
              throw new Error(`${line.name}: kuantiti melebihi baki batch (${batch.balance})`);
            }
          }
        } else if (Number(line.quantity) > 0 && Number(line.quantity) > line.balance) {
          throw new Error(`${line.name}: kuantiti melebihi baki (${line.balance})`);
        }
      }
    }

    return { pickups, drops };
  }

  async function submit(dispatchNow: boolean) {
    let pickups: PickupAllocation[];
    let drops: DropAllocation[];
    try {
      ({ pickups, drops } = toAllocations());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Data tidak sah');
      return;
    }

    const validation = validateRebalancePlan(pickups, drops);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    const legs = buildTransferLegs(pickups, drops);
    if (!legs.length) {
      toast.error('Tiada pindahan untuk dihantar');
      return;
    }

    setSubmitting(true);
    try {
      const noteText = buildNotes();
      let created = 0;
      for (const leg of legs) {
        const { result } = await createTransfer({
          from_location_id: leg.from_location_id,
          to_location_id: leg.to_location_id,
          items: leg.items.map((i) => ({
            stock_item_id: i.stock_item_id,
            quantity: i.quantity,
            unit: i.unit,
            ...(i.production_date ? { production_date: i.production_date } : {}),
          })),
          notes: noteText,
        });
        if (dispatchNow) {
          const transferId = (result as { transfer_id?: string }).transfer_id;
          if (transferId) await dispatchTransfer(transferId);
        }
        created++;
      }

      toast.success(
        dispatchNow
          ? `${created} pindahan dihantar — destinasi sahkan penerimaan`
          : `${created} draf pindahan dicipta`
      );

      setPickupStops([]);
      setDropStops([]);
      loadTransfers();
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

  const totalsBalanced = HQ_STOCK_ITEM_CODES.every(
    (code) => (pickTotals.get(code) ?? 0) === (dropTotals.get(code) ?? 0)
  );

  const previewLegs = useMemo(() => {
    if (!totalsBalanced || !pickupStops.length || !dropStops.length) return [];
    const { pickups, drops } = buildAllocationsFromStops(pickupStops, dropStops);
    const validation = validateRebalancePlan(pickups, drops);
    if (!validation.ok) return [];
    return buildTransferLegs(pickups, drops);
  }, [pickupStops, dropStops, totalsBalanced]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Pelan Pindah Stok Antara Cawangan</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Tetapkan kawasan <strong>ambil (pickup)</strong> dan <strong>hantar (drop)</strong>.
            Roti dipantau ikut <strong>batch tarikh production</strong> — shelf life{' '}
            <strong>{ROTI_SHELF_LIFE_DAYS} hari</strong> sebelum luput. Batch luput tidak boleh
            dipindahkan.
            {isAreaManager && ' Skop: cawangan dalam kawasan anda sahaja.'}
            {isOperationManager && ' Skop: semua cawangan organisasi.'}
          </p>
        </div>
        <Badge variant={branchCount > MAX_REBALANCE_BRANCHES ? 'destructive' : 'outline'}>
          {pickupStops.length} ambil · {dropStops.length} hantar · {branchCount}/
          {MAX_REBALANCE_BRANCHES} cawangan
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
        <div className="space-y-1.5">
          <Label>Nota tambahan</Label>
          <Textarea
            placeholder="Pilihan"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
      </div>

      <JourneyPreviewPanel
        kiosks={kiosks}
        pickupStops={pickupStops}
        dropStops={dropStops}
        legs={previewLegs}
        totalsBalanced={totalsBalanced}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Pickup */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-emerald-700" />
              <h4 className="font-semibold text-emerald-900">Ambil (Pickup)</h4>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={branchCount >= MAX_REBALANCE_BRANCHES}
              onClick={addPickupStop}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Tambah cawangan
            </Button>
          </div>

          {pickupStops.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Tiada cawangan ambil — klik Tambah cawangan.
            </p>
          ) : (
            pickupStops.map((stop) => {
              const loc = kiosks.find((k) => k.id === stop.locationId);
              return (
                <div
                  key={stop.key}
                  className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/30 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Label className="text-xs text-emerald-800">Cawangan ambil</Label>
                      <BranchSelect
                        kiosks={kiosks}
                        value={stop.locationId}
                        excludeIds={excludeForPickup}
                        placeholder="Pilih cawangan ambil"
                        onChange={(id) => loadPickupBalances(stop.key, id)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() =>
                        setPickupStops((prev) => prev.filter((s) => s.key !== stop.key))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {loc && (
                    <p className="text-xs text-muted-foreground">
                      Baki & batch roti di {formatBranchDestination(loc)} — luput = prod +{' '}
                      {ROTI_SHELF_LIFE_DAYS} hari
                    </p>
                  )}
                  <StockGrid
                    mode="pickup"
                    lines={stop.lines}
                    onChange={(lines) =>
                      setPickupStops((prev) =>
                        prev.map((s) => (s.key === stop.key ? { ...s, lines } : s))
                      )
                    }
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Drop */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-amber-700" />
              <h4 className="font-semibold text-amber-900">Hantar (Drop)</h4>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={branchCount >= MAX_REBALANCE_BRANCHES}
              onClick={addDropStop}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Tambah cawangan
            </Button>
          </div>

          {dropStops.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Tiada cawangan hantar — klik Tambah cawangan.
            </p>
          ) : (
            dropStops.map((stop) => {
              const loc = kiosks.find((k) => k.id === stop.locationId);
              return (
                <div
                  key={stop.key}
                  className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/30 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Label className="text-xs text-amber-800">Cawangan hantar</Label>
                      <BranchSelect
                        kiosks={kiosks}
                        value={stop.locationId}
                        excludeIds={excludeForDrop}
                        placeholder="Pilih cawangan hantar"
                        onChange={(id) =>
                          setDropStops((prev) =>
                            prev.map((s) =>
                              s.key === stop.key ? { ...s, locationId: id } : s
                            )
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() =>
                        setDropStops((prev) => prev.filter((s) => s.key !== stop.key))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {loc && (
                    <p className="text-xs text-muted-foreground">
                      Destinasi: {formatBranchDestination(loc)}
                    </p>
                  )}
                  <StockGrid
                    mode="drop"
                    lines={stop.lines}
                    onChange={(lines) =>
                      setDropStops((prev) =>
                        prev.map((s) => (s.key === stop.key ? { ...s, lines } : s))
                      )
                    }
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Summary 9 stock types */}
      {(pickupStops.length > 0 || dropStops.length > 0) && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ringkasan 9 jenis stok — diambil vs dihantar
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2">Item</th>
                  <th className="py-1.5 pr-2 w-24">Diambil</th>
                  <th className="py-1.5 pr-2 w-24">Dihantar</th>
                  <th className="py-1.5 w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {HQ_STOCK_ITEM_CODES.map((code) => {
                  const pick = pickTotals.get(code) ?? 0;
                  const drop = dropTotals.get(code) ?? 0;
                  if (pick === 0 && drop === 0) return null;
                  const def = getStockByCode(code)!;
                  const match = pick === drop;
                  return (
                    <tr key={code} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">{def.name}</td>
                      <td className="py-1.5 pr-2">{pick || '—'}</td>
                      <td className="py-1.5 pr-2">{drop || '—'}</td>
                      <td className="py-1.5">
                        {match ? (
                          <CheckIcon />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!totalsBalanced && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              Jumlah diambil mesti sama dengan jumlah dihantar untuk setiap jenis stok.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          disabled={submitting || !totalsBalanced || !pickupStops.length || !dropStops.length}
          onClick={() => submit(true)}
        >
          {submitting ? 'Memproses…' : 'Hantar Pelan'}
        </Button>
        <Button
          variant="outline"
          disabled={submitting || !totalsBalanced || !pickupStops.length || !dropStops.length}
          onClick={() => submit(false)}
        >
          Simpan Draf
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Sistem pecahkan pelan kepada pindahan kiosk→kiosk. Hantar Pelan: tolak stok dari cawangan
        ambil serta-merta. Maksimum {MAX_REBALANCE_BRANCHES} cawangan (ambil + hantar).
      </p>

      <div className="space-y-3 border-t pt-6">
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

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-emerald-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
