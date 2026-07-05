'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
 MapPin,
 Navigation,
 Sparkles,
 Package,
 ChevronDown,
 ChevronUp,
 Truck,
} from 'lucide-react';
import {
 fetchMyDeliveryOrders,
 optimizeDeliveryOrderRoute,
} from '@/lib/fleet/api';
import type { DeliveryLeg, DeliveryOrder } from '@/lib/fleet/types';
import { LEG_TYPE_LABELS } from '@/lib/fleet/types';
import { readCurrentPosition } from '@/lib/fleet/route-ai';
import { labelFor, DELIVERY_STATUS_LABELS } from '@/lib/ui/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

function branchLegs(order: DeliveryOrder): DeliveryLeg[] {
 return (order.delivery_legs ?? []).filter((l) => l.leg_type === 'VEHICLE_TO_BRANCH').sort((a, b) => a.leg_sequence ?? b.leg_sequence);
}

export function DriverManualRoutePanel() {
 const [orders, setOrders] = useState<DeliveryOrder[]>([]);
 const [loading, setLoading] = useState(true);
 const [optimizingId, setOptimizingId] = useState<string | null>(null);
 const [gpsLoading, setGpsLoading] = useState(false);
 const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
 const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const { orders: data } = await fetchMyDeliveryOrders();
 setOrders(
 data.filter((o) => o.status === 'PENDING' || o.status === 'IN_TRANSIT'));
 } catch {
 setOrders([]);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 async function captureGps() {
 setGpsLoading(true);
 try {
 const pos = await readCurrentPosition();
 if (!pos) {
 toast.error('Tidak dapat lokasi GPS - benarkan akses lokasi');
 return;
 }
 setPosition(pos);
 toast.success(`Lokasi: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
 } finally {
 setGpsLoading(false);
 }
 }

 async function handleOptimize(orderId: string) {
 setOptimizingId(orderId);
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
 const { result } = await optimizeDeliveryOrderRoute(orderId, {
 current_lat: lat,
 current_lng: lng,
 });
 toast.success((result as { summary?: string }).summary ?? 'Laluan disusun semula');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal susun laluan');
 } finally {
 setOptimizingId(null);
 }
 }

 if (loading) {
 return <Skeleton className="h-40 w-full rounded-xl" />;
 }

 return (
 <div className="space-y-4">
 <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
 <div className="flex-1 min-w-[200px]">
 <p className="text-sm font-semibold">Lokasi semasa</p>
 <p className="text-xs text-muted-foreground">
 {position
 ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
 : 'Tekan butang untuk kongsi lokasi - AI susun baki hentian'}
 </p>
 </div>
 <Button
 type="button"
 size="sm"
 variant="outline"
 disabled={gpsLoading}
 onClick={captureGps}
 >
 <Navigation className="mr-1.5 h-3.5 w-3.5" />
 {gpsLoading ? 'Mengesan...' : 'Lokasi GPS'}
 </Button>
 </div>

 {orders.length === 0 ? (
 <EmptyState
 icon={Package}
 title="Tiada pesanan manual aktif"
 description="Pesanan penghantaran manual (DO) dari HQ akan muncul di sini. Kongsi lokasi semasa dan tekan Susun AI."
 />) : (
 orders.map((order) => {
 const stops = branchLegs(order);
 const pendingStops = stops.filter((s) => s.status !== 'DELIVERED');
 const expanded = expandedOrder === order.id;
 const aiSummary = (order as DeliveryOrder & { ai_route_summary?: string }).ai_route_summary;

 return (
 <div key={order.id} className="rounded-xl border bg-card overflow-hidden">
 <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-2">
 <div>
 <div className="flex items-center gap-2">
 <Truck className="h-4 w-4 text-emerald-700" />
 <span className="font-semibold">{order.order_number}</span>
 <Badge variant="outline">
 {labelFor(DELIVERY_STATUS_LABELS, order.status)}
 </Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {pendingStops.length} hentian baki - {stops.length} jumlah
 </p>
 {aiSummary && (
 <p className="mt-1 flex items-start gap-1 text-xs text-violet-800">
 <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
 {aiSummary}
 </p>)}
 </div>
 <div className="flex gap-2">
 <Button
 type="button"
 size="sm"
 className="bg-violet-600 hover:bg-violet-700"
 disabled={optimizingId === order.id || pendingStops.length === 0}
 onClick={() => handleOptimize(order.id)}
 >
 <Sparkles className="mr-1 h-3.5 w-3.5" />
 {optimizingId === order.id ? 'Menyusun...' : 'Susun AI'}
 </Button>
 <Button
 type="button"
 size="icon"
 variant="ghost"
 className="h-8 w-8"
 onClick={() => setExpandedOrder(expanded ? null : order.id)}
 >
 {expanded ? (
 <ChevronUp className="h-4 w-4" />) : (
 <ChevronDown className="h-4 w-4" />)}
 </Button>
 </div>
 </div>

 {expanded && (
 <ol className="space-y-2 border-t px-4 py-3">
 {stops.map((leg, idx) => (
 <li
 key={leg.id}
 className={cn(
 'flex items-start gap-2 rounded-lg border p-2.5 text-sm',
 leg.status === 'DELIVERED' && 'opacity-60 bg-muted/40',
 leg.status === 'IN_TRANSIT' && 'border-amber-300 bg-amber-50/50')}
 >
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
 {idx + 1}
 </span>
 <div className="min-w-0 flex-1">
 <p className="font-medium truncate">{leg.to_location.name}</p>
 <p className="text-xs text-muted-foreground">
 {LEG_TYPE_LABELS[leg.leg_type]} - {' '}
 {labelFor(DELIVERY_STATUS_LABELS, leg.status)}
 </p>
 <ul className="mt-1 text-xs text-muted-foreground">
 {leg.delivery_leg_items?.map((item, i) => (
 <li key={i}>
 {item.stock_item.name}: {item.quantity} {item.unit}
 </li>))}
 </ul>
 </div>
 <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
 </li>))}
 </ol>)}
 </div>);
 }))}
 </div>);
}
