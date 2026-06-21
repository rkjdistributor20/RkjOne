'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DeliveryLegType, FleetDriver, FleetVehicle } from '@/lib/fleet/types';
import { LEG_TYPE_LABELS } from '@/lib/fleet/types';
import { createDeliveryOrder } from '@/lib/fleet/api';
import type { InventoryLocation, StockItemOption } from '@/lib/inventory/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    () => locations.filter((l) => l.location_type === 'BRANCH_KIOSK'),
    [locations]
  );

  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleLocId, setVehicleLocId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('10');
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!originId && factory?.id) setOriginId(factory.id);
    if (!vehicleLocId && fleetLocs.length > 0) setVehicleLocId(fleetLocs[0].id);
    if (!destId && branches.length > 0) setDestId(branches[0].id);
    if (!driverId && drivers.length > 0) setDriverId(drivers[0].id);
    if (!vehicleId && vehicles.length > 0) setVehicleId(vehicles[0].id);
    if (!itemId && stockItems.length > 0) setItemId(stockItems[0].id);
  }, [
    originId,
    vehicleLocId,
    destId,
    driverId,
    vehicleId,
    itemId,
    factory,
    fleetLocs,
    branches,
    drivers,
    vehicles,
    stockItems,
  ]);

  async function handleCreate() {
    if (!originId || !destId || !hq?.id || !vehicleLocId || !itemId) {
      toast.error('Sila lengkapkan semua medan wajib');
      return;
    }

    setLoading(true);

    try {
      const items = [{ stock_item_id: itemId, quantity: Number(qty) }];

      await createDeliveryOrder({
        origin_location_id: originId,
        final_destination_id: destId,
        primary_driver_id: driverId || undefined,
        primary_vehicle_id: vehicleId || undefined,
        scheduled_date: scheduledDate,
        legs: [
          {
            leg_sequence: 1,
            leg_type: 'FACTORY_TO_HQ' as DeliveryLegType,
            from_location_id: originId,
            to_location_id: hq.id,
            driver_id: driverId || undefined,
            vehicle_id: vehicleId || undefined,
            items,
          },
          {
            leg_sequence: 2,
            leg_type: 'HQ_TO_VEHICLE' as DeliveryLegType,
            from_location_id: hq.id,
            to_location_id: vehicleLocId,
            driver_id: driverId || undefined,
            vehicle_id: vehicleId || undefined,
            items,
          },
          {
            leg_sequence: 3,
            leg_type: 'VEHICLE_TO_BRANCH' as DeliveryLegType,
            from_location_id: vehicleLocId,
            to_location_id: destId,
            driver_id: driverId || undefined,
            vehicle_id: vehicleId || undefined,
            items,
          },
        ],
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pesanan Penghantaran Baharu</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Rantaian: Kilang → HQ → Kenderaan → Cawangan ({LEG_TYPE_LABELS.FACTORY_TO_HQ}, dll.)
        </p>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Cawangan Destinasi</Label>
            <Select value={destId} onValueChange={(v) => setDestId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih cawangan" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Lokasi Kenderaan Fleet</Label>
            <Select value={vehicleLocId} onValueChange={(v) => setVehicleLocId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih lokasi kenderaan" />
              </SelectTrigger>
              <SelectContent>
                {fleetLocs.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Pemandu</Label>
              <Select value={driverId} onValueChange={(v) => setDriverId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih pemandu" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.length === 0 ? (
                    <SelectItem value="no-driver" disabled>
                      Tiada pemandu
                    </SelectItem>
                  ) : (
                    drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.driver_code ? `${d.driver_code} - ${d.full_name}` : d.full_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Kenderaan</Label>
              <Select value={vehicleId} onValueChange={(v) => setVehicleId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kenderaan" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.vehicle_code} {v.vehicle_type ? `- ${v.vehicle_type}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Item Stok</Label>
              <Select value={itemId} onValueChange={(v) => setItemId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih item stok" />
                </SelectTrigger>
                <SelectContent>
                  {stockItems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Kuantiti</Label>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tarikh Jadual</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          <Button
            className="bg-amber-500 hover:bg-amber-600"
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? 'Mencipta…' : 'Cipta Penghantaran 3-Leg'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}