'use client';

import { useEffect, useState } from 'react';
import type {
  InventoryLocation,
  LineItemInput,
  StockItemOption,
  StockTransferRow,
} from '@/lib/inventory/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StockLineForm } from '@/components/inventory/stock-line-form';

interface TransferPanelProps {
  locations: InventoryLocation[];
  stockItems: StockItemOption[];
  transfers: StockTransferRow[];
  currentLocationId: string;
  onCreate: (payload: {
    from_location_id: string;
    to_location_id: string;
    items: LineItemInput[];
    driver_id?: string;
    vehicle_id?: string;
    notes?: string;
  }) => Promise<void>;
  onDispatch: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  loadDrivers: () => Promise<{ drivers: Array<{ id: string; full_name: string }> }>;
  loadVehicles: () => Promise<{ vehicles: Array<{ id: string; vehicle_type: string }> }>;
}

export function TransferPanel({
  locations,
  stockItems,
  transfers,
  currentLocationId,
  onCreate,
  onDispatch,
  onComplete,
  loadDrivers,
  loadVehicles,
}: TransferPanelProps) {
  const [fromId, setFromId] = useState(currentLocationId);
  const [toId, setToId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [drivers, setDrivers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; vehicle_type: string }>>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setFromId(currentLocationId);
  }, [currentLocationId]);

  useEffect(() => {
    loadDrivers().then(({ drivers: d }) => setDrivers(d)).catch(() => {});
    loadVehicles().then(({ vehicles: v }) => setVehicles(v)).catch(() => {});
  }, [loadDrivers, loadVehicles]);

  const otherLocations = locations.filter((l) => l.id !== fromId);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-semibold">New Transfer</h3>
        <div className="space-y-2">
          <Label>From</Label>
          <Select value={fromId} onValueChange={(v) => v && setFromId(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>To</Label>
          <Select value={toId} onValueChange={(v) => v && setToId(v)}>
            <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
            <SelectContent>
              {otherLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Driver</Label>
            <Select value={driverId} onValueChange={(v) => setDriverId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
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
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        {!showForm ? (
          <Button onClick={() => setShowForm(true)} disabled={!toId}>
            Add Items
          </Button>
        ) : (
          <StockLineForm
            mode="receive"
            stockItems={stockItems}
            onSubmit={async (items) => {
              await onCreate({
                from_location_id: fromId,
                to_location_id: toId,
                items,
                driver_id: driverId || undefined,
                vehicle_id: vehicleId || undefined,
                notes: notes || undefined,
              });
              setShowForm(false);
              setToId('');
            }}
          />
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Transfer History</h3>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers yet</p>
        ) : (
          transfers.map((t) => (
            <div key={t.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{t.transfer_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.from_location.name} → {t.to_location.name}
                  </p>
                </div>
                <Badge variant="outline">{t.status}</Badge>
              </div>
              <div className="mt-2 flex gap-2">
                {t.status === 'PENDING' && (
                  <Button size="sm" variant="outline" onClick={() => onDispatch(t.id)}>
                    Dispatch
                  </Button>
                )}
                {t.status === 'IN_TRANSIT' && (
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600" onClick={() => onComplete(t.id)}>
                    Complete
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
