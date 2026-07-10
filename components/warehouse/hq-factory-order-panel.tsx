'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, CheckCircle2 } from 'lucide-react';
import {
 createHqFactoryOrder,
 fetchHqFactoryOrders,
 finalizeHqFactoryOrder,
} from '@/lib/production/api';
import type { HqFactoryOrder, PublishedProductionDate } from '@/lib/production/types';
import { ORDER_PHASE_LABELS } from '@/lib/production/types';
import type { StockItemOption } from '@/lib/inventory/types';
import { HqFactoryOrderForm } from '@/components/warehouse/hq-factory-order-form';
import { HqFactoryOrderCard } from '@/components/warehouse/hq-factory-order-card';
import { HqDeliveryRoutePanel } from '@/components/warehouse/hq-delivery-route-panel';
import { DriverWorkSchedulePanel } from '@/components/fleet/driver-work-schedule-panel';
import { Button } from '@/components/ui/button';

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
 const { orders: list } = await fetchHqFactoryOrders(undefined, 15);
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
 items?: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
 branch_items?: Array<{
 branch_id: string;
 stock_item_id: string;
 quantity: number;
 unit?: string;
 assigned_driver_id?: string;
 }>;
 notes?: string;
 }) {
 const { result } = await createHqFactoryOrder(payload);
 toast.success('Order ramalan disimpan - driver boleh lihat jadual awal');
 const orderId = (result as { order_id?: string }).order_id;
 if (orderId) setLastOrderId(orderId);
 loadOrders();
 onRefreshCalendar();
 return { order_id: orderId };
 }

 async function handleFinalize(orderId: string) {
 try {
 await finalizeHqFactoryOrder(orderId);
 toast.success('Order dimuktamadkan ke kilang');
 loadOrders();
 onRefreshCalendar();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal muktamadkan order');
 }
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
 <>
 {routeOrder.order_phase === 'PREDICTION' && routeOrder.status === 'SUBMITTED' && (
 <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
 <span>
 Order <strong>{routeOrder.order_number}</strong> masih{' '}
 <strong>{ORDER_PHASE_LABELS.PREDICTION}</strong> - boleh ubah &amp; rancang laluan.
 </span>
 <Button
 size="sm"
 variant="outline"
 className="border-violet-400"
 onClick={() => handleFinalize(routeOrder.id)}
 >
 <CheckCircle2 className="mr-1 h-4 w-4" />
 Muktamadkan ke Kilang Sekarang
 </Button>
 </div>)}
 <HqDeliveryRoutePanel
 orderId={routeOrder.id}
 productionDate={routeOrder.production_date}
 routesPlanned={!!routeOrder.routes_planned_at}
 onRoutesPlanned={loadOrders}
 />
 </>)}

 <div className="space-y-3">
 <h3 className="text-sm font-semibold">Jadual Kerja Driver (Preview Awal)</h3>
 <DriverWorkSchedulePanel />
 </div>

 <div className="space-y-3">
 <h3 className="flex items-center gap-2 text-sm font-semibold">
 <ClipboardList className="h-4 w-4" />
 Sejarah Order
 </h3>
 {loadingOrders ? (
 <p className="text-sm text-muted-foreground">Memuatkan...</p>) : orders.length === 0 ? (
 <p className="text-sm text-muted-foreground">Belum ada order.</p>) : (
 <div className="space-y-3">
 {orders.map((order) => (
 <HqFactoryOrderCard key={order.id} order={order} />))}
 </div>)}
 </div>
 </div>);
}
