'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Clock3, ExternalLink, Factory, Gauge, MapPinned, Package, RefreshCw, Satellite, Sparkles, Truck, Users, Warehouse, WifiOff } from 'lucide-react';
import { fetchDriverWorkSchedule } from '@/lib/production/api';
import { fetchInventoryOverview } from '@/lib/inventory/api';
import { fetchFleetGpsStatus } from '@/lib/fleet/api';
import type { DriverWorkScheduleEntry } from '@/lib/production/types';
import type { InventoryOverviewResponse } from '@/lib/inventory/types';
import type { FleetGpsStatusResponse, FleetGpsVehicleStatus } from '@/lib/fleet/types';
import { MAX_STOPS_PER_INSTRUCTION } from '@/lib/production/route-optimizer';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function FleetOverviewPanel() {
 const [schedule, setSchedule] = useState<DriverWorkScheduleEntry[]>([]);
 const [inventory, setInventory] = useState<InventoryOverviewResponse | null>(null);
 const [gps, setGps] = useState<FleetGpsStatusResponse | null>(null);
 const [loading, setLoading] = useState(true);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const gpsFallback = (error: unknown): FleetGpsStatusResponse => ({
 source: 'cartrack',
 configured: false,
 status: 'error',
 fetched_at: new Date().toISOString(),
 message: error instanceof Error ? error.message : 'Gagal memuatkan GPS Cartrack',
 fleetweb_url: 'https://fleetweb-my.cartrack.com/map/fleet',
 docs_url: 'https://developer.cartrack.com/docs/fleet-api/get-vehicles-status-location-fuel-odometer-and-more',
 matched_count: 0,
 unmatched_count: 0,
 vehicles: [],
 });

 const [sched, inv, gpsStatus] = await Promise.all([
 fetchDriverWorkSchedule(),
 fetchInventoryOverview(),
 fetchFleetGpsStatus().catch(gpsFallback),
 ]);
 setSchedule(sched.schedule);
 setInventory(inv);
 setGps(gpsStatus);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan ringkasan logistik');
 setSchedule([]);
 setInventory(null);
 setGps(null);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 const timer = window.setTimeout(() => {
 void load();
 }, 0);
 return () => window.clearTimeout(timer);
 }, [load]);

 if (loading) {
 return <Skeleton className="h-40 w-full rounded-xl" />;
 }

 const byDriver = new Map<string, DriverWorkScheduleEntry[]>();
 for (const entry of schedule) {
 const list = byDriver.get(entry.driver_id) ?? [];
 list.push(entry);
 byDriver.set(entry.driver_id, list);
 }

 const pipeline = inventory?.pipeline;
 const nodes = inventory?.nodes ?? [];

 return (
 <div className="space-y-5">
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 <StatCard
 icon={Factory}
 label="Kilang"
 value={nodes.find((n) => n.location_type === 'FACTORY')?.location_count ?? 0}
 hint="lokasi produksi"
 />
 <StatCard
 icon={Warehouse}
 label={HQ_DISTRIBUTOR_LABEL}
 value={nodes.find((n) => n.location_type === 'HQ_WAREHOUSE')?.location_count ?? 0}
 hint="cross-dock stok"
 />
 <StatCard
 icon={Truck}
 label="Dalam perjalanan"
 value={pipeline?.in_transit ?? 0}
 hint="pindahan aktif"
 />
 <StatCard
 icon={Package}
 label="Kiosk kritikal"
 value={inventory?.network.critical ?? 0}
 hint={`${inventory?.network.kiosks ?? 0} cawangan`}
 />
 </div>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <Users className="h-4 w-4" />
 Arahan Driver Hari Ini
 </CardTitle>
 <p className="text-xs text-muted-foreground">
 Max {MAX_STOPS_PER_INSTRUCTION} hentian/arahan - DO digabung - susunan AI
 </p>
 </CardHeader>
 <CardContent className="space-y-3">
 {byDriver.size === 0 ? (
 <p className="text-sm text-muted-foreground">
 Tiada arahan aktif. Rancang laluan dari {HQ_DISTRIBUTOR_LABEL} selepas order kilang.
 </p>) : (
 [...byDriver.entries()].map(([driverId, entries]) => {
 const first = entries[0];
 const totalStops = entries.reduce((a, e) => a + (e.kiosk_stops ?? 0), 0);
 const completed = entries.reduce((a, e) => a + (e.completed_stops ?? 0), 0);
 return (
 <div
 key={driverId}
 className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
 >
 <div>
 <p className="font-semibold">{first.driver_name}</p>
 <p className="text-xs text-muted-foreground">
 {first.driver_code} - {entries.length} arahan
 {entries.map((e) => e.instruction_code).filter(Boolean).length > 0 &&
 ` - ${entries.map((e) => e.instruction_code).join(', ')}`}
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="outline">
 {completed}/{totalStops} hentian
 </Badge>
 {entries.some((e) => e.ai_optimized) && (
 <Badge className="gap-1 bg-violet-100 text-violet-900">
 <Sparkles className="h-3 w-3" /> AI
 </Badge>)}
 <Badge>{ROUTE_STATUS(entries)}</Badge>
 </div>
 </div>);
 }))}
 </CardContent>
 </Card>

 <CartrackGpsPanel gps={gps} onRefresh={load} />
 </div>);
}

function ROUTE_STATUS(entries: DriverWorkScheduleEntry[]): string {
 if (entries.every((e) => e.status === 'COMPLETED')) return 'Selesai';
 if (entries.some((e) => e.status === 'DISPATCHED')) return 'Dalam perjalanan';
 if (entries.some((e) => e.status === 'WAITING_HANDOFF')) return 'Menunggu hub';
 return 'Dirancang';
}

function StatCard({
 icon: Icon,
 label,
 value,
 hint,
}: {
 icon: typeof Truck;
 label: string;
 value: number;
 hint: string;
}) {
 return (
 <div className="rounded-xl border bg-card p-4 shadow-sm">
 <div className="flex items-center justify-between">
 <p className="text-xs font-medium text-muted-foreground">{label}</p>
 <Icon className="h-4 w-4 opacity-50" />
 </div>
 <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
 <p className="text-[11px] text-muted-foreground">{hint}</p>
 </div>);
}

function CartrackGpsPanel({
 gps,
 onRefresh,
}: {
 gps: FleetGpsStatusResponse | null;
 onRefresh: () => void;
}) {
 const [showAll, setShowAll] = useState(false);
 const vehicles = gps?.vehicles ?? [];
 const trackedVehicles = vehicles.filter((vehicle) => vehicle.latitude !== null && vehicle.longitude !== null);
 const movingVehicles = vehicles.filter((vehicle) => Number(vehicle.speed_kph ?? 0) > 0);
 const visibleVehicles = showAll ? vehicles : vehicles.slice(0, 6);
 const status = gps?.status ?? 'error';
 const statusLabel = status === 'ok' ? 'Cartrack Live' : status === 'not_configured' ? 'Belum disambung' : 'Perlu semak';
 const statusVariant = status === 'ok' ? 'default' : status === 'not_configured' ? 'secondary' : 'destructive';
 const lastSync = gps?.fetched_at
 ? new Date(gps.fetched_at).toLocaleString('ms-MY', {
 dateStyle: 'medium',
 timeStyle: 'short',
 })
 : 'Belum disegerakkan';

 return (
 <Card className="overflow-hidden border-blue-100/80">
 <CardHeader className="border-b bg-blue-50/60 pb-3">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <CardTitle className="flex items-center gap-2 text-base">
 <Satellite className="h-4 w-4 text-blue-600" />
 GPS Transport Syarikat
 </CardTitle>
 <p className="mt-1 text-xs text-muted-foreground">
 Cartrack dipadankan dengan kenderaan RKJ One melalui nombor plat.
 </p>
 <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
 <Clock3 className="h-3 w-3" />
 Kemas kini terakhir: {lastSync}
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant={statusVariant}>{statusLabel}</Badge>
 {gps?.fleetweb_url && (
 <Button
 type="button"
 size="sm"
 variant="outline"
 onClick={() => window.open(gps.fleetweb_url, '_blank', 'noopener,noreferrer')}
 >
 <ExternalLink className="mr-1 h-3.5 w-3.5" />
 FleetWeb
 </Button>)}
 <Button type="button" size="sm" variant="ghost" onClick={onRefresh}>
 <RefreshCw className="mr-1 h-3.5 w-3.5" />
 Segar semula
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4 pt-4">
 <div className="grid gap-3 sm:grid-cols-4">
 <GpsMetric icon={Truck} label="Kenderaan" value={vehicles.length} />
 <GpsMetric icon={MapPinned} label="GPS Aktif" value={trackedVehicles.length} />
 <GpsMetric icon={Gauge} label="Bergerak" value={movingVehicles.length} />
 <GpsMetric icon={WifiOff} label="Belum Padanan" value={gps?.unmatched_count ?? 0} />
 </div>

 {gps?.message && (
 <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
 {gps.message}
 </div>)}

 {visibleVehicles.length === 0 ? (
 <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
 Tiada data GPS diterima lagi.
 </p>) : (
 <div className="grid gap-3 lg:grid-cols-2">
 {visibleVehicles.map((vehicle) => (
 <GpsVehicleRow key={`${vehicle.vehicle_id ?? vehicle.registration ?? vehicle.label}-${vehicle.received_at}`} vehicle={vehicle} />
 ))}
 </div>)}

 {vehicles.length > 6 && (
 <div className="flex justify-center border-t pt-3">
 <Button type="button" size="sm" variant="ghost" onClick={() => setShowAll((current) => !current)}>
 {showAll ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
 {showAll ? 'Ringkaskan senarai' : `Lihat semua ${vehicles.length} kenderaan`}
 </Button>
 </div>)}
 </CardContent>
 </Card>);
}

function GpsMetric({
 icon: Icon,
 label,
 value,
}: {
 icon: typeof Truck;
 label: string;
 value: number;
}) {
 return (
 <div className="rounded-xl border bg-card p-3">
 <div className="flex items-center justify-between">
 <p className="text-xs font-medium text-muted-foreground">{label}</p>
 <Icon className="h-4 w-4 opacity-50" />
 </div>
 <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
 </div>);
}

function GpsVehicleRow({ vehicle }: { vehicle: FleetGpsVehicleStatus }) {
 const speed = Number(vehicle.speed_kph ?? 0);
 const location = vehicle.location_description ??
 (vehicle.latitude !== null && vehicle.longitude !== null
 ? `${vehicle.latitude.toFixed(5)}, ${vehicle.longitude.toFixed(5)}`
 : 'Lokasi belum diterima');
 const updated = vehicle.event_ts
 ? new Date(vehicle.event_ts).toLocaleString('ms-MY')
 : 'Belum ada masa live';

 return (
 <div className="rounded-xl border bg-background p-3 text-sm">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="truncate font-semibold">{vehicle.label}</p>
 <p className="text-xs text-muted-foreground">
 {vehicle.driver_name ? `${vehicle.driver_name} - ` : ''}
 {updated}
 </p>
 </div>
 <div className="flex flex-wrap gap-1">
 <Badge variant={speed > 0 ? 'default' : 'outline'}>{Math.round(speed)} km/j</Badge>
 {vehicle.ignition !== null && (
 <Badge variant={vehicle.ignition ? 'secondary' : 'outline'}>
 {vehicle.ignition ? 'Enjin ON' : 'Enjin OFF'}
 </Badge>)}
 {!vehicle.matched && <Badge variant="destructive">Belum padan</Badge>}
 </div>
 </div>
 <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{location}</p>
 {vehicle.map_url && (
 <button
 type="button"
 onClick={() => window.open(vehicle.map_url ?? '', '_blank', 'noopener,noreferrer')}
 className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
 >
 <MapPinned className="h-3.5 w-3.5" />
 Buka peta
 </button>)}
 </div>);
}
