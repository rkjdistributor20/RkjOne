import Link from 'next/link';
import { Monitor, Store, Receipt } from 'lucide-react';
import type { PosOverview } from '@/lib/dashboard/queries';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { labelFor, PAYMENT_METHOD_LABELS } from '@/lib/ui/labels';

function formatRM(amount: number) {
  return `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PosOverviewPanel({ overview }: { overview: PosOverview }) {
  const hasActivity =
    overview.transactions_today > 0 || overview.open_shifts > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            POS Hari Ini
          </CardTitle>
          <CardDescription>
            Jualan langsung dari kaunter tunai — disegerakkan ke papan pemuka
          </CardDescription>
        </div>
        <Link
          href="/pos"
          className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
        >
          Buka POS
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Badge variant="secondary" className="gap-1 px-3 py-1">
            <Receipt className="h-3.5 w-3.5" />
            {overview.transactions_today} transaksi
          </Badge>
          <Badge
            variant={overview.open_shifts > 0 ? 'default' : 'outline'}
            className="gap-1 px-3 py-1"
          >
            <Store className="h-3.5 w-3.5" />
            {overview.open_shifts} syif terbuka
          </Badge>
        </div>

        {overview.branches.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Cawangan</th>
                  <th className="px-3 py-2 font-medium text-right">Jualan</th>
                  <th className="px-3 py-2 font-medium text-right">Bil.</th>
                  <th className="px-3 py-2 font-medium">Syif</th>
                </tr>
              </thead>
              <tbody>
                {overview.branches.map((b) => (
                  <tr key={b.branch_id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{b.branch_name}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({b.branch_code})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatRM(b.total_sales)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {b.transaction_count}
                    </td>
                    <td className="px-3 py-2">
                      {b.shift_open ? (
                        <Badge variant="default" className="text-xs">
                          Terbuka
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {overview.recent_transactions.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Transaksi Terkini
            </p>
            <ul className="space-y-2">
              {overview.recent_transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{tx.transaction_number}</span>
                    {tx.branch_name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {tx.branch_name}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatTime(tx.created_at)} · {labelFor(PAYMENT_METHOD_LABELS, tx.payment_method)}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatRM(tx.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          !hasActivity && (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Tiada jualan hari ini. Buka syif di{' '}
              <Link href="/pos" className="font-medium text-primary underline-offset-2 hover:underline">
                Kaunter POS
              </Link>{' '}
              untuk mula merekod transaksi.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
