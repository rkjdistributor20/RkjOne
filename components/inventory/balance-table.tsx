'use client';

import type { InventoryBalanceRow } from '@/lib/inventory/types';
import { groupBalancesByCategory } from '@/lib/inventory/balance-utils';
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
import { cn } from '@/lib/utils';

interface BalanceTableProps {
  balances: InventoryBalanceRow[];
  showPackConversion?: boolean;
  groupByCategory?: boolean;
}

function statusBadge(status: InventoryBalanceRow['status']) {
  return (
    <Badge
      variant={
        status === 'CRITICAL' ? 'destructive' : status === 'LOW' ? 'secondary' : 'outline'
      }
      className={cn(status === 'OK' && 'border-emerald-300 text-emerald-800')}
    >
      {status === 'CRITICAL' ? 'Kritikal' : status === 'LOW' ? 'Rendah' : 'OK'}
    </Badge>
  );
}

function BalanceRows({
  balances,
  showPackConversion,
}: {
  balances: InventoryBalanceRow[];
  showPackConversion?: boolean;
}) {
  return (
    <>
      {balances.map((b) => (
        <TableRow key={b.id}>
          <TableCell className="font-medium">{b.stock_item.name}</TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">
            {b.stock_item.item_code}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
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
          <TableCell>{statusBadge(b.status)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function BalanceTable({
  balances,
  showPackConversion = false,
  groupByCategory = true,
}: BalanceTableProps) {
  if (!balances.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Tiada stok di lokasi ini. Guna tab Terima untuk tambah stok.
      </p>
    );
  }

  const groups = groupByCategory ? groupBalancesByCategory(balances) : null;

  if (groups && groups.length > 1) {
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.sectionId} className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2">
              <p className="text-sm font-semibold">{group.title}</p>
              <p className="text-xs text-muted-foreground">
                {group.items.filter((i) => i.status !== 'OK').length > 0
                  ? `${group.items.filter((i) => i.status === 'CRITICAL').length} kritikal · ${group.items.filter((i) => i.status === 'LOW').length} rendah`
                  : 'Semua item OK'}
              </p>
            </div>
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
                <BalanceRows balances={group.items} showPackConversion={showPackConversion} />
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
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
          <BalanceRows balances={balances} showPackConversion={showPackConversion} />
        </TableBody>
      </Table>
    </div>
  );
}
