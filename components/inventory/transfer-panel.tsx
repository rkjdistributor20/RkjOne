'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
 InventoryLocation,
 LineItemInput,
 StockItemOption,
 StockTransferRow,
} from '@/lib/inventory/types';
import { LOCATION_TYPE_LABELS } from '@/lib/inventory/types';
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
import { formatExpiryDate } from '@/lib/stock/expiry';
import { formatStockQuantity } from '@/lib/stock/catalog';
import { labelFor, TRANSFER_STATUS_LABELS } from '@/lib/ui/labels';
import { boundSelectValue, displayLabel } from '@/lib/ui/select-utils';
import { StockLineForm } from '@/components/inventory/stock-line-form';

interface TransferPanelProps {
 locations: InventoryLocation[];
 stockItems: StockItemOption[];
 transfers: StockTransferRow[];
 currentLocationId: string;
 orderInPacks?: boolean;
 /** AM / kiosk - hanya pindahan antara cawangan, tiada pemandu/kenderaan HQ */
 kioskOnly?: boolean;
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
 canSetRotiProductionDate?: boolean;
}

const STATUS_ORDER: Record<string, number> = {
 IN_TRANSIT: 0,
 PENDING: 1,
 DELIVERED: 2,
 COMPLETED: 3,
};

export function TransferPanel({
 locations,
 stockItems,
 transfers,
 currentLocationId,
 orderInPacks = false,
 kioskOnly = false,
 onCreate,
 onDispatch,
 onComplete,
 loadDrivers,
 loadVehicles,
 canSetRotiProductionDate = false,
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

 useEffect(() => {
 if (toId && !otherLocations.some((l) => l.id === toId)) {
 setToId('');
 }
 }, [fromId, toId, otherLocations]);
 const toLocation = locations.find((l) => l.id === toId);
 const fromLocation = locations.find((l) => l.id === fromId);
 const orderToKiosk = toLocation?.location_type === 'BRANCH_KIOSK';
 const requireRotiProductionDate = canSetRotiProductionDate && orderToKiosk;
 const usePacks = orderInPacks || fromLocation?.location_type === 'HQ_WAREHOUSE';

 const sortedTransfers = useMemo(
 () =>
 [...transfers].sort(
 (a, b) =>
 (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) ||
 new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
 [transfers]);

 function locationLabel(loc: InventoryLocation) {
 if (loc.branch?.branch_code) {
 return `${loc.branch.branch_code} - ${loc.branch.branch_name}`;
 }
 return `${LOCATION_TYPE_LABELS[loc.location_type]} - ${loc.name}`;
 }

 const locationIds = locations.map((l) => l.id);
 const fromSelectValue = boundSelectValue(fromId, locationIds);
 const toSelectValue = boundSelectValue(toId, otherLocations.map((l) => l.id));
 const driverSelectValue = boundSelectValue(driverId, drivers.map((d) => d.id));
 const vehicleSelectValue = boundSelectValue(vehicleId, vehicles.map((v) => v.id));
 const selectedDriver = drivers.find((d) => d.id === driverId);
 const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

 return (
 <div className="grid gap-6 lg:grid-cols-2">
 <div className="space-y-4">
 <div>
 <h3 className="font-semibold">Order / Pindahan Baharu</h3>
 <p className="mt-1 text-xs text-muted-foreground">
 HQ: order dalam bag/tong - kiosk: terima melalui butang Terima di Kiosk
 </p>
 </div>
 <div className="space-y-2">
 <Label>Dari</Label>
 {locations.length <= 1 && fromLocation ? (
 <div className="flex min-h-9 w-full max-w-md items-center rounded-md border bg-muted/30 px-3 text-sm">
 <span className="font-medium">{locationLabel(fromLocation)}</span>
 </div>) : (
 <Select value={fromSelectValue ?? ''} onValueChange={(v) => v && setFromId(v)}>
 <SelectTrigger>
 <SelectValue placeholder="Pilih lokasi asal">
 {fromLocation ? locationLabel(fromLocation) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {locations.map((l) => (
 <SelectItem key={l.id} value={l.id}>{locationLabel(l)}</SelectItem>))}
 </SelectContent>
 </Select>)}
 </div>
 <div className="space-y-2">
 <Label>{kioskOnly ? 'Ke cawangan' : 'Ke (cawangan / kenderaan)'}</Label>
 <Select value={toSelectValue ?? ''} onValueChange={(v) => v && setToId(v)}>
 <SelectTrigger>
 <SelectValue placeholder="Pilih destinasi">
 {toLocation ? locationLabel(toLocation) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {otherLocations.map((l) => (
 <SelectItem key={l.id} value={l.id}>{locationLabel(l)}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 {!kioskOnly && (
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label>Pemandu</Label>
 <Select value={driverSelectValue ?? ''} onValueChange={(v) => setDriverId(v ?? '')}>
 <SelectTrigger>
 <SelectValue placeholder="Pilihan">
 {selectedDriver?.full_name}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {drivers.map((d) => (
 <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Kenderaan</Label>
 <Select value={vehicleSelectValue ?? ''} onValueChange={(v) => setVehicleId(v ?? '')}>
 <SelectTrigger>
 <SelectValue placeholder="Pilihan">
 {selectedVehicle?.vehicle_type}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {vehicles.map((v) => (
 <SelectItem key={v.id} value={v.id}>{v.vehicle_type}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>)}
 <div className="space-y-1">
 <Label>Nota</Label>
 <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
 </div>
 {!showForm ? (
 <Button onClick={() => setShowForm(true)} disabled={!toId}>
 Tambah Item Stok
 </Button>) : (
 <StockLineForm
 mode="receive"
 stockItems={stockItems}
 orderInPacks={usePacks}
 requireRotiProductionDate={requireRotiProductionDate}
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
 />)}
 </div>

 <div className="space-y-3">
 <h3 className="font-semibold">Senarai Pindahan</h3>
 {sortedTransfers.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada pindahan lagi</p>) : (
 sortedTransfers.map((t) => (
 <div
 key={t.id}
 className={`rounded-lg border p-3 text-sm ${
 t.status === 'IN_TRANSIT' ? 'border-violet-300 bg-violet-50/40' : ''
 }`}
 >
 <div className="flex items-start justify-between gap-2">
 <div>
 <p className="font-medium">{t.transfer_number}</p>
 <p className="text-xs text-muted-foreground">
 {displayLabel(t.from_location?.name, 'Lokasi asal')} ke {' '}
 {displayLabel(t.to_location?.name, 'Lokasi destinasi')}
 </p>
 </div>
 <Badge variant={t.status === 'IN_TRANSIT' ? 'default' : 'outline'}>
 {labelFor(TRANSFER_STATUS_LABELS, t.status)}
 </Badge>
 </div>
 {t.stock_transfer_items && t.stock_transfer_items.length > 0 && (
 <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
 {t.stock_transfer_items.map((i, idx) => (
 <li key={idx}>
 {displayLabel(i.stock_item?.name, i.stock_item?.item_code ?? 'Item')}:{' '}
 {formatStockQuantity(Number(i.quantity), i.unit, {
 item_code: i.stock_item.item_code,
 })}
 </li>))}
 </ul>)}
 <div className="mt-2 flex flex-wrap gap-2">
 {t.status === 'PENDING' && (
 <Button size="sm" variant="outline" onClick={() => onDispatch(t.id)}>
 Hantar
 </Button>)}
 {t.status === 'IN_TRANSIT' && (
 <Button
 size="sm"
 className="bg-amber-500 hover:bg-amber-600"
 onClick={() => onComplete(t.id)}
 >
 Terima di Kiosk
 </Button>)}
 </div>
 {t.stock_transfer_items?.some((i) => i.production_date) && (
 <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
 {t.stock_transfer_items.filter((i) => i.production_date).map((i, idx) => (
 <li key={idx}>
 {i.stock_item.name}: prod {formatExpiryDate(i.production_date!)}
 </li>))}
 </ul>)}
 </div>)))}
 </div>
 </div>);
}
