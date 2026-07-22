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
import { COMPANY } from '@/lib/brand/company';
import { getLegalEntityByCode, AREA_MANAGER_EMPLOYER_CODE } from '@/lib/brand/legal-entities';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
 ModuleLayout,
 KpiGrid,
 KpiCard,
 SectionCard,
 SecondarySection,
 formatRM,
} from '@/components/shared/module-ui';
import {
 DashboardHero,
 HeroBadge,
 QuickActionGrid,
 DashboardAlert,
} from '@/components/dashboard/dashboard-brand-ui';
import { AmInsightsPanel } from '@/components/dashboard/am-insights-panel';
import { AmBranchPerformanceTable } from '@/components/dashboard/am-branch-performance-table';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { OperationsWorkflowMap } from '@/components/dashboard/operations-workflow-map';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import { RoleProactiveCockpit } from '@/components/dashboard/role-proactive-cockpit';
import { AmOperationsPlanner } from '@/components/dashboard/am-operations-planner';
import { ManagementGovernancePanel } from '@/components/dashboard/management-governance-panel';

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
 kioskBranches: KioskBranchOverviewRow[]) {
 const kioskMap = new Map(kioskBranches.map((k) => [k.branch_id, k]));

 return branchMetrics.map((m) => {
 const kiosk = kioskMap.get(m.branch_id);
 return {...m,
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

 const amEmployer = getLegalEntityByCode(AREA_MANAGER_EMPLOYER_CODE);
 const workflow = getRoleWorkflow({ role: 'AREA_MANAGER', legalEntityCode: AREA_MANAGER_EMPLOYER_CODE });

 return (
 <ModuleLayout>
 <DashboardHero
 variant="premium"
 eyebrow={`${amEmployer?.legalName ?? 'RKJ Distributor Sdn Bhd'} - Pengurus Kawasan`}
 title="Papan Pemuka Kawasan"
 subtitle={`Mengurus staf & cawangan ${COMPANY.name} - ${context.branchCount} cawangan - AI proactive untuk operasi kiosk`}
 badges={
 <>
 <HeroBadge>{regionLabel}</HeroBadge>
 <HeroBadge tone="outline">{context.branchCount} cawangan</HeroBadge>
 {insightsSummary.critical > 0 && (
 <HeroBadge tone="danger">
 <span className="inline-flex items-center gap-1">
 <AlertTriangle className="h-3 w-3" />
 {insightsSummary.critical} kritikal
 </span>
 </HeroBadge>)}
 </>
 }
 actions={
 <>
 <Link
 href="/inventory"
 className={cn(
 buttonVariants({ size: 'sm' }),
 'bg-[#E5A812] text-[#141414] shadow-md hover:bg-[#F0C030]')}
 >
 <Package className="mr-1.5 h-4 w-4" />
 Inventori Kawasan
 </Link>
 <Link
 href="/approvals"
 className={cn(
 buttonVariants({ size: 'sm', variant: 'outline' }),
 'border-white/30 bg-transparent text-white hover:bg-white/10')}
 >
 Kelulusan
 </Link>
 </>
 }
 />

 {statsUnavailable && (
 <DashboardAlert>
 Statistik kawasan tidak dapat dimuatkan. Cuba muat semula halaman.
 </DashboardAlert>)}

 <AmInsightsPanel insights={insights} summary={insightsSummary} />

 <KpiGrid cols={4}>
 <KpiCard
 title="Jualan Hari Ini"
 value={statsUnavailable ? '-' : formatRM(stats!.sales_today ?? 0)}
 description={`${context.branchCount} cawangan`}
 icon={TrendingUp}
 />
 <KpiCard
 title="Jualan Minggu Ini"
 value={statsUnavailable ? '-' : formatRM(stats!.sales_this_week ?? 0)}
 icon={TrendingUp}
 />
 <KpiCard
 title="Jualan Bulan Ini"
 value={statsUnavailable ? '-' : formatRM(stats!.sales_this_month ?? 0)}
 icon={TrendingUp}
 />
 <KpiCard
 title="Kelulusan Tertunda"
 value={statsUnavailable ? '-' : String(stats!.pending_approvals ?? 0)}
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

 <RoleProactiveCockpit
 role="AREA_MANAGER"
 workflow={workflow}
 legalEntityCode={AREA_MANAGER_EMPLOYER_CODE}
 stats={stats}
 branchCount={context.branchCount}
 />

 <ManagementGovernancePanel
 role="AREA_MANAGER"
 legalEntityCode={AREA_MANAGER_EMPLOYER_CODE}
 stats={stats}
 branchCount={context.branchCount}
 openShifts={openShifts}
 totalStaff={totalStaff}
 staffClockedIn={totalClockedIn}
 criticalStock={kioskOverview.summary.critical}
 lowStock={kioskOverview.summary.low}
 />

 <AmOperationsPlanner />

 <SectionCard
 title="Prestasi Cawangan"
 description="Jualan harian, mingguan & bulanan setiap lokasi - klik cawangan untuk inventori"
 >
 <AmBranchPerformanceTable rows={performanceRows} />
 </SectionCard>

 <SectionCard
 title="Tindakan Pantas"
 description="Urus kiosk, staf, dan kelulusan dalam kawasan sahaja"
 >
 <QuickActionGrid
 actions={[
 {
 label: 'Jadual Staf Mingguan',
 href: '/shifts?tab=roster',
 icon: CalendarDays,
 description: 'Sediakan minggu depan',
 },
 {
 label: 'Spring Cleaning Bulanan',
 href: '#am-operations-planner',
 icon: Sparkles,
 description: 'Jadual cawangan',
 },
 {
 label: 'Meeting Highway',
 href: '/dashboard#am-operations-planner',
 icon: CalendarDays,
 description: 'Pilih banyak cawangan',
 },
 {
 label: 'Inventori Kiosk',
 href: '/inventory',
 icon: Package,
 description: 'Stok & pemindahan',
 },
 {
 label: 'Syif & Kehadiran',
 href: '/shifts',
 icon: Store,
 description: 'Clock-in staf',
 },
 {
 label: 'Kelulusan Tertunda',
 href: '/approvals',
 icon: CheckCircle2,
 description: 'Tindakan pengurus',
 },
 {
 label: 'Laporan Jualan',
 href: '/reports',
 icon: Sparkles,
 description: 'Analisis kawasan',
 },
 ]}
 />
 </SectionCard>

 <SecondarySection
 title="Peta operasi & SOP kawasan"
 description="Rujukan langkah kerja lengkap untuk semakan dan latihan."
 >
 <OperationsWorkflowMap focus="overview" compact />
 <WorkflowSopPanel workflow={workflow} />
 </SecondarySection>
 </ModuleLayout>);
}

