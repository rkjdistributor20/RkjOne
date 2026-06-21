'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Route, Truck } from 'lucide-react';
import {
  createDeliveryRoutesForOrder,
  fetchDeliveryRoutePlans,
} from '@/lib/production/api';
import type { DeliveryRoutePlan } from '@/lib/production/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);

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

  async function handlePlanRoutes() {
    setPlanning(true);
    try {
      await createDeliveryRoutesForOrder(orderId);
      toast.success('Laluan driver dirancang ikut kawasan & arah jalan');
      await load();
      onRoutesPlanned?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal rancang laluan');
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-emerald-950">
            <Route className="h-4 w-4" />
            Perjalanan Driver ke Cawangan
          </p>
          <p className="mt-1 text-xs text-emerald-900/80">
            Laluan disusun ikut kawasan (Utara/Tengah/Selatan) dan arah jalan highway —
            Arah Utara → Selatan mengikut kod cawangan.
          </p>
        </div>
        {!routesPlanned && routes.length === 0 && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={planning}
            onClick={handlePlanRoutes}
          >
            <Truck className="mr-1 h-4 w-4" />
            {planning ? 'Merancang…' : 'Susun Laluan Driver'}
          </Button>
        )}
      </div>

      {routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Submit order dahulu, kemudian susun laluan penghantaran untuk production{' '}
          {productionDate}.
        </p>
      ) : (
        <div className="space-y-2">
          {routes.map((route) => (
            <div key={route.id} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{route.route_name}</span>
                {route.region_code && (
                  <Badge variant="outline">{route.region_code}</Badge>
                )}
                <Badge variant="secondary">{route.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {route.driver?.full_name ?? 'Driver TBD'} ·{' '}
                {route.vehicle
                  ? `${route.vehicle.vehicle_code} ${route.vehicle.vehicle_type}`
                  : 'Kenderaan TBD'}
              </p>
              {route.stops && route.stops.length > 0 && (
                <p className="mt-2 text-xs">
                  {route.stops
                    .sort((a, b) => a.stop_sequence - b.stop_sequence)
                    .map((s) => s.branch.branch_code)
                    .join(' → ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
