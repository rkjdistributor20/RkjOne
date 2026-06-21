'use client';

import { formatRM } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DailySummaryPanel() {
  const summary = usePosStore((s) => s.dailySummary);
  const shift = usePosStore((s) => s.shift);

  if (!summary && !shift) {
    return (
      <p className="text-sm text-muted-foreground">Tiada data ringkasan</p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {shift && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Syif Semasa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tunai</span>
              <span>{formatRM(Number(shift.total_cash))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">QR</span>
              <span>{formatRM(Number(shift.total_qr))}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Jumlah</span>
              <span>{formatRM(Number(shift.total_sales))}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Hari Ini — {summary.summary_date}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jualan</span>
              <span>{formatRM(Number(summary.total_sales))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaksi</span>
              <span>{summary.transaction_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batal / Bayar Balik</span>
              <span>
                {summary.void_count} / {summary.refund_count}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
