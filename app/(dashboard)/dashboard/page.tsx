import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Package,
  Truck,
  Monitor,
  BarChart3,
  Clock,
  ShoppingCart,
} from 'lucide-react';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient } from '@/lib/supabase/server';
import {
  getDashboardStats,
  getFleetOverview,
  getPosOverview,
  getAreaManagerDashboardContext,
  fetchKioskOverviewForBranches,
} from '@/lib/dashboard/queries';
import { getAreaManagerBranchMetrics } from '@/lib/dashboard/am-branch-metrics';
import { buildAreaManagerInsights } from '@/lib/dashboard/am-insights';
import {
  getRosterStatusForBranches,
  syncRosterReminders,
} from '@/lib/roster/queries';
import { StaffSchedulePanel } from '@/components/shifts/staff-schedule-panel';
import { BrandStatsStrip } from '@/components/brand/page-header';
import { COMPANY } from '@/lib/brand/company';
import {
  LOGISTIK_DELIVERY_TITLE,
  LOGISTIK_LABEL,
} from '@/lib/fleet/logistics-label';
import { PosOverviewPanel } from '@/components/dashboard/pos-overview-panel';
import { AreaManagerDashboard } from '@/components/dashboard/area-manager-dashboard';
import {
  DashboardHero,
  BrandProductStrip,
  QuickActionGrid,
  DashboardAlert,
} from '@/components/dashboard/dashboard-brand-ui';
import { labelFor, FLEET_VEHICLE_STATUS_LABELS } from '@/lib/ui/labels';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  ModuleLayout,
  KpiGrid,
  KpiCard,
  SectionCard,
  formatRM,
} from '@/components/shared/module-ui';

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  const supabase = await createClient();
  const scope = await resolveScopedBranches(supabase, profile);
  const isAreaManager = profile.role === 'AREA_MANAGER';

  if (isAreaManager) {
    const branchIds = scope.branchIds ?? [];
    const [stats, kioskOverview, context, branchMetrics, rosterStatuses] = await Promise.all([
      getDashboardStats(profile.organization_id, branchIds),
      fetchKioskOverviewForBranches(supabase, profile.organization_id, branchIds),
      getAreaManagerDashboardContext(
        profile.organization_id,
        profile.region_id,
        branchIds
      ),
      getAreaManagerBranchMetrics(supabase, profile.organization_id, branchIds),
      getRosterStatusForBranches(supabase, profile.organization_id, branchIds),
    ]);

    await syncRosterReminders(
      supabase,
      profile.organization_id,
      profile.id,
      rosterStatuses
    );

    const { insights, summary: insightsSummary } = buildAreaManagerInsights({
      stats,
      kioskBranches: kioskOverview.branches,
      kioskSummary: kioskOverview.summary,
      branchMetrics,
      regionName: context.regionName,
      rosterStatuses,
    });

    return (
      <AreaManagerDashboard
        stats={stats}
        kioskOverview={kioskOverview}
        branchMetrics={branchMetrics}
        insights={insights}
        insightsSummary={insightsSummary}
        context={context}
      />
    );
  }

  if (profile.role === 'STAFF') {
    const firstName = profile.full_name?.split(' ')[0] ?? 'Staf';

    return (
      <ModuleLayout>
        <DashboardHero
          variant="warm"
          eyebrow={`${COMPANY.name} · Staf Kiosk`}
          title={`Selamat bertugas, ${firstName}`}
          subtitle={`${COMPANY.taglineMs} — semak jadual syif dan maklumat harian anda di sini.`}
          showLogo
        />

        <BrandProductStrip compact />

        <SectionCard
          title="Jadual Syif Saya"
          description="Minggu semasa · diterbitkan oleh pengurus cawangan"
        >
          <StaffSchedulePanel />
        </SectionCard>

        <SectionCard title="Pautan Pantas" description="Modul yang kerap digunakan staf kiosk">
          <QuickActionGrid
            actions={[
              {
                label: 'Syif & Kehadiran',
                href: '/shifts',
                icon: Clock,
                description: 'Clock-in / clock-out',
              },
              {
                label: 'POS Kaunter',
                href: '/pos',
                icon: ShoppingCart,
                description: 'Jualan harian',
              },
            ]}
          />
        </SectionCard>
      </ModuleLayout>
    );
  }

  const [stats, posOverview, fleetOverview] = await Promise.all([
    getDashboardStats(profile.organization_id, scope.branchIds),
    getPosOverview(profile.organization_id, scope.branchIds),
    getFleetOverview(profile.organization_id),
  ]);

  const statsUnavailable = stats === null;

  return (
    <ModuleLayout>
      <DashboardHero
        variant="premium"
        eyebrow={COMPANY.systemName}
        title="Papan Pemuka Operasi"
        subtitle={`${COMPANY.name} — ${COMPANY.tagline}. ${COMPANY.taglineMs}`}
        actions={
          <Link
            href="/pos"
            className={cn(
              buttonVariants({ size: 'sm' }),
              'bg-[#E5A812] text-[#141414] shadow-md hover:bg-[#F0C030]'
            )}
          >
            <Monitor className="mr-1.5 h-4 w-4" />
            Buka POS
          </Link>
        }
      />

      <BrandStatsStrip />

      <BrandProductStrip />

      {statsUnavailable && (
        <DashboardAlert>
          Statistik papan pemuka tidak dapat dimuatkan. Semak sambungan pangkalan data atau view{' '}
          <code className="text-xs">dashboard_stats</code>.
        </DashboardAlert>
      )}

      <KpiGrid cols={4}>
        <KpiCard
          title="Jualan Hari Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_today ?? 0)}
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
          title="Tunai Tertunggak"
          value={statsUnavailable ? '—' : formatRM(stats!.outstanding_cash ?? 0)}
          icon={Banknote}
          variant="warning"
        />
      </KpiGrid>

      <KpiGrid cols={3}>
        <KpiCard
          title="Stok Rendah"
          value={statsUnavailable ? '—' : String(stats!.low_stock_count ?? 0)}
          description="Di bawah ambang minimum"
          icon={Package}
          variant="warning"
        />
        <KpiCard
          title="Stok Kritikal"
          value={statsUnavailable ? '—' : String(stats!.critical_stock_count ?? 0)}
          description="Tindakan segera diperlukan"
          icon={AlertTriangle}
          variant="danger"
        />
        <KpiCard
          title="Kelulusan Tertunda"
          value={statsUnavailable ? '—' : String(stats!.pending_approvals ?? 0)}
          description="Menunggu tindakan pengurus"
          icon={CheckCircle2}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <PosOverviewPanel overview={posOverview} />

        <SectionCard
          title={LOGISTIK_DELIVERY_TITLE}
          description={`${fleetOverview.pending_deliveries} menunggu · ${fleetOverview.in_transit} dalam perjalanan`}
          action={
            <Link href="/fleet" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
              Buka {LOGISTIK_LABEL}
            </Link>
          }
        >
          {fleetOverview.vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tiada kenderaan didaftarkan.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fleetOverview.vehicles.map((v) => (
                <Badge key={v.id} variant="outline" className="gap-1 px-3 py-1.5">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  {v.vehicle_code} · {v.vehicle_type}
                  {v.latest_status && (
                    <span className="text-muted-foreground">
                      — {labelFor(FLEET_VEHICLE_STATUS_LABELS, v.latest_status, v.latest_status)}
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Tindakan Pantas" description="Tugasan operasi harian HQ & cawangan">
        <QuickActionGrid
          actions={[
            {
              label: 'Buka Syif POS',
              href: '/pos',
              icon: Monitor,
              description: 'Kaunter jualan',
            },
            {
              label: 'Inventori',
              href: '/inventory',
              icon: Package,
              description: 'Stok kiosk & HQ',
            },
            {
              label: 'Laporan',
              href: '/reports',
              icon: BarChart3,
              description: 'Jualan & prestasi',
            },
            {
              label: 'Kelulusan',
              href: '/approvals',
              icon: CheckCircle2,
              description: 'Menunggu tindakan',
            },
          ]}
        />
      </SectionCard>
    </ModuleLayout>
  );
}
