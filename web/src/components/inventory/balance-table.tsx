'use client';

import type { InventoryBalanceRow } from '@/lib/inventory/types';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface BalanceTableProps {
  balances: InventoryBalanceRow[];
}

export function BalanceTable({ balances }: BalanceTableProps) {
  if (!balances.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No stock at this location. Use Receive to add stock.
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {balances.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.stock_item.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {b.stock_item.item_code}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {Number(b.quantity).toLocaleString()}
              </TableCell>
              <TableCell>{b.unit}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    b.status === 'CRITICAL'
                      ? 'destructive'
                      : b.status === 'LOW'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {b.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
