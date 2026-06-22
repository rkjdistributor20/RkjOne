'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Truck, Users, Sparkles, Package, Factory, Warehouse } from 'lucide-react';
import { fetchDriverWorkSchedule } from '@/lib/production/api';
import { fetchInventoryOverview } from '@/lib/inventory/api';
import type { DriverWorkScheduleEntry } from '@/lib/production/types';
import type { InventoryOverviewResponse } from '@/lib/inventory/types';
import { MAX_STOPS_PER_INSTRUCTION } from '@/lib/production/route-optimizer';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function FleetOverviewPanel() {
  const [schedule, setSchedule] = useState<DriverWorkScheduleEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sched, inv] = await Promise.all([
        fetchDriverWorkSchedule(),
        fetchInventoryOverview(),
      ]);
      setSchedule(sched.schedule);
      setInventory(inv);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan ringkasan armada');
      setSchedule([]);
      setInventory(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
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
            Max {MAX_STOPS_PER_INSTRUCTION} hentian/arahan · DO digabung · susunan AI
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {byDriver.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tiada arahan aktif. Rancang laluan dari {HQ_DISTRIBUTOR_LABEL} selepas order kilang.
            </p>
          ) : (
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
                      {first.driver_code} · {entries.length} arahan
                      {entries.map((e) => e.instruction_code).filter(Boolean).length > 0 &&
                        ` · ${entries.map((e) => e.instruction_code).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {completed}/{totalStops} hentian
                    </Badge>
                    {entries.some((e) => e.ai_optimized) && (
                      <Badge className="gap-1 bg-violet-100 text-violet-900">
                        <Sparkles className="h-3 w-3" /> AI
                      </Badge>
                    )}
                    <Badge>{ROUTE_STATUS(entries)}</Badge>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
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
    </div>
  );
}
