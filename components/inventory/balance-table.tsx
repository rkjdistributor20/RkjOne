'use client';

import type { InventoryBalanceRow } from '@/lib/inventory/types';
import { formatStockQuantity } from '@/lib/stock/catalog';
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
  showPackConversion?: boolean;
}

export function BalanceTable({ balances, showPackConversion = false }: BalanceTableProps) {
  if (!balances.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Tiada stok di lokasi ini. Guna tab Terima untuk tambah stok.
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Kod</TableHead>
            <TableHead className="text-right">Kuantiti</TableHead>
            {showPackConversion && <TableHead>Penukaran</TableHead>}
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
                {showPackConversion
                  ? formatStockQuantity(b.quantity, b.unit, {
                      ...b.stock_item,
                      item_code: b.stock_item.item_code,
                    })
                  : `${Number(b.quantity).toLocaleString('ms-MY')} ${b.unit}`}
              </TableCell>
              {showPackConversion && (
                <TableCell className="text-xs text-muted-foreground">
                  {b.stock_item.conversion_text ?? '—'}
                </TableCell>
              )}
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
                  {b.status === 'CRITICAL'
                    ? 'Kritikal'
                    : b.status === 'LOW'
                      ? 'Rendah'
                      : 'OK'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
