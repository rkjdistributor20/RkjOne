'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
 CalendarDays,
 MapPin,
 Truck,
 Clock,
 CheckCircle2,
 Sparkles,
 Package,
 ChevronDown,
 ChevronUp,
 Navigation,
} from 'lucide-react';
import { confirmRouteStopDelivery, fetchDriverWorkSchedule } from '@/lib/production/api';
import type { DriverWorkScheduleEntry } from '@/lib/production/types';
import {
 DRIVER_ROLE_LABELS,
 ROUTE_STATUS_LABELS,
 STOP_STATUS_LABELS,
 type DriverRouteRole,
} from '@/lib/production/driver-routing';
import {
 formatInstructionLabel,
 groupPickByCategory,
 manifestProgress,
 MAX_STOPS_PER_INSTRUCTION,
} from '@/lib/production/route-optimizer';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

const PHASE_LABELS: Record<string, string> = {
 PREDICTION: 'Ramalan',
 FINAL: 'Muktamad',
};

interface DriverWorkSchedulePanelProps {
 driverMode?: boolean;
}

export function DriverWorkSchedulePanel({ driverMode = false }: DriverWorkSchedulePanelProps) {
 const [entries, setEntries] = useState<DriverWorkScheduleEntry[]>([]);
 const [loading, setLoading] = useState(true);
 const [confirmingStop, setConfirmingStop] = useState<string | null>(null);
 const [receiverByStop, setReceiverByStop] = useState<Record<string, string>>({});
 const [expandedStop, setExpandedStop] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const { schedule } = await fetchDriverWorkSchedule();
 setEntries(schedule);
 } catch {
 setEntries([]);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 async function handleConfirmStop(stopId: string, branchName: string) {
 const receiverName = receiverByStop[stopId]?.trim();
 if (!receiverName) {
 toast.error('Masukkan nama penerima di cawangan');
 return;
 }
 setConfirmingStop(stopId);
 try {
 const { result } = await confirmRouteStopDelivery(stopId, {
 receiver_name: receiverName,
 });
 toast.success(
 (result as { order_fulfilled?: boolean }).order_fulfilled
 ? `Stok dihantar ke ${branchName} - semua cawangan selesai`
 : `Stok disahkan di ${branchName}`);
 setReceiverByStop((prev) => {
 const next = {...prev };
 delete next[stopId];
 return next;
 });
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal sahkan penghantaran');
 } finally {
 setConfirmingStop(null);
 }
 }

 if (loading) {
 return <Skeleton className="h-48 w-full rounded-xl" />;
 }

 if (entries.length === 0) {
 return (
 <EmptyState
 icon={CalendarDays}
 title={driverMode ? 'Tiada arahan penghantaran hari ini' : 'Tiada jadual kerja lagi'}
 description="HQ akan gabungkan DO cawangan (max 20 hentian/arahan) selepas order kilang dirancang - susunan laluan dioptimumkan AI."
 />);
 }

 const byDate = new Map<string, DriverWorkScheduleEntry[]>();
 for (const e of entries) {
 const list = byDate.get(e.production_date) ?? [];
 list.push(e);
 byDate.set(e.production_date, list);
 }

 return (
 <div className="space-y-5">
 {!driverMode && (
 <p className="text-sm text-muted-foreground">
 Setiap driver menerima <strong>1 arahan</strong> sehingga {MAX_STOPS_PER_INSTRUCTION}{' '}
 cawangan/hari - susunan laluan dioptimumkan AI (kritikal didahulukan, ikut arah jalan).
 </p>)}

 {[...byDate.entries()].map(([date, routes]) => (
 <div key={date} className="space-y-4">
 <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
 <CalendarDays className="h-4 w-4" />
 Production: {formatProductionDayLabel(date)}
 </div>

 {routes.map((route) => (
 <ManifestCard
 key={route.plan_id}
 route={route}
 driverMode={driverMode}
 confirmingStop={confirmingStop}
 receiverByStop={receiverByStop}
 expandedStop={expandedStop}
 onReceiverChange={(stopId, name) =>
 setReceiverByStop((prev) => ({...prev, [stopId]: name }))
 }
 onToggleExpand={(stopId) =>
 setExpandedStop((cur) => (cur === stopId ? null : stopId))
 }
 onConfirmStop={handleConfirmStop}
 />))}
 </div>))}
 </div>);
}

function ManifestCard({
 route,
 driverMode,
 confirmingStop,
 receiverByStop,
 expandedStop,
 onReceiverChange,
 onToggleExpand,
 onConfirmStop,
}: {
 route: DriverWorkScheduleEntry;
 driverMode: boolean;
 confirmingStop: string | null;
 receiverByStop: Record<string, string>;
 expandedStop: string | null;
 onReceiverChange: (stopId: string, name: string) => void;
 onToggleExpand: (stopId: string) => void;
 onConfirmStop: (stopId: string, branchName: string) => void;
}) {
 const pattern = (route.route_pattern ?? 'DIRECT') as DriverRouteRole;
 const progress = manifestProgress(route);
 const pickGroups = groupPickByCategory(route.pick_summary ?? []);

 return (
 <div className="overflow-hidden rounded-xl border border-emerald-200/80 bg-card shadow-sm">
 <div className="border-b bg-gradient-to-r from-emerald-50/90 to-teal-50/50 px-4 py-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="font-mono text-xs font-semibold tracking-wide text-emerald-800">
 {formatInstructionLabel(route)}
 </p>
 <h3 className="mt-1 text-lg font-bold">
 {driverMode ? 'Arahan Penghantaran Saya' : route.driver_name}
 </h3>
 <div className="mt-2 flex flex-wrap gap-1.5">
 <Badge variant="outline">{route.driver_code}</Badge>
 <Badge variant="secondary">{DRIVER_ROLE_LABELS[pattern] ?? pattern}</Badge>
 <Badge>{ROUTE_STATUS_LABELS[route.status] ?? route.status}</Badge>
 {route.instruction_part > 1 && (
 <Badge className="bg-blue-100 text-blue-900">Bahagian {route.instruction_part}</Badge>)}
 {route.ai_optimized && (
 <Badge className="gap-1 bg-violet-100 text-violet-900">
 <Sparkles className="h-3 w-3" /> AI
 </Badge>)}
 </div>
 </div>
 <div className="text-right">
 <p className="text-2xl font-bold tabular-nums text-emerald-700">
 {progress.done}/{progress.total}
 </p>
 <p className="text-xs text-muted-foreground">hentian selesai</p>
 </div>
 </div>

 <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
 <div
 className="h-full rounded-full bg-emerald-600 transition-all"
 style={{ width: `${progress.percent}%` }}
 />
 </div>

 <p className="mt-2 text-xs text-muted-foreground">
 {route.vehicle ?? 'Kenderaan TBD'}
 {route.order_number && ` - ${route.order_number}`}
 {route.order_phase && ` - ${PHASE_LABELS[route.order_phase] ?? route.order_phase}`}
 </p>

 {route.ai_route_summary && (
 <p className="mt-2 flex items-start gap-1.5 rounded-md border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs text-violet-950">
 <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
 {route.ai_route_summary}
 </p>)}

 {route.status === 'WAITING_HANDOFF' && (
 <p className="mt-2 flex items-center gap-1 text-xs text-amber-800">
 <Clock className="h-3 w-3" />
 Tunggu sambut stok dari hub sebelum ke kiosk
 </p>)}
 </div>

 {pickGroups.length > 0 && (
 <div className="border-b bg-muted/20 px-4 py-3">
 <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 <Package className="h-3.5 w-3.5" />
 Senarai ambil stok (gabungan {route.kiosk_stops} cawangan)
 </p>
 <div className="flex flex-wrap gap-2">
 {pickGroups.map((g) =>
 g.items.map((item) => (
 <span
 key={item.item_code}
 className="rounded-md border bg-background px-2 py-1 text-xs"
 >
 <span className="font-medium">{item.name}</span>
 <span className="ml-1 tabular-nums text-muted-foreground">
 {Number(item.total_qty).toLocaleString('ms-MY')} {item.unit}
 </span>
 </span>)))}
 </div>
 </div>)}

 <ol className="divide-y">
 {route.stops.map((stop) => {
 const stopKey = stop.stop_id ?? `${route.plan_id}-${stop.sequence}`;
 const isExpanded = expandedStop === stopKey;
 const isPriority = (stop.priority_score ?? 0) >= 50;

 return (
 <li
 key={stopKey}
 className={cn(
 'px-4 py-3',
 stop.status === 'DELIVERED' && 'bg-emerald-50/40',
 stop.status === 'IN_TRANSIT' && 'bg-sky-50/30',
 isPriority && stop.status !== 'DELIVERED' && 'border-l-4 border-l-amber-400')}
 >
 <div className="flex flex-wrap items-start gap-2">
 <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
 {stop.sequence}
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
 {stop.is_handoff ? (
 <span className="font-semibold text-amber-800">{stop.branch_name}</span>) : (
 <>
 <span className="font-semibold">{stop.branch_name}</span>
 <span className="text-sm text-muted-foreground">({stop.branch_code})</span>
 </>)}
 {stop.status && (
 <Badge variant="outline" className="text-[10px]">
 {STOP_STATUS_LABELS[stop.status] ?? stop.status}
 </Badge>)}
 {stop.route_hint && (
 <Badge variant="secondary" className="gap-0.5 text-[10px]">
 <Navigation className="h-3 w-3" />
 {stop.route_hint}
 </Badge>)}
 </div>

 {stop.items?.length > 0 && (
 <button
 type="button"
 className="mt-1 flex items-center gap-1 text-xs text-emerald-700 hover:underline"
 onClick={() => onToggleExpand(stopKey)}
 >
 {stop.item_count} item stok
 {isExpanded ? (
 <ChevronUp className="h-3 w-3" />) : (
 <ChevronDown className="h-3 w-3" />)}
 </button>)}

 {isExpanded && stop.items?.length > 0 && (
 <ul className="mt-2 space-y-0.5 rounded-md border bg-muted/30 p-2 text-xs">
 {stop.items.map((item) => (
 <li key={item.item_code} className="flex justify-between gap-2">
 <span>{item.name}</span>
 <span className="tabular-nums text-muted-foreground">
 {Number(item.quantity).toLocaleString('ms-MY')} {item.unit}
 </span>
 </li>))}
 </ul>)}

 {!stop.is_handoff && stop.status === 'IN_TRANSIT' && stop.stop_id && (
 <div className="mt-3 flex flex-wrap items-center gap-2">
 <Input
 className="h-9 max-w-[200px] text-sm"
 placeholder="Nama penerima kiosk"
 value={receiverByStop[stop.stop_id] ?? ''}
 onChange={(e) => onReceiverChange(stop.stop_id!, e.target.value)}
 />
 <Button
 type="button"
 size="sm"
 className="gap-1 bg-emerald-600 hover:bg-emerald-700"
 disabled={confirmingStop === stop.stop_id}
 onClick={() => onConfirmStop(stop.stop_id!, stop.branch_name)}
 >
 <CheckCircle2 className="h-4 w-4" />
 {confirmingStop === stop.stop_id ? 'Mengesahkan...' : 'Sahkan Sampai'}
 </Button>
 </div>)}
 </div>
 </div>
 </li>);
 })}
 </ol>
 </div>);
}
