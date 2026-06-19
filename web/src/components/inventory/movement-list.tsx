'use client';

import type { StockMovementRow } from '@/lib/inventory/types';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MovementListProps {
  movements: StockMovementRow[];
}

const TYPE_COLORS: Record<string, string> = {
  RECEIVE: 'bg-green-100 text-green-800',
  TRANSFER_IN: 'bg-blue-100 text-blue-800',
  TRANSFER_OUT: 'bg-orange-100 text-orange-800',
  ADJUSTMENT: 'bg-yellow-100 text-yellow-800',
  COUNT: 'bg-purple-100 text-purple-800',
  WRITE_OFF: 'bg-red-100 text-red-800',
  SALE_DEDUCT: 'bg-gray-100 text-gray-800',
};

export function MovementList({ movements }: MovementListProps) {
  if (!movements.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No movements recorded
      </p>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {movements.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium">{m.stock_item.name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleString('ms-MY')}
                {m.created_by_profile?.full_name &&
                  ` · ${m.created_by_profile.full_name}`}
              </p>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${Number(m.quantity) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Number(m.quantity) > 0 ? '+' : ''}
                {Number(m.quantity).toLocaleString()} {m.unit}
              </p>
              <Badge className={TYPE_COLORS[m.movement_type] ?? ''}>
                {m.movement_type.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
