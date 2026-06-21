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
} from 'lucide-react';
import type { DeliveryLegType, FleetDriver, FleetVehicle } from '@/lib/fleet/types';
import { createDeliveryOrder } from '@/lib/fleet/api';
import type { InventoryLocation, StockItemOption } from '@/lib/inventory/types';
import { HQ_FACTORY_ORDER_SECTIONS } from '@/lib/production/hq-order-format';
import {
  formatBranchDestination,
  formatBranchDestinationDetail,
  formatDriverDetail,
  formatDriverName,
  formatFleetSlot,
  formatLocationNode,
  formatStockItemDetail,
  formatStockItemName,
  formatVehicleDetail,
  formatVehicleName,
  fleetLocationForVehicle,
  sortBranchesByName,
  vehicleForDriver,
} from '@/lib/fleet/display-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    const codes = new Set(
      HQ_FACTORY_ORDER_SECTIONS.flatMap((s) => s.itemCodes)
    );
    return stockItems.filter((s) => codes.has(s.item_code as never));
  }, [stockItems]);

  const [stockOrigin, setStockOrigin] = useState<StockOrigin>('FROM_FACTORY');
  const [destId, setDestId] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);

  const selectedBranch = branches.find((b) => b.id === destId);
  const selectedDriver = drivers.find((d) => d.id === driverId);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const selectedItem = hqStockItems.find((s) => s.id === itemId);
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
    setQty('1');
    if (branches.length) setDestId(branches[0].id);
    if (drivers.length) setDriverId(drivers[0].id);
    if (hqStockItems.length) setItemId(hqStockItems[0].id);
  }, [open, branches, drivers, hqStockItems]);

  useEffect(() => {
    if (!driverId) return;
    const linked = vehicleForDriver(driverId, vehicles);
    if (linked) setVehicleId(linked.id);
  }, [driverId, vehicles]);

  const journeyNodes = useMemo(() => {
    const nodes: Array<{ icon: typeof Factory; label: string; sub?: string }> = [];
    if (stockOrigin === 'FROM_FACTORY' && factory) {
      nodes.push({ icon: Factory, label: 'Kilang', sub: formatLocationNode(factory) });
    }
    if (hq) {
      nodes.push({ icon: Warehouse, label: 'Gudang HQ', sub: 'Cross-dock & agregat' });
    }
    if (fleetSlot || selectedVehicle) {
      nodes.push({
        icon: Truck,
        label: 'Armada',
        sub: selectedVehicle
          ? formatVehicleName(selectedVehicle)
          : formatFleetSlot(fleetSlot),
      });
    }
    if (selectedBranch) {
      nodes.push({
        icon: Store,
        label: 'Kiosk',
        sub: formatBranchDestination(selectedBranch),
      });
    }
    return nodes;
  }, [stockOrigin, factory, hq, fleetSlot, selectedVehicle, selectedBranch]);

  const qtyUnitLabel = selectedItem
    ? formatStockItemDetail(selectedItem)?.split(' · ').pop()?.replace('Order dalam ', '') ?? 'unit'
    : 'unit';

  async function handleCreate() {
    if (!destId || !hq?.id || !itemId || !driverId || !vehicleId) {
      toast.error('Sila pilih cawangan, pemandu dan stok');
      return;
    }

    const slot = fleetLocationForVehicle(vehicleId, fleetLocs);
    if (!slot) {
      toast.error('Kenderaan pemandu tiada lokasi armada — daftar dalam inventori');
      return;
    }

    const originId = stockOrigin === 'FROM_FACTORY' ? factory?.id : hq.id;
    if (!originId) {
      toast.error(stockOrigin === 'FROM_FACTORY' ? 'Lokasi kilang tidak dijumpai' : 'Gudang HQ tidak dijumpai');
      return;
    }

    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) {
      toast.error('Kuantiti mesti lebih 0');
      return;
    }

    setLoading(true);
    try {
      const items = [{ stock_item_id: itemId, quantity: qtyNum }];
      const legMeta = {
        driver_id: driverId,
        vehicle_id: vehicleId,
        items,
      };

      const legs: Array<{
        leg_sequence: number;
        leg_type: DeliveryLegType;
        from_location_id: string;
        to_location_id: string;
        driver_id?: string;
        vehicle_id?: string;
        items: Array<{ stock_item_id: string; quantity: number }>;
      }> = [];

      if (stockOrigin === 'FROM_FACTORY') {
        legs.push(
          {
            leg_sequence: 1,
            leg_type: 'FACTORY_TO_HQ',
            from_location_id: originId,
            to_location_id: hq.id,
            ...legMeta,
          },
          {
            leg_sequence: 2,
            leg_type: 'HQ_TO_VEHICLE',
            from_location_id: hq.id,
            to_location_id: slot.id,
            ...legMeta,
          },
          {
            leg_sequence: 3,
            leg_type: 'VEHICLE_TO_BRANCH',
            from_location_id: slot.id,
            to_location_id: destId,
            ...legMeta,
          }
        );
      } else {
        legs.push(
          {
            leg_sequence: 1,
            leg_type: 'HQ_TO_VEHICLE',
            from_location_id: hq.id,
            to_location_id: slot.id,
            ...legMeta,
          },
          {
            leg_sequence: 2,
            leg_type: 'VEHICLE_TO_BRANCH',
            from_location_id: slot.id,
            to_location_id: destId,
            ...legMeta,
          }
        );
      }

      await createDeliveryOrder({
        origin_location_id: originId,
        final_destination_id: destId,
        primary_driver_id: driverId,
        primary_vehicle_id: vehicleId,
        scheduled_date: scheduledDate,
        notes:
          stockOrigin === 'FROM_HQ'
            ? 'Penghantaran manual — stok dari Gudang HQ'
            : 'Penghantaran manual — stok dari Kilang',
        legs,
      });

      toast.success('Pesanan penghantaran dicipta');
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pesanan Penghantaran Manual</DialogTitle>
          <DialogDescription>
            Untuk kes khas sahaja. Aliran utama syarikat: Order HQ → Kilang → cross-dock → arahan
            driver (max 20 cawangan/hari).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-950">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Isi mengikut urutan perniagaan: <strong>destinasi</strong> →{' '}
            <strong>pemandu</strong> → <strong>stok</strong>. Kenderaan &amp; armada auto
            dipadankan dengan pemandu.
          </span>
        </div>

        {/* Aliran visual */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pratonton perjalanan
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {journeyNodes.map((node, i) => (
              <div key={`${node.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                <div className="rounded-lg border bg-card px-2.5 py-1.5 text-center">
                  <node.icon className="mx-auto h-3.5 w-3.5 text-emerald-700" />
                  <p className="text-[10px] font-semibold">{node.label}</p>
                  {node.sub && (
                    <p className="max-w-[88px] truncate text-[9px] text-muted-foreground">
                      {node.sub}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {/* 1. Asal stok */}
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
                  Dari Kilang (production baharu → HQ → armada)
                </SelectItem>
                <SelectItem value="FROM_HQ">
                  Dari Gudang HQ (stok sedia ada → armada)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2. Destinasi */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">2. Cawangan destinasi</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama cawangan…"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
              />
            </div>
            <Select value={destId} onValueChange={(v) => setDestId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih cawangan kiosk">
                  {selectedBranch ? formatBranchDestination(selectedBranch) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-60">
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

          {/* 3. Pemandu & kenderaan (auto) */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">3. Pemandu penghantaran</Label>
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
                {formatVehicleDetail(selectedVehicle) && ` · ${formatVehicleDetail(selectedVehicle)}`}
                {fleetSlot && ` · Slot ${formatFleetSlot(fleetSlot, selectedVehicle)}`}
              </p>
            )}
            {selectedDriver && !selectedVehicle && (
              <p className="text-xs text-amber-700">Pemandu ini belum dipautkan kenderaan default.</p>
            )}
          </div>

          {/* 4. Stok */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">4. Stok dihantar</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select value={itemId} onValueChange={(v) => setItemId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih item">
                    {formatStockItemName(selectedItem)}
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
                            <span className="flex flex-col items-start">
                              <span>{s.name}</span>
                              {formatStockItemDetail(s) && (
                                <span className="text-xs text-muted-foreground">
                                  {formatStockItemDetail(s)}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Kuantiti ({qtyUnitLabel})</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 5. Tarikh */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">5. Tarikh penghantaran</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          {/* Ringkasan */}
          {selectedBranch && selectedDriver && selectedItem && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              <p className="font-medium text-emerald-950">Ringkasan</p>
              <p className="mt-1 text-emerald-900/90">
                Hantar <strong>{qty} {qtyUnitLabel}</strong> {selectedItem.name} ke{' '}
                <strong>{formatBranchDestination(selectedBranch)}</strong> melalui{' '}
                {formatDriverName(selectedDriver)}
                {stockOrigin === 'FROM_FACTORY' ? ' (via Kilang & HQ)' : ' (dari Gudang HQ)'}.
              </p>
            </div>
          )}

          <Button
            className={cn('w-full bg-amber-500 hover:bg-amber-600')}
            onClick={handleCreate}
            disabled={loading || !fleetSlot}
          >
            {loading ? 'Mencipta…' : 'Cipta Pesanan Penghantaran'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
