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
 Gauge,
 Zap,
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
 DashboardSectionHeading,
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
 const quickActions = [
 {
 label: 'Jadual Staf Mingguan',
 href: '/shifts?tab=roster',
 icon: CalendarDays,
 description: 'Sediakan minggu depan',
 },
 {
 label: 'Inventori Kiosk',
 href: '/inventory',
 icon: Package,
 description: 'Stok & pemindahan',
 },
 {
 label: 'Kelulusan Tertunda',
 href: '/approvals',
 icon: CheckCircle2,
 description: 'Tindakan pengurus',
 },
 {
 label: 'Panduan & SOP',
 href: '/manual',
 icon: Sparkles,
 description: 'Rujukan Pengurus Kawasan',
 },
 ];

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

 <section className="space-y-3">
 <DashboardSectionHeading
 eyebrow="01 · Fokus kawasan"
 title="Mula dengan tindakan utama"
 description="Empat laluan kerja paling penting untuk mengawal operasi cawangan hari ini."
 icon={Zap}
 />
 <QuickActionGrid actions={quickActions} />
 </section>

 {statsUnavailable && (
 <DashboardAlert>
 Statistik kawasan tidak dapat dimuatkan. Cuba muat semula halaman.
 </DashboardAlert>)}

 <DashboardSectionHeading
 eyebrow="02 · Keutamaan"
 title="Isu yang perlu diberi tindakan"
 description="Cadangan disusun mengikut tahap kritikal merentas jualan, stok, syif dan staf."
 icon={AlertTriangle}
 />
 <AmInsightsPanel insights={insights} summary={insightsSummary} />

 <DashboardSectionHeading
 eyebrow="03 · Prestasi kawasan"
 title="KPI operasi semasa"
 description="Bandingkan jualan, stok, syif dan kehadiran sebelum menyemak setiap cawangan."
 icon={Gauge}
 />
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

 <DashboardSectionHeading
 eyebrow="04 · Prestasi cawangan"
 title="Kenal pasti lokasi yang memerlukan bantuan"
 description="Mulakan dengan cawangan berstatus kritikal, kemudian tetapkan pemilik dan tarikh tindakan."
 icon={Store}
 />
 <SectionCard
 title="Prestasi Cawangan"
 description="Jualan harian, mingguan & bulanan setiap lokasi - klik cawangan untuk inventori"
 >
 <AmBranchPerformanceTable rows={performanceRows} />
 </SectionCard>

 <AmOperationsPlanner />

 <SecondarySection
 title="Kawalan proaktif, governance & SOP kawasan"
 description="Scorecard, SLA, hubungan kerja dan rujukan lengkap untuk semakan lanjutan."
 >
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
 <OperationsWorkflowMap focus="overview" compact />
 <WorkflowSopPanel workflow={workflow} />
 </SecondarySection>
 </ModuleLayout>);
}

