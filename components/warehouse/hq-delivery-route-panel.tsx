'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
 Route,
 Truck,
 ArrowUp,
 ArrowDown,
 CheckCircle2,
 RefreshCw,
 SlidersHorizontal,
 Sparkles,
} from 'lucide-react';
import {
 completeRouteHandoff,
 createDeliveryRoutesForOrder,
 fetchDeliveryRoutePlans,
 updateDeliveryRoutePlan,
 adjustRouteStopItems,
 optimizeDeliveryRoute,
} from '@/lib/production/api';
import type { DeliveryRoutePlan } from '@/lib/production/types';
import {
 DRIVER_ROLE_LABELS,
 ROUTE_STATUS_LABELS,
 type DriverRouteRole,
} from '@/lib/production/driver-routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface HqDeliveryRoutePanelProps {
 orderId: string;
 productionDate: string;
 routesPlanned?: boolean;
 onRoutesPlanned?: () => void;
}

export function HqDeliveryRoutePanel({
 orderId,
 productionDate,
 routesPlanned,
 onRoutesPlanned,
}: HqDeliveryRoutePanelProps) {
 const [routes, setRoutes] = useState<DeliveryRoutePlan[]>([]);
 const [planning, setPlanning] = useState(false);
 const [optimizing, setOptimizing] = useState<string | null>(null);
 const [adjustReason, setAdjustReason] = useState('Kekurangan stok dari kilang');

 const load = useCallback(async () => {
 try {
 const { routes: list } = await fetchDeliveryRoutePlans(orderId);
 setRoutes(list);
 } catch {
 setRoutes([]);
 }
 }, [orderId]);

 useEffect(() => {
 load();
 }, [load]);

 async function handlePlanRoutes(replace = false) {
 setPlanning(true);
 try {
 await createDeliveryRoutesForOrder(orderId, replace);
 toast.success(
 replace
 ? 'Laluan dirancang semula - max 20 hentian/arahan, susunan AI'
 : 'Laluan driver dirancang - DO digabung & dioptimumkan AI');
 await load();
 onRoutesPlanned?.();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal rancang laluan');
 } finally {
 setPlanning(false);
 }
 }

 async function handleHandoff(planId: string) {
 try {
 await completeRouteHandoff(planId);
 toast.success('Sambut stok lengkap - driver relay sedia hantar ke kiosk');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal sahkan sambut stok');
 }
 }

 async function moveStop(planId: string, stopId: string, direction: 'up' | 'down') {
 const plan = routes.find((r) => r.id === planId);
 if (!plan?.stops) return;
 const sorted = [...plan.stops].sort((a, b) => a.stop_sequence ?? b.stop_sequence);
 const idx = sorted.findIndex((s) => s.id === stopId);
 if (idx < 0) return;
 const swap = direction === 'up' ? idx - 1 : idx + 1;
 if (swap < 0 || swap >= sorted.length) return;
 [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
 try {
 await updateDeliveryRoutePlan(planId, {
 stop_order: sorted.map((s) => s.id!).filter(Boolean),
 });
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal susun semula');
 }
 }

 async function handleAdjust(
 stopId: string,
 stockItemId: string,
 adjustedQty: number) {
 try {
 await adjustRouteStopItems(
 stopId,
 [{ stock_item_id: stockItemId, adjusted_quantity: adjustedQty }],
 adjustReason);
 toast.success('Kuantiti penghantaran dikemas kini');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal pelarasan');
 }
 }

 async function handleOptimize(planId: string) {
 setOptimizing(planId);
 try {
 const { result } = await optimizeDeliveryRoute(planId);
 const summary = (result as { summary?: string }).summary;
 toast.success(summary ?? 'Susunan laluan AI dikemas kini');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal optimumkan laluan');
 } finally {
 setOptimizing(null);
 }
 }

 const hubPlans = routes.filter((r) => r.route_pattern === 'HUB_PRIMARY');

 return (
 <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
 <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="flex items-center gap-2 font-semibold text-emerald-950">
 <Route className="h-4 w-4" />
 Perjalanan Driver ke Cawangan
 </p>
 <p className="mt-1 text-xs text-emerald-900/80">
 DO cawangan digabung per driver (max <strong>20 hentian/arahan</strong>). AI susun
 laluan: kritikal didahulukan ke arah jalan Utara/Barat/Selatan. Hub (D001) sambut
 stok relay dahulu.
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 {routes.length === 0 ? (
 <Button
 size="sm"
 className="bg-emerald-600 hover:bg-emerald-700"
 disabled={planning}
 onClick={() => handlePlanRoutes(false)}
 >
 <Truck className="mr-1 h-4 w-4" />
 {planning ? 'Merancang...' : 'Susun Laluan Driver'}
 </Button>) : (
 <Button
 size="sm"
 variant="outline"
 disabled={planning}
 onClick={() => handlePlanRoutes(true)}
 >
 <RefreshCw className="mr-1 h-4 w-4" />
 Rancang Semula
 </Button>)}
 </div>
 </div>

 {routes.length === 0 ? (
 <p className="text-sm text-muted-foreground">
 Wajib susun laluan sebelum kilang sahkan order - stok akan auto dihantar ke cawangan
 mengikut hentian di bawah untuk production {productionDate}.
 </p>) : (
 <div className="space-y-4">
 <div className="flex items-center gap-2 text-xs">
 <Label htmlFor="adj-reason" className="shrink-0">
 Sebab pelarasan:
 </Label>
 <Input
 id="adj-reason"
 className="h-8 text-xs"
 value={adjustReason}
 onChange={(e) => setAdjustReason(e.target.value)}
 />
 </div>

 {routes.map((route) => {
 const pattern = (route.route_pattern ?? 'DIRECT') as DriverRouteRole;
 const sortedStops = [...(route.stops ?? [])].sort(
 (a, b) => a.stop_sequence ?? b.stop_sequence);

 return (
 <div key={route.id} className="rounded-lg border bg-white p-3 text-sm shadow-sm">
 <div className="mb-2 flex flex-wrap items-center gap-2">
 <span className="font-medium">{route.route_name}</span>
 {route.instruction_code && (
 <Badge variant="outline" className="font-mono text-[10px]">
 {route.instruction_code}
 </Badge>)}
 {route.instruction_part != null && route.instruction_part > 1 && (
 <Badge className="bg-blue-100 text-blue-900">
 Bahagian {route.instruction_part}
 </Badge>)}
 {route.region_code && <Badge variant="outline">{route.region_code}</Badge>}
 <Badge variant="secondary">{DRIVER_ROLE_LABELS[pattern] ?? pattern}</Badge>
 <Button
 size="sm"
 variant="outline"
 className="ml-auto h-7 gap-1 text-xs"
 disabled={optimizing === route.id}
 onClick={() => handleOptimize(route.id)}
 >
 <Sparkles className="h-3 w-3" />
 {optimizing === route.id ? 'AI...' : 'Susun AI'}
 </Button>
 <Badge
 className={
 route.status === 'WAITING_HANDOFF'
 ? 'bg-amber-100 text-amber-900'
 : undefined
 }
 >
 {ROUTE_STATUS_LABELS[route.status] ?? route.status}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 {route.driver?.full_name ?? ' - '} - {' '}
 {route.vehicle
 ? `${route.vehicle.vehicle_code} ${route.vehicle.vehicle_type}`
 : ' - '}
 </p>

 {pattern === 'HUB_PRIMARY' && !route.handoff_completed_at && (
 <Button
 size="sm"
 className="mt-2 h-8 bg-amber-600 hover:bg-amber-700"
 onClick={() => handleHandoff(route.id)}
 >
 <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
 Sahkan Sambut Stok Selesai
 </Button>)}

 <ol className="mt-3 space-y-2 border-l-2 border-emerald-200 pl-3">
 {sortedStops.map((stop, idx) => (
 <li key={stop.id ?? idx} className="text-xs">
 <div className="flex flex-wrap items-center gap-1">
 <span className="font-bold text-emerald-800">{stop.stop_sequence}.</span>
 {stop.is_handoff ? (
 <span className="font-medium text-amber-800">
 Sambut Stok ke {stop.handoff_driver?.full_name ?? 'Relay'}
 </span>) : (
 <span>
 {stop.branch?.branch_name ?? ' - '} ({stop.branch?.branch_code})
 </span>)}
 {!stop.is_handoff && stop.id && (
 <span className="ml-auto flex gap-0.5">
 <button
 type="button"
 className="rounded border p-0.5 hover:bg-muted"
 onClick={() => moveStop(route.id, stop.id!, 'up')}
 >
 <ArrowUp className="h-3 w-3" />
 </button>
 <button
 type="button"
 className="rounded border p-0.5 hover:bg-muted"
 onClick={() => moveStop(route.id, stop.id!, 'down')}
 >
 <ArrowDown className="h-3 w-3" />
 </button>
 </span>)}
 </div>
 {stop.items && stop.items.length > 0 && (
 <ul className="mt-1 space-y-1 pl-4 text-muted-foreground">
 {stop.items.map((item) => (
 <li key={item.id ?? item.stock_item_id} className="flex flex-wrap items-center gap-2">
 <SlidersHorizontal className="h-3 w-3 shrink-0" />
 <span className="min-w-[80px]">
 {item.stock_item?.name ?? 'Item'}
 </span>
 <span className="text-[10px]">
 plan: {item.planned_quantity ?? item.quantity}
 </span>
 <Input
 type="number"
 min="0"
 className="h-7 w-16 px-1 text-center text-xs"
 defaultValue={item.adjusted_quantity ?? item.quantity}
 onBlur={(e) => {
 const v = Number(e.target.value);
 if (
 stop.id &&
 item.stock_item_id &&
 v !== Number(item.quantity)) {
 handleAdjust(stop.id, item.stock_item_id, v);
 }
 }}
 />
 <span className="text-[10px]">pcs</span>
 {item.adjustment_reason && (
 <span className="text-[10px] italic">{item.adjustment_reason}</span>)}
 </li>))}
 </ul>)}
 </li>))}
 </ol>
 </div>);
 })}

 {hubPlans.some((p) => !p.handoff_completed_at) && (
 <p className="text-xs text-amber-800">
 Relay driver (Fazil/Ridhuan) menunggu sambut stok dari hub sebelum boleh hantar ke
 kiosk.
 </p>)}
 </div>)}
 </div>);
}
