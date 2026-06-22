'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, Store } from 'lucide-react';
import type { BranchMetricsRow } from '@/lib/dashboard/am-branch-metrics';
import type { KioskBranchOverviewRow } from '@/lib/inventory/kiosk-overview-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRM } from '@/components/shared/module-ui';

type Period = 'day' | 'week' | 'month';

type Row = BranchMetricsRow & {
  worst_status: KioskBranchOverviewRow['worst_status'];
  has_location: boolean;
  pending_transfers: number;
};

interface AmBranchPerformanceTableProps {
  rows: Row[];
}

function salesForPeriod(row: Row, period: Period): number {
  if (period === 'day') return row.sales_today;
  if (period === 'week') return row.sales_week;
  return row.sales_month;
}

function txnForPeriod(row: Row, period: Period): number {
  if (period === 'day') return row.txn_today;
  if (period === 'week') return row.txn_week;
  return row.txn_month;
}

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Harian',
  week: 'Mingguan',
  month: 'Bulanan',
};

function stockBadge(status: KioskBranchOverviewRow['worst_status']) {
  if (status === 'CRITICAL') return <Badge variant="destructive">Kritikal</Badge>;
  if (status === 'LOW') return <Badge variant="secondary">Rendah</Badge>;
  return (
    <Badge variant="outline" className="border-emerald-300 text-emerald-800">
      OK
    </Badge>
  );
}

export function AmBranchPerformanceTable({ rows }: AmBranchPerformanceTableProps) {
  const [period, setPeriod] = useState<Period>('day');
  const [sortDesc, setSortDesc] = useState(true);

  const maxSales = useMemo(() => {
    return Math.max(...rows.map((r) => salesForPeriod(r, period)), 1);
  }, [rows, period]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const diff = salesForPeriod(b, period) - salesForPeriod(a, period);
      return sortDesc ? diff : -diff;
    });
  }, [rows, period, sortDesc]);

  const totalSales = sorted.reduce((n, r) => n + salesForPeriod(r, period), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                period === p
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Jumlah {PERIOD_LABELS[period].toLowerCase()}:{' '}
            <strong className="text-foreground">{formatRM(totalSales)}</strong>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setSortDesc((v) => !v)}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Jualan
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Cawangan</th>
                <th className="px-4 py-3 font-semibold text-right">Jualan</th>
                <th className="px-4 py-3 font-semibold text-right">Transaksi</th>
                <th className="px-4 py-3 font-semibold">Prestasi</th>
                <th className="px-4 py-3 font-semibold">Stok</th>
                <th className="px-4 py-3 font-semibold">Syif / Staf</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const sales = salesForPeriod(b, period);
                const pct = Math.round((sales / maxSales) * 100);
                return (
                  <tr key={b.branch_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        href="/inventory"
                        className="group flex items-start gap-2 font-medium hover:text-primary"
                      >
                        <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <span>
                          {b.branch_code}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {b.branch_name}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatRM(sales)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {txnForPeriod(b, period)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 max-w-[100px] overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {b.has_location ? stockBadge(b.worst_status) : (
                        <span className="text-xs text-amber-700">Tiada kiosk</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {b.shift_open ? (
                          <Badge variant="default" className="w-fit">
                            Syif buka
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">Syif tutup</span>
                        )}
                        <span className="text-muted-foreground">
                          {b.staff_clocked_in_today}/{b.staff_count} staf hadir
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
