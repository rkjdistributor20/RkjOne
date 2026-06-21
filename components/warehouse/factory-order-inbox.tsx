'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';
import { acknowledgeHqFactoryOrder, fetchHqFactoryOrders } from '@/lib/production/api';
import type { HqFactoryOrder } from '@/lib/production/types';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { Button } from '@/components/ui/button';
import { FactoryOrderReportView } from '@/components/warehouse/factory-order-report-view';

export function FactoryOrderInbox({ onOrdersChange }: { onOrdersChange?: () => void }) {
  const [orders, setOrders] = useState<HqFactoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { orders: list } = await fetchHqFactoryOrders();
      setOrders(list.filter((o) => o.status !== 'CANCELLED'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan laporan order');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAck(id: string) {
    try {
      await acknowledgeHqFactoryOrder(id);
      toast.success('Order disahkan — sedia untuk production');
      load();
      onOrdersChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal sahkan order');
    }
  }

  const pending = orders.filter((o) => o.status === 'SUBMITTED');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="flex items-center gap-2 font-semibold">
          <Inbox className="h-4 w-4" />
          Laporan Order dari HQ
        </p>
        <p className="mt-1">
          Kilang terima <strong>jumlah production</strong> dan <strong>pecahan setiap cawangan</strong>{' '}
          + laluan driver. Order HQ ditutup automatik T-1 jam 10 malam.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuatkan…</p>
      ) : pending.length === 0 && orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Tiada laporan order HQ buat masa ini.
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <p className="text-sm font-medium text-amber-800">
              {pending.length} order menunggu pengesahan kilang
            </p>
          )}
          <div className="space-y-6">
            {orders.map((order) => (
              <div key={order.id}>
                <FactoryOrderReportView orderId={order.id} orderNumber={order.order_number} />
                {order.status === 'SUBMITTED' && (
                  <Button
                    className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                    size="sm"
                    onClick={() => handleAck(order.id)}
                  >
                    Sahkan Order · {formatProductionDayLabel(order.production_date)}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
