'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, MapPin, Truck, Clock } from 'lucide-react';
import { fetchDriverWorkSchedule } from '@/lib/production/api';
import type { DriverWorkScheduleEntry } from '@/lib/production/types';
import { DRIVER_ROLE_LABELS, ROUTE_STATUS_LABELS, type DriverRouteRole } from '@/lib/production/driver-routing';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/module-ui';

const PHASE_LABELS: Record<string, string> = {
  PREDICTION: 'Ramalan',
  FINAL: 'Muktamad',
};

export function DriverWorkSchedulePanel() {
  const [entries, setEntries] = useState<DriverWorkScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
        Jadual kerja dari order ramalan HQ — driver boleh rancang perjalanan lebih awal sebelum hari
        production.
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
                  <ol className="mt-2 space-y-1 border-l-2 border-emerald-200 pl-3 text-xs">
                    {route.stops.map((stop) => (
                      <li key={stop.sequence}>
                        <MapPin className="mr-1 inline h-3 w-3" />
                        <span className="font-medium">{stop.sequence}.</span>{' '}
                        {stop.is_handoff ? (
                          <span className="text-amber-800">Sambut Stok</span>
                        ) : (
                          <>
                            {stop.branch_name}{' '}
                            <span className="text-muted-foreground">({stop.branch_code})</span>
                          </>
                        )}
                        {stop.item_count > 0 && (
                          <span className="ml-1 text-muted-foreground">· {stop.item_count} item</span>
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
