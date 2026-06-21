'use client';

import { useEffect, useState } from 'react';
import { Factory, MapPin, Package, Truck } from 'lucide-react';
import type { FactoryOrderReport } from '@/lib/production/types';
import { fetchFactoryOrderReport } from '@/lib/production/api';
import { HQ_FACTORY_ORDER_SECTIONS, formatHqOrderPreview, getHqOrderUnitLabel } from '@/lib/production/hq-order-format';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { getStockByCode } from '@/lib/stock/catalog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

interface FactoryOrderReportViewProps {
  orderId: string;
  orderNumber?: string;
}

export function FactoryOrderReportView({ orderId, orderNumber }: FactoryOrderReportViewProps) {
  const [report, setReport] = useState<FactoryOrderReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { report: data } = await fetchFactoryOrderReport(orderId);
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!report) {
    return (
      <p className="text-sm text-muted-foreground">Laporan tidak dapat dimuatkan.</p>
    );
  }

  const totalsByCode = new Map(report.totals.map((t) => [t.item_code, t]));

  return (
    <div className="space-y-4 rounded-xl border bg-card">
      <div className="border-b bg-muted/30 px-4 py-3">
        <p className="font-bold">{orderNumber ?? report.order_number}</p>
        <p className="text-sm text-muted-foreground">
          Production: {formatProductionDayLabel(report.production_date)} ·{' '}
          {report.branches.length} cawangan · {report.routes.length} laluan
        </p>
      </div>

      <Tabs defaultValue="total" className="px-4 pb-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="total" className="gap-1 text-xs sm:text-sm">
            <Factory className="h-3.5 w-3.5" /> Jumlah Kilang
          </TabsTrigger>
          <TabsTrigger value="branches" className="gap-1 text-xs sm:text-sm">
            <MapPin className="h-3.5 w-3.5" /> Per Cawangan
          </TabsTrigger>
          <TabsTrigger value="routes" className="gap-1 text-xs sm:text-sm">
            <Truck className="h-3.5 w-3.5" /> Laluan Driver
          </TabsTrigger>
        </TabsList>

        <TabsContent value="total" className="mt-3 space-y-3">
          {HQ_FACTORY_ORDER_SECTIONS.map((section) => {
            const lines = section.itemCodes
              .map((code) => totalsByCode.get(code))
              .filter(Boolean);
            if (lines.length === 0) return null;
            return (
              <div key={section.id}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  {section.title}
                </p>
                <ul className="space-y-1 text-sm">
                  {lines.map((line) => {
                    if (!line) return null;
                    const def = getStockByCode(line.item_code);
                    const packQty = def?.pack_quantity
                      ? Number(line.quantity) / def.pack_quantity
                      : null;
                    const preview =
                      packQty != null ? formatHqOrderPreview(line.item_code, packQty) : null;
                    return (
                      <li key={line.item_code} className="flex justify-between gap-2">
                        <span>{line.name}</span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {packQty != null ? `${packQty} ${getHqOrderUnitLabel(line.item_code).toLowerCase()}` : `${line.quantity} ${line.unit}`}
                          {preview && (
                            <span className="ml-1 font-normal text-muted-foreground">({preview})</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="branches" className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {report.branches.map((branch) => (
            <div key={branch.branch_id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{branch.branch_name}</p>
                <Badge variant="outline" className="text-[10px]">
                  {branch.branch_code}
                </Badge>
              </div>
              {'driver_name' in branch && branch.driver_name && (
                <p className="mb-1 text-xs text-emerald-800">Driver: {branch.driver_name as string}</p>
              )}
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {branch.items.map((item) => (
                  <li key={item.item_code} className="flex justify-between">
                    <span>{item.name}</span>
                    <span className="tabular-nums text-foreground">
                      {Number(item.quantity).toLocaleString('ms-MY')} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="routes" className="mt-3 space-y-2">
          {report.routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Laluan belum dirancang oleh HQ.
            </p>
          ) : (
            report.routes.map((route) => (
              <div key={route.plan_id} className="rounded-lg border p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{route.route_name}</span>
                  <Badge variant="outline">{route.region_code}</Badge>
                  {'route_pattern' in route && route.route_pattern && (
                    <Badge variant="secondary">{route.route_pattern as string}</Badge>
                  )}
                  <Badge variant="outline">{route.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {route.driver ?? '—'} · {route.vehicle ?? '—'}
                </p>
                <ol className="mt-2 space-y-1 border-l-2 border-emerald-200 pl-3 text-xs">
                  {route.stops.map((stop) => (
                    <li key={stop.sequence}>
                      <span className="font-medium text-emerald-800">{stop.sequence}.</span>{' '}
                      {stop.is_handoff ? (
                        <span className="text-amber-800">
                          Sambut Stok → {stop.handoff_driver ?? 'Relay'}
                        </span>
                      ) : (
                        <>
                          {stop.branch_name}{' '}
                          <span className="text-muted-foreground">({stop.branch_code})</span>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
