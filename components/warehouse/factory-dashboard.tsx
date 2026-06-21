'use client';

import { useCallback, useEffect, useState } from 'react';
import { Factory, CalendarDays, Inbox, ClipboardList } from 'lucide-react';
import { fetchHqFactoryOrders } from '@/lib/production/api';
import type { HqFactoryOrder } from '@/lib/production/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FactoryProductionSchedulePanel } from '@/components/warehouse/factory-production-schedule-panel';
import { FactoryOrderInbox } from '@/components/warehouse/factory-order-inbox';
import { COMPANY } from '@/lib/brand/company';
import {
  ModuleLayout,
  ModuleHeader,
  KpiGrid,
  KpiCard,
  moduleTabsListClass,
  moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

export function FactoryDashboard() {
  const [orders, setOrders] = useState<HqFactoryOrder[]>([]);

  const loadOrders = useCallback(async () => {
    try {
      const { orders: list } = await fetchHqFactoryOrders();
      setOrders(list.filter((o) => o.status !== 'CANCELLED'));
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const pendingCount = orders.filter((o) => o.status === 'SUBMITTED').length;
  const acknowledgedCount = orders.filter((o) => o.status === 'ACKNOWLEDGED').length;

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Kilang"
        description={`${COMPANY.name} — jadual production mingguan · terima & sahkan order dari HQ`}
        icon={Factory}
      />

      <KpiGrid cols={3}>
        <KpiCard
          title="Order Menunggu"
          value={pendingCount}
          description="Perlu pengesahan kilang"
          icon={ClipboardList}
          variant={pendingCount > 0 ? 'warning' : undefined}
        />
        <KpiCard
          title="Order Disahkan"
          value={acknowledgedCount}
          description="Sedia untuk production"
          icon={Inbox}
        />
        <KpiCard
          title="Jumlah Order Aktif"
          value={orders.length}
          icon={Factory}
        />
      </KpiGrid>

      <Tabs defaultValue={pendingCount > 0 ? 'inbox' : 'schedule'} className="space-y-4">
        <TabsList className={moduleTabsListClass}>
          <TabsTrigger value="schedule" className={moduleTabsTriggerClass}>
            <CalendarDays className="h-4 w-4" /> Jadual Production
          </TabsTrigger>
          <TabsTrigger value="inbox" className={moduleTabsTriggerClass}>
            <Inbox className="h-4 w-4" />
            Laporan Order HQ
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <FactoryProductionSchedulePanel />
        </TabsContent>

        <TabsContent value="inbox" className="mt-4">
          <FactoryOrderInbox onOrdersChange={loadOrders} />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  );
}
