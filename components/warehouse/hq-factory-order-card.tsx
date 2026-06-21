'use client';

import type { HqFactoryOrder } from '@/lib/production/types';
import { HQ_FACTORY_ORDER_STATUS_LABELS } from '@/lib/production/types';
import { HQ_FACTORY_ORDER_SECTIONS, formatHqOrderPreview, getHqOrderUnitLabel } from '@/lib/production/hq-order-format';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { getStockByCode } from '@/lib/stock/catalog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HqFactoryOrderCardProps {
  order: HqFactoryOrder;
  className?: string;
}

function orderQtyInPacks(itemCode: string, baseQty: number): number | null {
  const def = getStockByCode(itemCode);
  if (!def?.pack_quantity) return null;
  return baseQty / def.pack_quantity;
}

export function HqFactoryOrderCard({ order, className }: HqFactoryOrderCardProps) {
  const items = order.hq_factory_order_items ?? [];
  const itemsByCode = new Map(items.map((i) => [i.stock_item.item_code, i]));

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div>
          <p className="font-bold">{order.order_number}</p>
          <p className="text-sm text-muted-foreground">
            Production:{' '}
            <strong className="text-foreground">
              {formatProductionDayLabel(order.production_date)}
            </strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Dihantar {new Date(order.created_at).toLocaleString('ms-MY')}
          </p>
        </div>
        <Badge variant={order.status === 'SUBMITTED' ? 'secondary' : 'outline'}>
          {HQ_FACTORY_ORDER_STATUS_LABELS[order.status] ?? order.status}
        </Badge>
      </div>

      <div className="divide-y">
        {HQ_FACTORY_ORDER_SECTIONS.map((section) => {
          const sectionItems = section.itemCodes
            .map((code) => itemsByCode.get(code))
            .filter(Boolean);

          if (sectionItems.length === 0) return null;

          return (
            <div key={section.id} className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {sectionItems.map((item) => {
                  if (!item) return null;
                  const code = item.stock_item.item_code;
                  const packQty = orderQtyInPacks(code, Number(item.quantity));
                  const unitLabel = getHqOrderUnitLabel(code);
                  const preview =
                    packQty != null
                      ? formatHqOrderPreview(code, packQty)
                      : `${Number(item.quantity).toLocaleString('ms-MY')} ${item.unit}`;

                  return (
                    <li key={item.id} className="flex justify-between gap-2 text-sm">
                      <span>{item.stock_item.name}</span>
                      <span className="shrink-0 text-right font-medium tabular-nums">
                        {packQty != null && packQty % 1 !== 0
                          ? packQty.toFixed(1)
                          : packQty ?? Number(item.quantity)}{' '}
                        {unitLabel.toLowerCase()}
                        {packQty != null && preview && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            ({preview})
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {order.notes && (
        <p className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          Nota HQ: {order.notes}
        </p>
      )}
      {(order.hq_factory_order_branch_items?.length ?? 0) > 0 && (
        <p className="border-t bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
          {new Set(order.hq_factory_order_branch_items?.map((i) => i.branch_id)).size} cawangan ·{' '}
          {order.hq_factory_order_branch_items?.length} baris roti
        </p>
      )}
    </div>
  );
}
