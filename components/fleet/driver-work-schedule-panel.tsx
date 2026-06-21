'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, MapPin, Truck, Clock, CheckCircle2 } from 'lucide-react';
import { confirmRouteStopDelivery, fetchDriverWorkSchedule } from '@/lib/production/api';
import type { DriverWorkScheduleEntry } from '@/lib/production/types';
import {
  DRIVER_ROLE_LABELS,
  ROUTE_STATUS_LABELS,
  STOP_STATUS_LABELS,
  type DriverRouteRole,
} from '@/lib/production/driver-routing';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/module-ui';

const PHASE_LABELS: Record<string, string> = {
  PREDICTION: 'Ramalan',
  FINAL: 'Muktamad',
};

export function DriverWorkSchedulePanel() {
  const [entries, setEntries] = useState<DriverWorkScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingStop, setConfirmingStop] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState('');

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
    if (!receiverName.trim()) {
      toast.error('Masukkan nama penerima di cawangan');
      return;
    }
    setConfirmingStop(stopId);
    try {
      const { result } = await confirmRouteStopDelivery(stopId, {
        receiver_name: receiverName.trim(),
      });
      toast.success(
        (result as { order_fulfilled?: boolean }).order_fulfilled
          ? `Stok dihantar ke ${branchName} — semua cawangan selesai`
          : `Stok disahkan di ${branchName}`
      );
      setReceiverName('');
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
        title="Tiada jadual kerja lagi"
        description="HQ akan rancang laluan selepas order ramalan dihantar — jadual akan muncul di sini lebih awal."
      />
    );
  }

  const byDate = new Map<string, DriverWorkScheduleEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.production_date) ?? [];
    list.push(e);
    byDate.set(e.production_date, list);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pre-order dihantar terus ke cawangan selepas kilang sahkan. Sahkan penghantaran di setiap
        hentian kiosk apabila stok sampai.
      </p>

      {[...byDate.entries()].map(([date, routes]) => (
        <div key={date} className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/40 px-4 py-3">
            <p className="flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4" />
              Production: {formatProductionDayLabel(date)}
            </p>
            {routes[0]?.order_phase && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Order {PHASE_LABELS[routes[0].order_phase] ?? routes[0].order_phase}
                {routes[0].order_number && ` · ${routes[0].order_number}`}
                {routes[0].order_status === 'ACKNOWLEDGED' && ' · Kilang telah sahkan'}
              </p>
            )}
          </div>
          <div className="divide-y">
            {routes.map((route) => {
              const pattern = (route.route_pattern ?? 'DIRECT') as DriverRouteRole;
              return (
                <div key={route.plan_id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Truck className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium">{route.driver_name}</span>
                    <Badge variant="outline">{route.driver_code}</Badge>
                    <Badge variant="secondary">{DRIVER_ROLE_LABELS[pattern] ?? pattern}</Badge>
                    <Badge>{ROUTE_STATUS_LABELS[route.status] ?? route.status}</Badge>
                    {route.order_phase === 'PREDICTION' && (
                      <Badge className="bg-violet-100 text-violet-900">Ramalan</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {route.route_name} · {route.vehicle ?? 'Kenderaan TBD'}
                  </p>
                  {route.status === 'WAITING_HANDOFF' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-800">
                      <Clock className="h-3 w-3" />
                      Tunggu sambut stok dari hub sebelum ke kiosk
                    </p>
                  )}
                  <ol className="mt-2 space-y-2 border-l-2 border-emerald-200 pl-3 text-xs">
                    {route.stops.map((stop) => (
                      <li key={stop.stop_id ?? stop.sequence}>
                        <div className="flex flex-wrap items-center gap-2">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="font-medium">{stop.sequence}.</span>
                          {stop.is_handoff ? (
                            <span className="text-amber-800">Sambut Stok</span>
                          ) : (
                            <>
                              {stop.branch_name}{' '}
                              <span className="text-muted-foreground">({stop.branch_code})</span>
                            </>
                          )}
                          {stop.status && (
                            <Badge variant="outline" className="text-[10px]">
                              {STOP_STATUS_LABELS[stop.status] ?? stop.status}
                            </Badge>
                          )}
                          {stop.item_count > 0 && (
                            <span className="text-muted-foreground">· {stop.item_count} item</span>
                          )}
                        </div>
                        {!stop.is_handoff && stop.status === 'IN_TRANSIT' && stop.stop_id && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
                            <Input
                              className="h-8 max-w-[180px] text-xs"
                              placeholder="Nama penerima kiosk"
                              value={receiverName}
                              onChange={(e) => setReceiverName(e.target.value)}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                              disabled={confirmingStop === stop.stop_id}
                              onClick={() =>
                                handleConfirmStop(stop.stop_id!, stop.branch_name)
                              }
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {confirmingStop === stop.stop_id ? 'Mengesahkan…' : 'Sahkan Sampai'}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
