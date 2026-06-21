'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Package, Truck } from 'lucide-react';
import { fetchKioskOverview } from '@/lib/inventory/api';
import type { KioskOverviewBranch, KioskOverviewSummary } from '@/lib/inventory/types';
import { HQ_ROTI_ITEM_CODES } from '@/lib/stock/catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface KioskOverviewPanelProps {
  branchId?: string;
  onSelectBranch: (branchId: string, locationId: string) => void;
}

function statusBadge(status: string) {
  if (status === 'CRITICAL') {
    return <Badge variant="destructive">Kritikal</Badge>;
  }
  if (status === 'LOW') {
    return <Badge variant="secondary">Rendah</Badge>;
  }
  return (
    <Badge variant="outline" className="border-emerald-300 text-emerald-800">
      OK
    </Badge>
  );
}

export function KioskOverviewPanel({ branchId, onSelectBranch }: KioskOverviewPanelProps) {
  const [branches, setBranches] = useState<KioskOverviewBranch[]>([]);
  const [summary, setSummary] = useState<KioskOverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKioskOverview(branchId);
      setBranches(data.branches);
      setSummary(data.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan ringkasan cawangan');
      setBranches([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!branches.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Tiada kiosk dalam skop anda. Pilih cawangan atau hubungi HQ.
      </p>
    );
  }

  const rotiLabels: Record<string, string> = {
    'ST-PLANTA': 'Kaya',
    'ST-KELAPA': 'Kelapa',
    'ST-KACANG': 'Kacang',
    'ST-BENGGALI': 'Benggali',
  };

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Cawangan</p>
            <p className="text-2xl font-bold">{summary.total}</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Stok rendah</p>
            <p className="text-2xl font-bold text-amber-700">{summary.low}</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Kritikal</p>
            <p className="text-2xl font-bold text-destructive">{summary.critical}</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Menunggu terima</p>
            <p className="text-2xl font-bold text-violet-700">{summary.pending}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2.5 font-semibold">Cawangan</th>
              {HQ_ROTI_ITEM_CODES.map((code) => (
                <th key={code} className="px-3 py-2.5 font-semibold">
                  {rotiLabels[code]}
                </th>
              ))}
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr
                key={b.location_id}
                className={cn(
                  'border-b last:border-0 hover:bg-muted/20',
                  b.pending_transfers > 0 && 'bg-violet-50/50'
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{b.branch_code}</p>
                      <p className="text-xs text-muted-foreground">{b.branch_name}</p>
                    </div>
                  </div>
                  {b.pending_transfers > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-violet-700">
                      <Truck className="h-3 w-3" />
                      {b.pending_transfers} pindahan menunggu terima
                    </p>
                  )}
                </td>
                {HQ_ROTI_ITEM_CODES.map((code) => {
                  const cell = b.roti[code];
                  return (
                    <td key={code} className="px-3 py-2.5 tabular-nums">
                      <span
                        className={cn(
                          cell?.status === 'CRITICAL' && 'font-semibold text-destructive',
                          cell?.status === 'LOW' && 'font-medium text-amber-800'
                        )}
                      >
                        {cell?.display ?? '—'}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5">{statusBadge(b.worst_status)}</td>
                <td className="px-3 py-2.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => onSelectBranch(b.branch_id, b.location_id)}
                  >
                    <Package className="h-3.5 w-3.5" />
                    Buka
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
