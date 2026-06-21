'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';
import { acknowledgeHqFactoryOrder, fetchHqFactoryOrders } from '@/lib/production/api';
import type { HqFactoryOrder } from '@/lib/production/types';
import { ORDER_PHASE_LABELS } from '@/lib/production/types';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  const predictions = orders.filter((o) => o.order_phase === 'PREDICTION' && o.status === 'SUBMITTED');
  const finals = orders.filter((o) => o.order_phase !== 'PREDICTION' || o.status !== 'SUBMITTED');
  const pendingFinal = finals.filter((o) => o.status === 'SUBMITTED' && o.order_phase === 'FINAL');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="flex items-center gap-2 font-semibold">
          <Inbox className="h-4 w-4" />
          Laporan Order dari HQ
        </p>
        <p className="mt-1">
          <strong>Ramalan</strong> = perancangan awal HQ (boleh berubah).{' '}
          <strong>Muktamad</strong> = order sah untuk production — sahkan di bawah.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuatkan…</p>
      ) : orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Tiada laporan order HQ buat masa ini.
        </p>
      ) : (
        <>
          {predictions.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-violet-800">
                {predictions.length} order ramalan (rujukan awal — belum perlu disahkan)
              </p>
              {predictions.map((order) => (
                <div key={order.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className="bg-violet-100 text-violet-900">
                      {ORDER_PHASE_LABELS.PREDICTION}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{order.order_number}</span>
                  </div>
                  <FactoryOrderReportView orderId={order.id} orderNumber={order.order_number} />
                </div>
              ))}
            </div>
          )}

          {pendingFinal.length > 0 && (
            <p className="text-sm font-medium text-amber-800">
              {pendingFinal.length} order muktamad menunggu pengesahan kilang
            </p>
          )}

          <div className="space-y-6">
            {finals.map((order) => (
              <div key={order.id}>
                {order.order_phase === 'FINAL' && (
                  <Badge className="mb-2" variant="default">
                    {ORDER_PHASE_LABELS.FINAL}
                  </Badge>
                )}
                <FactoryOrderReportView orderId={order.id} orderNumber={order.order_number} />
                {order.status === 'SUBMITTED' && order.order_phase === 'FINAL' && (
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
