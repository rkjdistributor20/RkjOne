import Link from 'next/link';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Package,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import type { KioskBranchOverviewRow, KioskOverviewSummary } from '@/lib/inventory/kiosk-overview-data';
import type { BranchMetricsRow } from '@/lib/dashboard/am-branch-metrics';
import type { AmInsight, AmInsightsSummary } from '@/lib/dashboard/am-insights';
import type { AreaManagerContext } from '@/lib/dashboard/queries';
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
import { AmInsightsPanel } from '@/components/dashboard/am-insights-panel';
import { AmBranchPerformanceTable } from '@/components/dashboard/am-branch-performance-table';

type AreaManagerDashboardProps = {
  stats: DashboardStats | null;
  kioskOverview: {
    branches: KioskBranchOverviewRow[];
    summary: KioskOverviewSummary;
  };
  branchMetrics: BranchMetricsRow[];
  insights: AmInsight[];
  insightsSummary: AmInsightsSummary;
  context: AreaManagerContext;
};

function mergePerformanceRows(
  branchMetrics: BranchMetricsRow[],
  kioskBranches: KioskBranchOverviewRow[]
) {
  const kioskMap = new Map(kioskBranches.map((k) => [k.branch_id, k]));

  return branchMetrics.map((m) => {
    const kiosk = kioskMap.get(m.branch_id);
    return {
      ...m,
      worst_status: kiosk?.worst_status ?? 'OK',
      has_location: kiosk?.has_location ?? false,
      pending_transfers: kiosk?.pending_transfers ?? 0,
    };
  });
}

export function AreaManagerDashboard({
  stats,
  kioskOverview,
  branchMetrics,
  insights,
  insightsSummary,
  context,
}: AreaManagerDashboardProps) {
  const statsUnavailable = stats === null;
  const performanceRows = mergePerformanceRows(branchMetrics, kioskOverview.branches);

  const regionLabel = context.regionName
    ? `Kawasan ${context.regionName}`
    : 'Kawasan anda';

  const totalStaff = branchMetrics.reduce((n, b) => n + b.staff_count, 0);
  const totalClockedIn = branchMetrics.reduce((n, b) => n + b.staff_clocked_in_today, 0);
  const openShifts = branchMetrics.filter((b) => b.shift_open).length;

  const today = new Date().toLocaleDateString('ms-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <ModuleLayout>
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-800 to-violet-950 px-6 py-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-amber-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30">
                {regionLabel}
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/80">
                {context.branchCount} cawangan
              </Badge>
              {insightsSummary.critical > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {insightsSummary.critical} kritikal
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Papan Pemuka Pengurus Kawasan
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/70">
              Rumusan jualan harian, mingguan & bulanan · AI proactive untuk staf & cawangan
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-white/50">
              <CalendarDays className="h-3.5 w-3.5" />
              {today}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/inventory"
              className={cn(
                buttonVariants({ size: 'sm' }),
                'bg-white text-slate-900 hover:bg-white/90'
              )}
            >
              <Package className="mr-1.5 h-4 w-4" />
              Inventori Kawasan
            </Link>
            <Link
              href="/approvals"
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'border-white/30 bg-transparent text-white hover:bg-white/10'
              )}
            >
              Kelulusan
            </Link>
          </div>
        </div>
      </div>

      {statsUnavailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Statistik kawasan tidak dapat dimuatkan. Cuba muat semula halaman.
        </div>
      )}

      <AmInsightsPanel insights={insights} summary={insightsSummary} />

      <KpiGrid cols={4}>
        <KpiCard
          title="Jualan Hari Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_today ?? 0)}
          description={`${context.branchCount} cawangan`}
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
        <KpiCard
          title="Kelulusan Tertunda"
          value={statsUnavailable ? '—' : String(stats!.pending_approvals ?? 0)}
          description="Dalam kawasan"
          icon={CheckCircle2}
          variant={(stats?.pending_approvals ?? 0) > 0 ? 'warning' : 'default'}
        />
      </KpiGrid>

      <KpiGrid cols={4}>
        <KpiCard
          title="Stok Kritikal"
          value={String(kioskOverview.summary.critical)}
          description={`${kioskOverview.summary.critical_item_count} item`}
          icon={AlertTriangle}
          variant="danger"
        />
        <KpiCard
          title="Stok Rendah"
          value={String(kioskOverview.summary.low)}
          description={`${kioskOverview.summary.low_item_count} item`}
          icon={Package}
          variant="warning"
        />
        <KpiCard
          title="Syif Terbuka"
          value={`${openShifts}/${context.branchCount}`}
          description="Cawangan aktif POS"
          icon={Store}
        />
        <KpiCard
          title="Staf Hadir"
          value={`${totalClockedIn}/${totalStaff}`}
          description="Clock-in hari ini"
          icon={Users}
          variant={totalStaff > 0 && totalClockedIn === 0 ? 'danger' : 'default'}
        />
      </KpiGrid>

      <SectionCard
        title="Prestasi Cawangan"
        description="Jualan harian, mingguan & bulanan setiap lokasi — klik cawangan untuk inventori"
      >
        <AmBranchPerformanceTable rows={performanceRows} />
      </SectionCard>

      <SectionCard
        title="Tindakan Pantas"
        description="Urus kiosk, staf, dan kelulusan dalam kawasan sahaja"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Jadual Staf Mingguan', href: '/shifts?tab=roster', icon: CalendarDays },
            { label: 'Inventori Kiosk', href: '/inventory', icon: Package },
            { label: 'Syif & Kehadiran', href: '/shifts', icon: Store },
            { label: 'Kelulusan Tertunda', href: '/approvals', icon: CheckCircle2 },
            { label: 'Laporan Jualan', href: '/reports', icon: Sparkles },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-muted"
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
