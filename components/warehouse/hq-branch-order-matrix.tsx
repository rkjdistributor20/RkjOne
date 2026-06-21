'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, User } from 'lucide-react';
import type { OrderSuggestionBranch } from '@/lib/production/types';
import { driversForRegion } from '@/lib/production/driver-routing';
import { HQ_ROTI_ITEM_CODES } from '@/lib/stock/catalog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

export function HqBranchOrderMatrix({
  branches,
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
      const region = b.region_code ?? 'LAIN';
      const list = map.get(region) ?? [];
      list.push(b);
      map.set(region, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.branch_code.localeCompare(b.branch_code));
    }
    return map;
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
      next[branch.branch_id][item.item_code] = String(item.suggested_bags);
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
        Tiada cadangan cawangan — semak baki stok kiosk.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={applyAllDrivers} disabled={disabled}>
        <User className="h-3 w-3" />
        Auto-tugaskan driver ikut kawasan
      </Button>

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
            {openRegions[region] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {openRegions[region] && (
            <div className="divide-y">
              {regionBranches.map((branch) => {
                const regionDrivers = driversForRegion(allDrivers, branch.region_code);
                const selectedDriver =
                  branchDrivers[branch.branch_id] ?? branch.default_driver_id ?? '';

                return (
                  <div key={branch.branch_id} className="px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{branch.branch_name}</p>
                        <p className="text-xs text-muted-foreground">{branch.branch_code}</p>
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
                        return (
                          <div
                            key={code}
                            className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {hint?.name ?? code.replace('ST-', '')}
                            </span>
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
