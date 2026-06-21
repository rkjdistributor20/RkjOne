'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList } from 'lucide-react';
import {
  createHqFactoryOrder,
  fetchHqFactoryOrders,
} from '@/lib/production/api';
import type { HqFactoryOrder, PublishedProductionDate } from '@/lib/production/types';
import type { StockItemOption } from '@/lib/inventory/types';
import { HqFactoryOrderForm } from '@/components/warehouse/hq-factory-order-form';
import { HqFactoryOrderCard } from '@/components/warehouse/hq-factory-order-card';
import { HqDeliveryRoutePanel } from '@/components/warehouse/hq-delivery-route-panel';

interface HqFactoryOrderPanelProps {
  stockItems: StockItemOption[];
  publishedDates: PublishedProductionDate[];
  onRefreshCalendar: () => void;
}

export function HqFactoryOrderPanel({
  stockItems,
  publishedDates,
  onRefreshCalendar,
}: HqFactoryOrderPanelProps) {
  const [orders, setOrders] = useState<HqFactoryOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { orders: list } = await fetchHqFactoryOrders();
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const latestSubmitted = orders.find((o) => o.status === 'SUBMITTED' || o.status === 'ACKNOWLEDGED');

  async function handleSubmit(payload: {
    production_date: string;
    items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
    branch_items?: Array<{
      branch_id: string;
      stock_item_id: string;
      quantity: number;
      unit?: string;
    }>;
    notes?: string;
  }) {
    const { result } = await createHqFactoryOrder(payload);
    toast.success('Order berjaya dihantar ke kilang');
    const orderId = (result as { order_id?: string }).order_id;
    if (orderId) setLastOrderId(orderId);
    loadOrders();
    onRefreshCalendar();
    return { order_id: orderId };
  }

  const routeOrder = orders.find((o) => o.id === lastOrderId) ?? latestSubmitted;

  return (
    <div className="space-y-8">
      <HqFactoryOrderForm
        stockItems={stockItems}
        publishedDates={publishedDates}
        onSubmit={handleSubmit}
      />

      {routeOrder && (
        <HqDeliveryRoutePanel
          orderId={routeOrder.id}
          productionDate={routeOrder.production_date}
          routesPlanned={!!routeOrder.routes_planned_at}
          onRoutesPlanned={loadOrders}
        />
      )}

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="h-4 w-4" />
          Sejarah Order Dihantar
        </h3>
        {loadingOrders ? (
          <p className="text-sm text-muted-foreground">Memuatkan…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada order dihantar.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <HqFactoryOrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
