'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList } from 'lucide-react';
import { createHqFactoryOrder, fetchHqFactoryOrders } from '@/lib/production/api';
import type { HqFactoryOrder, PublishedProductionDate } from '@/lib/production/types';
import type { StockItemOption } from '@/lib/inventory/types';
import { HqFactoryOrderForm } from '@/components/warehouse/hq-factory-order-form';
import { HqFactoryOrderCard } from '@/components/warehouse/hq-factory-order-card';

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

  async function handleSubmit(payload: {
    production_date: string;
    items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
    notes?: string;
  }) {
    await createHqFactoryOrder(payload);
    toast.success('Order berjaya dihantar ke kilang');
    loadOrders();
    onRefreshCalendar();
  }

  return (
    <div className="space-y-8">
      <HqFactoryOrderForm
        stockItems={stockItems}
        publishedDates={publishedDates}
        onSubmit={handleSubmit}
      />

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
