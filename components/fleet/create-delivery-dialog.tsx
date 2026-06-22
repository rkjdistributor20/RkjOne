'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Factory,
  Warehouse,
  Truck,
  Store,
  Search,
  Info,
  Plus,
  Trash2,
  Sparkles,
  Navigation,
} from 'lucide-react';
import { createDeliveryOrder, optimizeRoutePreview } from '@/lib/fleet/api';
import type { InventoryLocation, StockItemOption } from '@/lib/inventory/types';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { HQ_FACTORY_ORDER_SECTIONS } from '@/lib/production/hq-order-format';
import {
  buildManualDeliveryLegs,
  createEmptyManualInstructions,
  MAX_MANUAL_DELIVERY_INSTRUCTIONS,
  validateManualInstructions,
  type ManualDeliveryInstruction,
} from '@/lib/fleet/manual-delivery';
import { readCurrentPosition, reorderByKeys } from '@/lib/fleet/route-ai';
import {
  formatBranchDestination,
  formatBranchDestinationDetail,
  formatDriverName,
  formatFleetSlot,
  formatLocationNode,
  formatStockItemDetail,
  formatStockItemName,
  formatVehicleName,
  fleetLocationForVehicle,
  sortBranchesByName,
  vehicleForDriver,
} from '@/lib/fleet/display-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FleetDriver, FleetVehicle } from '@/lib/fleet/types';

type StockOrigin = 'FROM_FACTORY' | 'FROM_HQ';

interface CreateDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: InventoryLocation[];
  stockItems: StockItemOption[];
  drivers: FleetDriver[];
  vehicles: FleetVehicle[];
  onSuccess: () => void;
}

function emptyInstruction(
  branches: InventoryLocation[],
  defaultItemId: string
): ManualDeliveryInstruction {
  return createEmptyManualInstructions(1, branches[0]?.id ?? '', defaultItemId)[0]!;
}

function createEmptyInstructions(
  count: number,
  branches: InventoryLocation[],
  defaultItemId: string
): ManualDeliveryInstruction[] {
  return createEmptyManualInstructions(count, branches[0]?.id ?? '', defaultItemId);
}

export function CreateDeliveryDialog({
  open,
  onOpenChange,
  locations = [],
  stockItems = [],
  drivers = [],
  vehicles = [],
  onSuccess,
}: CreateDeliveryDialogProps) {
  const factory = useMemo(
    () => locations.find((l) => l.location_type === 'FACTORY'),
    [locations]
  );
  const hq = useMemo(
    () => locations.find((l) => l.location_type === 'HQ_WAREHOUSE'),
    [locations]
  );
  const fleetLocs = useMemo(
    () => locations.filter((l) => l.location_type === 'FLEET_VEHICLE'),
    [locations]
  );
  const branches = useMemo(
    () => sortBranchesByName(locations.filter((l) => l.location_type === 'BRANCH_KIOSK')),
    [locations]
  );

  const hqStockItems = useMemo(() => {
    const codes = new Set(HQ_FACTORY_ORDER_SECTIONS.flatMap((s) => s.itemCodes));
    return stockItems.filter((s) => codes.has(s.item_code as never));
  }, [stockItems]);

  const defaultItemId = hqStockItems[0]?.id ?? '';

  const [stockOrigin, setStockOrigin] = useState<StockOrigin>('FROM_FACTORY');
  const [branchSearch, setBranchSearch] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [instructions, setInstructions] = useState<ManualDeliveryInstruction[]>([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const slotsLeft = MAX_MANUAL_DELIVERY_INSTRUCTIONS - instructions.length;
  const allSelected =
    instructions.length > 0 && selectedKeys.size === instructions.length;
  const someSelected = selectedKeys.size > 0;

  const selectedDriver = drivers.find((d) => d.id === driverId);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const fleetSlot = fleetLocationForVehicle(vehicleId, fleetLocs);

  const filteredBranches = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => {
      const name = b.branch?.branch_name ?? b.name;
      const code = b.branch?.branch_code ?? '';
      return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
    });
  }, [branches, branchSearch]);

  useEffect(() => {
    if (!open) return;
    setStockOrigin('FROM_FACTORY');
    setBranchSearch('');
    setScheduledDate(new Date().toISOString().slice(0, 10));
    if (drivers.length) setDriverId(drivers[0].id);
    setInstructions([emptyInstruction(branches, defaultItemId)]);
    setAiSummary(null);
    setPosition(null);
    setSelectedKeys(new Set());
  }, [open, branches, drivers, defaultItemId]);

  useEffect(() => {
    if (!driverId) return;
    const linked = vehicleForDriver(driverId, vehicles);
    if (linked) setVehicleId(linked.id);
  }, [driverId, vehicles]);

  const parsedInstructions = useMemo(
    () =>
      instructions.map((row) => ({
        destId: row.destId,
        itemId: row.itemId,
        quantity: Number(row.qty),
      })),
    [instructions]
  );

  const journeyNodes = useMemo(() => {
    const nodes: Array<{ icon: typeof Factory; label: string; sub?: string }> = [];
    if (stockOrigin === 'FROM_FACTORY' && factory) {
      nodes.push({ icon: Factory, label: 'Kilang', sub: formatLocationNode(factory) });
    }
    if (hq) {
      nodes.push({ icon: Warehouse, label: HQ_DISTRIBUTOR_LABEL, sub: 'Cross-dock & agregat' });
    }
    if (fleetSlot || selectedVehicle) {
      nodes.push({
        icon: Truck,
        label: LOGISTIK_LABEL,
        sub: selectedVehicle
          ? formatVehicleName(selectedVehicle)
          : formatFleetSlot(fleetSlot),
      });
    }
    instructions.forEach((row, idx) => {
      const branch = branches.find((b) => b.id === row.destId);
      if (!branch) return;
      nodes.push({
        icon: Store,
        label: `Hentian ${idx + 1}`,
        sub: formatBranchDestination(branch),
      });
    });
    return nodes;
  }, [stockOrigin, factory, hq, fleetSlot, selectedVehicle, instructions, branches]);

  function updateInstruction(key: string, patch: Partial<ManualDeliveryInstruction>) {
    setInstructions((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
    setAiSummary(null);
  }

  function addInstructionsBulk(count: number) {
    const room = MAX_MANUAL_DELIVERY_INSTRUCTIONS - instructions.length;
    const n = Math.min(count, room);
    if (n <= 0) {
      toast.error(`Maksimum ${MAX_MANUAL_DELIVERY_INSTRUCTIONS} arahan dalam satu pesanan`);
      return;
    }
    setInstructions((prev) => [
      ...prev,
      ...createEmptyInstructions(n, branches, defaultItemId),
    ]);
    setAiSummary(null);
    if (n > 1) toast.success(`${n} baris arahan ditambah`);
  }

  function fillToMaxInstructions() {
    addInstructionsBulk(slotsLeft);
  }

  function toggleSelectInstruction(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllInstructions() {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(instructions.map((r) => r.key)));
    }
  }

  function removeSelectedInstructions() {
    if (!someSelected) {
      toast.error('Tandakan arahan untuk dipadam');
      return;
    }
    if (instructions.length - selectedKeys.size < 1) {
      toast.error('Sekurang-kurangnya satu arahan mesti kekal dalam pesanan');
      return;
    }
    const removed = selectedKeys.size;
    setInstructions((prev) => prev.filter((row) => !selectedKeys.has(row.key)));
    setSelectedKeys(new Set());
    setAiSummary(null);
    toast.success(`${removed} arahan dipadam`);
  }

  function resetAllInstructions() {
    setInstructions([emptyInstruction(branches, defaultItemId)]);
    setSelectedKeys(new Set());
    setAiSummary(null);
    toast.success('Senarai arahan dikosongkan');
  }

  function removeInstruction(key: string) {
    setInstructions((prev) => {
      if (prev.length <= 1) {
        toast.error('Sekurang-kurangnya satu arahan diperlukan');
        return prev;
      }
      return prev.filter((row) => row.key !== key);
    });
    setSelectedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setAiSummary(null);
  }

  async function captureGps() {
    setGpsLoading(true);
    try {
      const pos = await readCurrentPosition();
      if (!pos) {
        toast.error('Tidak dapat lokasi GPS — benarkan akses lokasi');
        return;
      }
      setPosition(pos);
      toast.success('Lokasi semasa direkod');
    } finally {
      setGpsLoading(false);
    }
  }

  async function handleAiSort() {
    const valid = instructions.filter(
      (r) => r.destId && r.itemId && Number(r.qty) > 0
    );
    if (!valid.length) {
      toast.error('Isi sekurang-kurangnya satu arahan lengkap');
      return;
    }

    setOptimizing(true);
    try {
      let lat = position?.lat;
      let lng = position?.lng;
      if (lat == null || lng == null) {
        const pos = await readCurrentPosition();
        if (pos) {
          setPosition(pos);
          lat = pos.lat;
          lng = pos.lng;
        }
      }

      const { result } = await optimizeRoutePreview({
        stops: valid.map((r) => ({ key: r.key, location_id: r.destId })),
        current_lat: lat,
        current_lng: lng,
      });

      setInstructions((prev) => reorderByKeys(prev, result.orderedKeys));
      setAiSummary(result.summary);
      toast.success(result.usedGps ? 'Laluan disusun dari GPS' : 'Laluan disusun AI');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal susun laluan');
    } finally {
      setOptimizing(false);
    }
  }

  async function handleCreate() {
    if (!hq?.id || !driverId || !vehicleId) {
      toast.error(`Sila pilih pemandu dan pastikan ${HQ_DISTRIBUTOR_LABEL} wujud`);
      return;
    }

    const slot = fleetLocationForVehicle(vehicleId, fleetLocs);
    if (!slot) {
      toast.error(`Kenderaan pemandu tiada lokasi logistik — daftar dalam inventori`);
      return;
    }

    const originId = stockOrigin === 'FROM_FACTORY' ? factory?.id : hq.id;
    if (!originId) {
      toast.error(
        stockOrigin === 'FROM_FACTORY' ? 'Lokasi kilang tidak dijumpai' : `${HQ_DISTRIBUTOR_LABEL} tidak dijumpai`
      );
      return;
    }

    const validation = validateManualInstructions(parsedInstructions);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    const lastDest = parsedInstructions[parsedInstructions.length - 1]?.destId;
    if (!lastDest) {
      toast.error('Tiada destinasi akhir');
      return;
    }

    setLoading(true);
    try {
      const legs = buildManualDeliveryLegs({
        stockOrigin,
        factoryId: factory?.id,
        hqId: hq.id,
        fleetSlotId: slot.id,
        driverId,
        vehicleId,
        instructions: parsedInstructions,
      });

      await createDeliveryOrder({
        origin_location_id: originId,
        final_destination_id: lastDest,
        primary_driver_id: driverId,
        primary_vehicle_id: vehicleId,
        scheduled_date: scheduledDate,
        ai_route_summary: aiSummary ?? undefined,
        notes:
          stockOrigin === 'FROM_HQ'
            ? `Penghantaran manual — ${instructions.length} arahan · stok dari ${HQ_DISTRIBUTOR_LABEL}${aiSummary ? ' · AI' : ''}`
            : `Penghantaran manual — ${instructions.length} arahan · stok dari Kilang${aiSummary ? ' · AI' : ''}`,
        legs,
      });

      toast.success(`Pesanan penghantaran dicipta (${instructions.length} arahan)`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal cipta penghantaran');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pesanan Penghantaran Manual</DialogTitle>
          <DialogDescription>
            Tambah atau padam sehingga {MAX_MANUAL_DELIVERY_INSTRUCTIONS} arahan (hentian cawangan)
            sekali gus dalam satu pesanan — pilih berbilang baris untuk padam pukal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-950">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Guna <strong>+1 / +5 / Isi {MAX_MANUAL_DELIVERY_INSTRUCTIONS}</strong> untuk tambah
            banyak baris sekaligus. Tandakan checkbox → <strong>Padam dipilih</strong> untuk buang
            berbilang arahan dalam satu pesanan.
          </span>
        </div>

        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pratonton perjalanan
            </p>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={gpsLoading}
                onClick={captureGps}
              >
                <Navigation className="mr-1 h-3 w-3" />
                {gpsLoading ? 'GPS…' : 'Lokasi'}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-violet-600 text-xs hover:bg-violet-700"
                disabled={optimizing || instructions.length === 0}
                onClick={handleAiSort}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {optimizing ? 'Menyusun…' : 'Susun AI'}
              </Button>
            </div>
          </div>
          {aiSummary && (
            <p className="mb-2 flex items-start gap-1 text-[10px] text-violet-800">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              {aiSummary}
            </p>
          )}
          {position && (
            <p className="mb-2 text-[10px] text-muted-foreground">
              GPS: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {journeyNodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tambah arahan untuk pratonton</p>
            ) : (
              journeyNodes.map((node, i) => (
                <div key={`${node.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                  <div className="rounded-lg border bg-card px-2.5 py-1.5 text-center">
                    <node.icon className="mx-auto h-3.5 w-3.5 text-emerald-700" />
                    <p className="text-[10px] font-semibold">{node.label}</p>
                    {node.sub && (
                      <p className="max-w-[96px] truncate text-[9px] text-muted-foreground">
                        {node.sub}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">1. Asal stok</Label>
            <Select
              value={stockOrigin}
              onValueChange={(v) => setStockOrigin(v as StockOrigin)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FROM_FACTORY">
                  Dari Kilang (production baharu → HQ → logistik)
                </SelectItem>
                <SelectItem value="FROM_HQ">
                  Dari {HQ_DISTRIBUTOR_LABEL} (stok sedia ada → logistik)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">2. Pemandu penghantaran</Label>
            <Select value={driverId} onValueChange={(v) => setDriverId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih pemandu">
                  {formatDriverName(selectedDriver)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {drivers.length === 0 ? (
                  <SelectItem value="no-driver" disabled>
                    Tiada pemandu aktif
                  </SelectItem>
                ) : (
                  drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="flex flex-col items-start">
                        <span>{d.full_name}</span>
                        {d.route_description && (
                          <span className="text-xs text-muted-foreground">
                            {d.route_description}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedVehicle && (
              <p className="text-xs text-muted-foreground">
                Kenderaan: <strong>{formatVehicleName(selectedVehicle)}</strong>
                {fleetSlot && ` · Slot ${formatFleetSlot(fleetSlot, selectedVehicle)}`}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-semibold">
                3. Arahan penghantaran ({instructions.length}/{MAX_MANUAL_DELIVERY_INSTRUCTIONS})
              </Label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 p-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                Tambah
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={slotsLeft <= 0}
                onClick={() => addInstructionsBulk(1)}
              >
                <Plus className="mr-1 h-3 w-3" />+1
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={slotsLeft < 3}
                onClick={() => addInstructionsBulk(3)}
              >
                +3
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={slotsLeft < 5}
                onClick={() => addInstructionsBulk(5)}
              >
                +5
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={slotsLeft <= 0}
                onClick={fillToMaxInstructions}
              >
                Isi {MAX_MANUAL_DELIVERY_INSTRUCTIONS} baris
              </Button>

              <span className="mx-1 hidden h-4 w-px bg-border sm:inline" />

              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                Padam
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={toggleSelectAllInstructions}
              >
                {allSelected ? 'Nyahpilih' : 'Pilih semua'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                disabled={!someSelected}
                onClick={removeSelectedInstructions}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Padam dipilih ({selectedKeys.size})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                disabled={instructions.length <= 1}
                onClick={resetAllInstructions}
              >
                Kosongkan semua
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari cawangan (tapisan senarai)…"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
              />
            </div>

            <div className="max-h-[min(52vh,520px)] space-y-3 overflow-y-auto pr-1">
              {instructions.map((row, idx) => {
                const branch = branches.find((b) => b.id === row.destId);
                const item = hqStockItems.find((s) => s.id === row.itemId);
                const qtyUnitLabel = item
                  ? formatStockItemDetail(item)?.split(' · ').pop()?.replace('Order dalam ', '') ??
                    'unit'
                  : 'unit';
                const isSelected = selectedKeys.has(row.key);

                return (
                  <div
                    key={row.key}
                    className={cn(
                      'rounded-lg border bg-card p-3 space-y-2 transition-colors',
                      isSelected && 'border-destructive/50 bg-destructive/5'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-input accent-emerald-600"
                          checked={isSelected}
                          onChange={() => toggleSelectInstruction(row.key)}
                          aria-label={`Pilih arahan ${idx + 1}`}
                        />
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Arahan {idx + 1}
                        </Badge>
                        {branch && (
                          <span className="text-xs text-muted-foreground truncate">
                            {formatBranchDestination(branch)}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-destructive"
                        disabled={instructions.length <= 1}
                        onClick={() => removeInstruction(row.key)}
                        title="Padam arahan ini"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Cawangan</Label>
                        <Select
                          value={row.destId}
                          onValueChange={(v) => updateInstruction(row.key, { destId: v ?? '' })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih cawangan">
                              {branch ? formatBranchDestination(branch) : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-52">
                            {filteredBranches.length === 0 ? (
                              <SelectItem value="none" disabled>
                                Tiada cawangan sepadan
                              </SelectItem>
                            ) : (
                              filteredBranches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  <span className="flex flex-col items-start">
                                    <span>{formatBranchDestination(b)}</span>
                                    {formatBranchDestinationDetail(b) && (
                                      <span className="text-xs text-muted-foreground">
                                        {formatBranchDestinationDetail(b)}
                                      </span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Stok</Label>
                        <Select
                          value={row.itemId}
                          onValueChange={(v) => updateInstruction(row.key, { itemId: v ?? '' })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih item">
                              {formatStockItemName(item)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {HQ_FACTORY_ORDER_SECTIONS.map((section) => {
                              const sectionItems = hqStockItems.filter((s) =>
                                section.itemCodes.includes(s.item_code as never)
                              );
                              if (!sectionItems.length) return null;
                              return (
                                <SelectGroup key={section.id}>
                                  <SelectLabel>{section.title}</SelectLabel>
                                  {sectionItems.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1 sm:max-w-[180px]">
                      <Label className="text-xs text-muted-foreground">
                        Kuantiti ({qtyUnitLabel})
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={row.qty}
                        onChange={(e) => updateInstruction(row.key, { qty: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">4. Tarikh penghantaran</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          {instructions.some((r) => r.destId && r.itemId && Number(r.qty) > 0) && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              <p className="font-medium text-emerald-950">Ringkasan</p>
              <p className="mt-1 text-emerald-900/90">
                <strong>{instructions.length} arahan</strong> ke{' '}
                {new Set(instructions.map((r) => r.destId).filter(Boolean)).size} cawangan melalui{' '}
                {formatDriverName(selectedDriver)}
                {stockOrigin === 'FROM_FACTORY' ? ' (via Kilang & HQ)' : ` (dari ${HQ_DISTRIBUTOR_LABEL})`}.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-emerald-900/80">
                {instructions.map((row, idx) => {
                  const branch = branches.find((b) => b.id === row.destId);
                  const item = hqStockItems.find((s) => s.id === row.itemId);
                  if (!branch || !item || Number(row.qty) <= 0) return null;
                  return (
                    <li key={row.key}>
                      {idx + 1}. {formatBranchDestination(branch)} — {row.qty}× {item.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Button
            className={cn('w-full bg-amber-500 hover:bg-amber-600')}
            onClick={handleCreate}
            disabled={loading || !fleetSlot}
          >
            {loading
              ? 'Mencipta…'
              : `Cipta Pesanan (${instructions.length} arahan)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
