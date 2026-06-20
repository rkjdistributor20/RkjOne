'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Truck, Plus, MapPin, Package } from 'lucide-react';
import {
  fetchDeliveryOrders,
  fetchFleetDrivers,
  fetchFleetVehicles,
  fetchFleetStatus,
  dispatchLeg,
  logFleetStatus,
} from '@/lib/fleet/api';
import { fetchLocations, fetchStockItems } from '@/lib/inventory/api';
import type { DeliveryLeg, DeliveryOrder, FleetDriver, FleetStatusLog, FleetVehicle } from '@/lib/fleet/types';
import { LEG_TYPE_LABELS } from '@/lib/fleet/types';
import type { InventoryLocation, StockItemOption } from '@/lib/inventory/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateDeliveryDialog } from '@/components/fleet/create-delivery-dialog';
import { PodDialog } from '@/components/fleet/pod-dialog';

const STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'destructive' | 'default'> = {
  PENDING: 'secondary',
  IN_TRANSIT: 'default',
  DELIVERED: 'outline',
  DRAFT: 'secondary',
};

export function FleetDashboard() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [statusLogs, setStatusLogs] = useState<FleetStatusLog[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [podLeg, setPodLeg] = useState<DeliveryLeg | null>(null);
  const [podOpen, setPodOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ord, veh, drv, logs, loc, items] = await Promise.all([
        fetchDeliveryOrders(),
        fetchFleetVehicles(),
        fetchFleetDrivers(),
        fetchFleetStatus(),
        fetchLocations(),
        fetchStockItems(),
      ]);
      setOrders(ord.orders as DeliveryOrder[]);
      setVehicles(veh.vehicles);
      setDrivers(drv.drivers);
      setStatusLogs(logs.logs as FleetStatusLog[]);
      setLocations(loc.locations);
      setStockItems(items.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load fleet data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDispatch(legId: string) {
    try {
      await dispatchLeg(legId);
      toast.success('Leg dispatched');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dispatch failed');
    }
  }

  async function handleLogStatus(vehicleId: string, status: string) {
    try {
      await logFleetStatus({ vehicle_id: vehicleId, status });
      toast.success('Status logged');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log status');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Fleet Management</h2>
          <p className="text-sm text-muted-foreground">
            Factory → HQ → Vehicle → Branch · POD tracking
          </p>
        </div>
        <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Delivery
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue="deliveries">
          <TabsList>
            <TabsTrigger value="deliveries" className="gap-1">
              <Package className="h-4 w-4" /> Deliveries
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1">
              <Truck className="h-4 w-4" /> Vehicles
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-1">
              <MapPin className="h-4 w-4" /> Status Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deliveries" className="mt-4 space-y-4">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No delivery orders yet</p>
            ) : (
              orders.map((order) => (
                <Card key={order.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{order.order_number}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {order.origin_location.name} → {order.final_destination.name}
                          {order.primary_driver && ` · ${order.primary_driver.full_name}`}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>
                        {order.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(order.delivery_legs ?? [])
                      .sort((a, b) => a.leg_sequence - b.leg_sequence)
                      .map((leg) => (
                        <div key={leg.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-medium">
                                Leg {leg.leg_sequence}: {LEG_TYPE_LABELS[leg.leg_type]}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {leg.from_location.name} → {leg.to_location.name}
                              </p>
                            </div>
                            <Badge variant="outline">{leg.status}</Badge>
                          </div>
                          <ul className="mt-2 text-xs text-muted-foreground">
                            {leg.delivery_leg_items?.map((item, i) => (
                              <li key={i}>
                                {item.stock_item.name}: {item.quantity} {item.unit}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex gap-2">
                            {leg.status === 'PENDING' && (
                              <Button size="sm" variant="outline" onClick={() => handleDispatch(leg.id)}>
                                Dispatch
                              </Button>
                            )}
                            {leg.status === 'IN_TRANSIT' && (
                              <Button
                                size="sm"
                                className="bg-amber-500 hover:bg-amber-600"
                                onClick={() => {
                                  setPodLeg(leg);
                                  setPodOpen(true);
                                }}
                              >
                                Submit POD
                              </Button>
                            )}
                            {leg.proof_of_delivery?.[0] && (
                              <span className="text-xs text-green-600">
                                POD: {leg.proof_of_delivery[0].receiver_name}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="vehicles" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <Card key={v.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{v.vehicle_code}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>{v.vehicle_type} {v.plate_number && `· ${v.plate_number}`}</p>
                    <p className="text-muted-foreground">Capacity: {v.capacity ?? '—'}</p>
                    {v.latest_status && (
                      <Badge variant="outline">{v.latest_status}</Badge>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {['Loading', 'In Transit', 'At Branch', 'Returning'].map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleLogStatus(v.id, s)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="status" className="mt-4 space-y-2">
            {statusLogs.map((log) => (
              <div key={log.id} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {log.vehicle.vehicle_code} — {log.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.logged_at).toLocaleString('ms-MY')}
                  </span>
                </div>
                {log.driver && (
                  <p className="text-xs text-muted-foreground">{log.driver.full_name}</p>
                )}
                {log.location_description && (
                  <p className="text-xs">{log.location_description}</p>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}

      <CreateDeliveryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        locations={locations}
        stockItems={stockItems}
        drivers={drivers}
        vehicles={vehicles}
        onSuccess={loadData}
      />

      <PodDialog
        open={podOpen}
        onOpenChange={setPodOpen}
        leg={podLeg}
        onSuccess={loadData}
      />
    </div>
  );
}
