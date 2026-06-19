'use client';

import { useState } from 'react';
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
  locations,
  stockItems,
  drivers,
  vehicles,
  onSuccess,
}: CreateDeliveryDialogProps) {
  const factory = locations.find((l) => l.location_type === 'FACTORY');
  const hq = locations.find((l) => l.location_type === 'HQ_WAREHOUSE');
  const fleetLocs = locations.filter((l) => l.location_type === 'FLEET_VEHICLE');
  const branches = locations.filter((l) => l.location_type === 'BRANCH_KIOSK');

  const [originId, setOriginId] = useState(factory?.id ?? '');
  const [destId, setDestId] = useState(branches[0]?.id ?? '');
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [vehicleLocId, setVehicleLocId] = useState(fleetLocs[0]?.id ?? '');
  const [itemId, setItemId] = useState(stockItems[0]?.id ?? '');
  const [qty, setQty] = useState('10');
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!originId || !destId || !hq || !vehicleLocId) {
      toast.error('Select all required locations');
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
            driver_id: driverId,
            vehicle_id: vehicleId,
            items,
          },
          {
            leg_sequence: 2,
            leg_type: 'HQ_TO_VEHICLE' as DeliveryLegType,
            from_location_id: hq.id,
            to_location_id: vehicleLocId,
            driver_id: driverId,
            vehicle_id: vehicleId,
            items,
          },
          {
            leg_sequence: 3,
            leg_type: 'VEHICLE_TO_BRANCH' as DeliveryLegType,
            from_location_id: vehicleLocId,
            to_location_id: destId,
            driver_id: driverId,
            vehicle_id: vehicleId,
            items,
          },
        ],
      });
      toast.success('Delivery order created');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create delivery');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Delivery Order</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Chain: Factory → HQ → Vehicle → Branch ({LEG_TYPE_LABELS.FACTORY_TO_HQ}, etc.)
        </p>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Destination Branch</Label>
            <Select value={destId} onValueChange={(v) => v && setDestId(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Fleet Vehicle Location</Label>
            <Select value={vehicleLocId} onValueChange={(v) => v && setVehicleLocId(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {fleetLocs.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Driver</Label>
              <Select value={driverId} onValueChange={(v) => setDriverId(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={(v) => setVehicleId(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.vehicle_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Stock Item</Label>
              <Select value={itemId} onValueChange={(v) => v && setItemId(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stockItems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Scheduled Date</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <Button className="bg-amber-500 hover:bg-amber-600" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create 3-Leg Delivery'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
