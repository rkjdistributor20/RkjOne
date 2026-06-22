import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Package,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import type { KioskBranchOverviewRow, KioskOverviewSummary } from '@/lib/inventory/kiosk-overview-data';
import type { PosOverview, AreaManagerContext } from '@/lib/dashboard/queries';
import { PageHeader } from '@/components/brand/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ModuleLayout,
  KpiGrid,
  KpiCard,
  SectionCard,
  formatRM,
} from '@/components/shared/module-ui';

type AreaManagerDashboardProps = {
  stats: DashboardStats | null;
  posOverview: PosOverview;
  kioskOverview: {
    branches: KioskBranchOverviewRow[];
    summary: KioskOverviewSummary;
  };
  context: AreaManagerContext;
};

function stockStatusBadge(status: KioskBranchOverviewRow['worst_status']) {
  if (status === 'CRITICAL') {
    return (
      <Badge variant="destructive" className="text-xs">
        Kritikal
      </Badge>
    );
  }
  if (status === 'LOW') {
    return (
      <Badge variant="secondary" className="text-xs">
        Rendah
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-300 text-xs text-emerald-800">
      OK
    </Badge>
  );
}

function mergeBranchRows(
  kioskBranches: KioskBranchOverviewRow[],
  posOverview: PosOverview
) {
  const salesMap = new Map(
    posOverview.branches.map((b) => [b.branch_id, b])
  );

  return kioskBranches.map((kiosk) => {
    const sales = salesMap.get(kiosk.branch_id);
    return {
      ...kiosk,
      total_sales: sales?.total_sales ?? 0,
      transaction_count: sales?.transaction_count ?? 0,
      shift_open: sales?.shift_open ?? false,
    };
  });
}

export function AreaManagerDashboard({
  stats,
  posOverview,
  kioskOverview,
  context,
}: AreaManagerDashboardProps) {
  const statsUnavailable = stats === null;
  const branchRows = mergeBranchRows(kioskOverview.branches, posOverview);
  const attentionBranches = branchRows.filter(
    (b) =>
      b.worst_status !== 'OK' ||
      b.pending_transfers > 0 ||
      !b.has_location
  );

  const regionLabel = context.regionName
    ? `Kawasan ${context.regionName}`
    : 'Kawasan anda';

  return (
    <ModuleLayout>
      <PageHeader
        badge={regionLabel}
        title="Papan Pemuka Kawasan"
        description={`${context.branchCount} cawangan · jualan, stok kiosk, syif, dan kelulusan dalam skop ${regionLabel.toLowerCase()} sahaja`}
      />

      {statsUnavailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Statistik kawasan tidak dapat dimuatkan. Cuba muat semula halaman.
        </div>
      )}

      <KpiGrid cols={3}>
        <KpiCard
          title="Jualan Hari Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_today ?? 0)}
          description="Semua cawangan kawasan"
          icon={TrendingUp}
        />
        <KpiCard
          title="Jualan Minggu Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_this_week ?? 0)}
          icon={TrendingUp}
        />
        <KpiCard
          title="Jualan Bulan Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_this_month ?? 0)}
          icon={TrendingUp}
        />
      </KpiGrid>

      <KpiGrid cols={3}>
        <KpiCard
          title="Cawangan Stok Rendah"
          value={String(kioskOverview.summary.low)}
          description={`${kioskOverview.summary.low_item_count} item perlu perhatian`}
          icon={Package}
          variant="warning"
        />
        <KpiCard
          title="Cawangan Stok Kritikal"
          value={String(kioskOverview.summary.critical)}
          description={`${kioskOverview.summary.critical_item_count} item kritikal`}
          icon={AlertTriangle}
          variant="danger"
        />
        <KpiCard
          title="Kelulusan Tertunda"
          value={statsUnavailable ? '—' : String(stats!.pending_approvals ?? 0)}
          description="Dalam kawasan anda"
          icon={CheckCircle2}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Cawangan Kawasan"
          description="Jualan hari ini dan status stok roti kiosk"
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Cawangan</th>
                  <th className="px-3 py-2 font-medium text-right">Jualan</th>
                  <th className="px-3 py-2 font-medium text-right">Transaksi</th>
                  <th className="px-3 py-2 font-medium">Stok</th>
                  <th className="px-3 py-2 font-medium">Syif</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((b) => (
                  <tr key={b.branch_id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href="/inventory/kawasan"
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {b.branch_code} — {b.branch_name}
                      </Link>
                      {!b.has_location && (
                        <p className="text-xs text-amber-700">Tiada kiosk</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatRM(b.total_sales)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {b.transaction_count}
                    </td>
                    <td className="px-3 py-2">
                      {b.has_location ? (
                        stockStatusBadge(b.worst_status)
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {b.shift_open ? (
                        <Badge variant="default" className="text-xs">
                          Terbuka
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Tutup</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {kioskOverview.summary.pending > 0 && (
            <p className="mt-3 text-sm text-violet-800">
              {kioskOverview.summary.pending} pindahan HQ dalam perjalanan ke kiosk kawasan
              anda — urus di{' '}
              <Link href="/inventory/kawasan" className="font-medium underline">
                Inventori
              </Link>
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Perlu Tindakan"
          description="Cawangan yang memerlukan perhatian segera"
        >
          {attentionBranches.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Semua cawangan dalam kawasan anda OK — tiada stok rendah atau kritikal.
            </p>
          ) : (
            <ul className="space-y-2">
              {attentionBranches.map((b) => (
                <li
                  key={b.branch_id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {b.branch_code} — {b.branch_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {!b.has_location && 'Tiada lokasi kiosk · '}
                      {b.worst_status === 'CRITICAL' &&
                        `${b.critical_count} item kritikal · `}
                      {b.worst_status === 'LOW' && `${b.low_count} item rendah · `}
                      {b.pending_transfers > 0 &&
                        `${b.pending_transfers} pindahan dalam perjalanan`}
                      {b.has_location &&
                        b.worst_status === 'OK' &&
                        b.pending_transfers === 0 &&
                        'Perlu semakan'}
                    </p>
                  </div>
                  <Link
                    href="/inventory/kawasan"
                    className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'shrink-0 gap-1')}
                  >
                    Inventori
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Tindakan Pantas"
        description="Urus kiosk, staf, dan kelulusan dalam kawasan sahaja"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Inventori Kiosk', href: '/inventory/kawasan', icon: Package },
            { label: 'Syif & Kehadiran', href: '/shifts', icon: Store },
            { label: 'Kelulusan Tertunda', href: '/approvals', icon: CheckCircle2 },
            { label: 'Staf Kawasan', href: '/settings?tab=staff', icon: Users },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <action.icon className="h-4 w-4 text-primary" />
              {action.label}
            </Link>
          ))}
        </div>
      </SectionCard>
    </ModuleLayout>
  );
}
