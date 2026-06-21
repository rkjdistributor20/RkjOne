'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, User, TrendingUp } from 'lucide-react';
import type { OrderSuggestionBranch } from '@/lib/production/types';
import { driversForRegion } from '@/lib/production/driver-routing';
import { HQ_ROTI_ITEM_CODES } from '@/lib/stock/catalog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type BranchQtyMap = Record<string, Record<string, string>>;
export type BranchDriverMap = Record<string, string>;

interface DriverOption {
  id: string;
  driver_code: string;
  full_name: string;
}

interface HqBranchOrderMatrixProps {
  branches: OrderSuggestionBranch[];
  branchCount?: number;
  quantities: BranchQtyMap;
  branchDrivers: BranchDriverMap;
  onChange: (quantities: BranchQtyMap) => void;
  onDriverChange: (drivers: BranchDriverMap) => void;
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

export function HqBranchOrderMatrix({
  branches,
  branchCount,
  quantities,
  branchDrivers,
  onChange,
  onDriverChange,
  disabled,
}: HqBranchOrderMatrixProps) {
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({
    UTARA: true,
    TENGAH: true,
    SELATAN: true,
  });
  const [allDrivers, setAllDrivers] = useState<DriverOption[]>([]);

  useEffect(() => {
    fetch('/api/fleet/drivers')
      .then((r) => r.json())
      .then((d) => setAllDrivers(d.drivers ?? []))
      .catch(() => setAllDrivers([]));
  }, []);

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

  const totalSuggestedBags = useMemo(() => {
    let n = 0;
    for (const b of branches) {
      for (const item of b.items) n += item.suggested_bags;
    }
    return n;
  }, [branches]);

  function setQty(branchId: string, itemCode: string, value: string) {
    onChange({
      ...quantities,
      [branchId]: { ...(quantities[branchId] ?? {}), [itemCode]: value },
    });
  }

  function setDriver(branchId: string, driverId: string) {
    onDriverChange({ ...branchDrivers, [branchId]: driverId });
  }

  function applySuggestion(branch: OrderSuggestionBranch) {
    const next = { ...quantities, [branch.branch_id]: { ...(quantities[branch.branch_id] ?? {}) } };
    for (const item of branch.items) {
      if (item.suggested_bags > 0) {
        next[branch.branch_id][item.item_code] = String(item.suggested_bags);
      }
    }
    onChange(next);
    if (branch.default_driver_id) {
      onDriverChange({ ...branchDrivers, [branch.branch_id]: branch.default_driver_id });
    }
  }

  function applyAllDrivers() {
    const next = { ...branchDrivers };
    for (const b of branches) {
      if (b.default_driver_id) next[b.branch_id] = b.default_driver_id;
    }
    onDriverChange(next);
  }

  if (branches.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Tiada cawangan dijumpai — pastikan 36 kiosk cawangan wujud dalam sistem.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-950">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4" />
          {branchCount ?? branches.length} cawangan · {totalSuggestedBags} bag cadangan AI
        </p>
        <p className="mt-1 text-xs text-violet-900/80">
          Baki stok kiosk + ramalan ikut jualan 14 hari &amp; potensi lokasi (RNR/OBR/Plaza Tol).
          Klik <strong>Cadangan</strong> per cawangan atau guna butang di atas untuk isi semua.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          onClick={applyAllDrivers}
          disabled={disabled}
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
            onClick={() => setOpenRegions((p) => ({ ...p, [region]: !p[region] }))}
          >
            <span className="font-semibold">
              {REGION_LABELS[region] ?? region} · {regionBranches.length} cawangan
            </span>
            {openRegions[region] ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {openRegions[region] && (
            <div className="divide-y">
              {regionBranches.map((branch) => {
                const regionDrivers = driversForRegion(allDrivers, branch.region_code);
                const selectedDriver =
                  branchDrivers[branch.branch_id] ?? branch.default_driver_id ?? '';
                const branchSuggested = branch.items.reduce((s, i) => s + i.suggested_bags, 0);

                return (
                  <div key={branch.branch_id} className="px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{branch.branch_name}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{branch.branch_code}</span>
                          {branch.potential_factor != null && (
                            <Badge variant="secondary" className="text-[10px]">
                              Potensi ×{branch.potential_factor}
                            </Badge>
                          )}
                          {branch.branch_status === 'INACTIVE' && (
                            <Badge variant="outline" className="text-[10px]">
                              Tidak aktif
                            </Badge>
                          )}
                          {branch.has_kiosk === false && (
                            <Badge variant="destructive" className="text-[10px]">
                              Tiada kiosk
                            </Badge>
                          )}
                          {branch.avg_daily_sales != null && branch.avg_daily_sales > 0 && (
                            <span>RM{branch.avg_daily_sales}/hari</span>
                          )}
                          {branchSuggested > 0 && (
                            <span className="text-violet-700">AI: {branchSuggested} bag</span>
                          )}
                        </p>
                      </div>
                      <select
                        className="h-9 max-w-[200px] rounded-md border bg-background px-2 text-xs"
                        disabled={disabled}
                        value={selectedDriver}
                        onChange={(e) => setDriver(branch.branch_id, e.target.value)}
                      >
                        <option value="">Pilih driver…</option>
                        {regionDrivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.full_name} ({d.driver_code})
                          </option>
                        ))}
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
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {HQ_ROTI_ITEM_CODES.map((code) => {
                        const hint = branch.items.find((i) => i.item_code === code);
                        const val = quantities[branch.branch_id]?.[code] ?? '';
                        const status = hint?.stock_status ?? 'OK';
                        return (
                          <div
                            key={code}
                            className={cn(
                              'rounded-lg border px-2 py-1.5',
                              STOCK_STATUS_CLASS[status] ?? STOCK_STATUS_CLASS.OK
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between gap-1">
                              <span className="truncate text-xs font-medium">
                                {hint?.name ?? code.replace('ST-', '')}
                              </span>
                              {status !== 'OK' && (
                                <Badge
                                  variant={status === 'CRITICAL' ? 'destructive' : 'outline'}
                                  className="h-4 px-1 text-[9px]"
                                >
                                  {status}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                disabled={disabled}
                                className="h-8 w-14 px-1 text-center text-sm tabular-nums"
                                placeholder="0"
                                value={val}
                                onChange={(e) => setQty(branch.branch_id, code, e.target.value)}
                              />
                              <span className="text-[10px] text-muted-foreground">bag</span>
                            </div>
                            {hint && (
                              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                                Stok: <strong>{hint.current_pcs}</strong> pcs
                                {hint.suggested_bags > 0 && (
                                  <>
                                    {' '}
                                    · cadangan{' '}
                                    <strong className="text-violet-700">{hint.suggested_bags}</strong>{' '}
                                    bag
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function buildBranchItemsFromMatrix(
  branches: OrderSuggestionBranch[],
  quantities: BranchQtyMap,
  branchDrivers: BranchDriverMap,
  stockIdByCode: Map<string, string>
) {
  const items: Array<{
    branch_id: string;
    stock_item_id: string;
    quantity: number;
    unit?: string;
    assigned_driver_id?: string;
  }> = [];

  for (const branch of branches) {
    const driverId = branchDrivers[branch.branch_id] ?? branch.default_driver_id ?? undefined;
    for (const code of HQ_ROTI_ITEM_CODES) {
      const bags = Number(quantities[branch.branch_id]?.[code]) || 0;
      if (bags <= 0) continue;
      const stockItemId = stockIdByCode.get(code);
      if (!stockItemId) continue;
      const hint = branch.items.find((i) => i.item_code === code);
      const pcsPerBag =
        hint?.suggested_bags && hint.suggested_pcs
          ? hint.suggested_pcs / hint.suggested_bags
          : 20;
      items.push({
        branch_id: branch.branch_id,
        stock_item_id: stockItemId,
        quantity: bags * pcsPerBag,
        unit: 'PCS',
        assigned_driver_id: driverId,
      });
    }
  }
  return items;
}
