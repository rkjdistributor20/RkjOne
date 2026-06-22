'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Factory,
  Warehouse,
  Truck,
  Store,
  ArrowRight,
  AlertTriangle,
  Package,
  RefreshCw,
} from 'lucide-react';
import { fetchInventoryOverview } from '@/lib/inventory/api';
import type {
  InventoryOverviewNode,
  InventoryOverviewResponse,
  LocationType,
} from '@/lib/inventory/types';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const NODE_ICONS: Record<LocationType, typeof Factory> = {
  FACTORY: Factory,
  HQ_WAREHOUSE: Warehouse,
  FLEET_VEHICLE: Truck,
  BRANCH_KIOSK: Store,
};

const NODE_COLORS: Record<LocationType, string> = {
  FACTORY: 'border-amber-200 bg-amber-50/80',
  HQ_WAREHOUSE: 'border-blue-200 bg-blue-50/80',
  FLEET_VEHICLE: 'border-violet-200 bg-violet-50/80',
  BRANCH_KIOSK: 'border-emerald-200 bg-emerald-50/80',
};

interface InventorySupplyChainPanelProps {
  onSelectLocation?: (locationId: string, locationType: LocationType) => void;
  /** AM / staf — papar rantaian tanpa drill-down ke Kilang/HQ */
  kioskOnly?: boolean;
}

export function InventorySupplyChainPanel({
  onSelectLocation,
  kioskOnly = false,
}: InventorySupplyChainPanelProps) {
  const [data, setData] = useState<InventoryOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await fetchInventoryOverview();
      setData(overview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan ringkasan rantaian');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!data?.nodes.length) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Tiada data rantaian bekalan. Pastikan lokasi Kilang, {HQ_DISTRIBUTOR_LABEL} & kiosk telah disediakan.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Pindahan dalam perjalanan"
          value={data.pipeline.in_transit}
          hint={`Kilang → HQ → ${LOGISTIK_LABEL} → Kiosk`}
          icon={Truck}
          tone="violet"
        />
        <KpiCard
          label="Menunggu terima di kiosk"
          value={data.pipeline.pending_receive}
          hint="Sahkan di tab Pindah"
          icon={Package}
          tone="blue"
        />
        <KpiCard
          label="Kiosk stok rendah"
          value={data.network.low}
          hint={`daripada ${data.network.kiosks} cawangan`}
          icon={AlertTriangle}
          tone="amber"
        />
        <KpiCard
          label="Kiosk kritikal"
          value={data.network.critical}
          hint="Perlu tindakan segera"
          icon={AlertTriangle}
          tone="red"
        />
      </div>

      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Aliran Bekalan</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              9 item rasmi · Roti, Bahan & Packaging
            </p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Muat semula
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-stretch justify-center gap-2 md:gap-3">
            {data.nodes.map((node, idx) => (
              <div key={node.location_type} className="flex items-center gap-2 md:gap-3">
                <NodeCard
                  node={node}
                  kioskOnly={kioskOnly}
                  onSelectLocation={onSelectLocation}
                />
                {idx < data.nodes.length - 1 && (
                  <ArrowRight className="hidden h-5 w-5 shrink-0 text-muted-foreground/60 sm:block" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.nodes.some(
        (n) =>
          n.locations.length > 0 &&
          n.location_type !== 'BRANCH_KIOSK' &&
          !kioskOnly
      ) && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.nodes
            .filter(
              (n) =>
                n.location_type !== 'BRANCH_KIOSK' &&
                n.locations.length > 0 &&
                !kioskOnly
            )
            .map((node) => (
              <Card key={node.location_type} className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{node.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {node.locations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                      onClick={() => onSelectLocation?.(loc.id, node.location_type)}
                    >
                      <div>
                        <p className="font-medium">{loc.name}</p>
                        {loc.subtitle && (
                          <p className="text-xs text-muted-foreground">{loc.subtitle}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {loc.critical_count > 0 && (
                          <Badge variant="destructive">{loc.critical_count}</Badge>
                        )}
                        {loc.low_count > 0 && (
                          <Badge variant="secondary">{loc.low_count}</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Package;
  tone: 'violet' | 'blue' | 'amber' | 'red';
}) {
  const toneClass = {
    violet: 'text-violet-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-destructive',
  }[tone];

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={cn('h-4 w-4 shrink-0 opacity-70', toneClass)} />
      </div>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', toneClass)}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function NodeCard({
  node,
  kioskOnly,
  onSelectLocation,
}: {
  node: InventoryOverviewNode;
  kioskOnly?: boolean;
  onSelectLocation?: (locationId: string, locationType: LocationType) => void;
}) {
  const Icon = NODE_ICONS[node.location_type];
  const color = NODE_COLORS[node.location_type];
  const hasAlert = node.low_count > 0 || node.critical_count > 0;
  const canDrillDown =
    !kioskOnly || node.location_type === 'BRANCH_KIOSK';

  const primaryLoc = node.locations[0];

  return (
    <button
      type="button"
      className={cn(
        'min-w-[140px] flex-1 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md sm:min-w-[160px]',
        color,
        primaryLoc && onSelectLocation && canDrillDown && 'cursor-pointer',
        (!primaryLoc || !canDrillDown) && 'cursor-default opacity-90'
      )}
      onClick={() => {
        if (primaryLoc && onSelectLocation && canDrillDown) {
          onSelectLocation(primaryLoc.id, node.location_type);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0 opacity-80" />
        <span className="text-sm font-semibold">{node.label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {node.location_count}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {node.location_type === 'BRANCH_KIOSK' ? 'cawangan' : 'lokasi'}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {node.critical_count > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {node.critical_count} kritikal
          </Badge>
        )}
        {node.low_count > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {node.low_count} rendah
          </Badge>
        )}
        {node.in_transit_in > 0 && (
          <Badge variant="outline" className="border-violet-300 text-[10px] text-violet-800">
            +{node.in_transit_in} transit
          </Badge>
        )}
        {!hasAlert && node.in_transit_in === 0 && (
          <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-800">
            Stabil
          </Badge>
        )}
      </div>
    </button>
  );
}
