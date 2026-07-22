import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
 TrendingUp,
 AlertTriangle,
 CheckCircle2,
 Banknote,
 Package,
 Factory,
 Truck,
 Monitor,
 BarChart3,
 Clock,
 ShoppingCart,
} from 'lucide-react';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
 getDashboardStats,
 getFleetOverview,
 getPosOverview,
 getAreaManagerDashboardContext,
 fetchKioskOverviewForBranches,
 hydrateDashboardStatsStockCounts,
} from '@/lib/dashboard/queries';
import { getAreaManagerBranchMetrics } from '@/lib/dashboard/am-branch-metrics';
import { buildAreaManagerInsights } from '@/lib/dashboard/am-insights';
import {
 getRosterStatusForBranches,
 syncRosterReminders,
} from '@/lib/roster/queries';
import { StaffSchedulePanel } from '@/components/shifts/staff-schedule-panel';
import { COMPANY } from '@/lib/brand/company';
import {
 LOGISTIK_DELIVERY_TITLE,
 LOGISTIK_LABEL,
} from '@/lib/fleet/logistics-label';
import { PosOverviewPanel } from '@/components/dashboard/pos-overview-panel';
import { AreaManagerDashboard } from '@/components/dashboard/area-manager-dashboard';
import {
 OwnerGroupDashboard,
 OwnerGroupOperations,
 OwnerGroupOperationsFallback,
} from '@/components/dashboard/owner-group-dashboard';
import { isOwnerDashboardRole } from '@/lib/dashboard/owner-company-structure';
import { getCompanyHrDashboard } from '@/lib/hr/company-hr';
import {
 DashboardHero,
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
 SecondarySection,
 formatRM,
} from '@/components/shared/module-ui';
import { StaffPayHrPanel } from '@/components/staff/staff-pay-hr-panel';
import { staffQuickActionsFromMetadata } from '@/lib/settings/dashboard-quick-actions';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { RoleProactiveCockpit } from '@/components/dashboard/role-proactive-cockpit';
import { OperationsWorkflowMap } from '@/components/dashboard/operations-workflow-map';
import { ManagementGovernancePanel } from '@/components/dashboard/management-governance-panel';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserRole } from '@/types/enums';

function operationQuickActions(legalEntityCode?: string | null) {
 if (legalEntityCode === 'RKJ_MFG') {
 return [
 { label: 'Production Queue', href: '/factory', icon: Package, description: 'Order & batch kilang' },
 { label: 'Bahan Mentah', href: '/factory', icon: Factory, description: 'Stock card production' },
 { label: 'Stok Kilang', href: '/factory', icon: Package, description: 'Baki & pergerakan stok' },
 { label: 'Laporan Kilang', href: '/reports', icon: BarChart3, description: 'Prestasi production' },
 ];
 }
 if (legalEntityCode === 'RKJ_DIST') {
 return [
 { label: 'HQ Distributor', href: '/warehouse', icon: Package, description: 'Stok & cross-dock' },
 { label: 'Logistik', href: '/fleet', icon: Truck, description: 'Driver, route & POD' },
 { label: 'Portal Ejen', href: '/sales-agent', icon: ShoppingCart, description: 'Ejen, order & POS' },
 { label: 'Kelulusan', href: '/approvals', icon: CheckCircle2, description: 'Tindakan distributor' },
 ];
 }
 return [
 { label: 'POS Cawangan', href: '/pos', icon: Monitor, description: 'Kaunter jualan' },
 { label: 'Inventori Kiosk', href: '/inventory', icon: Package, description: 'Stok cawangan' },
 { label: 'Syif Staf', href: '/shifts', icon: Clock, description: 'Jadual & kehadiran' },
 { label: 'Maintenance', href: '/maintenance', icon: CheckCircle2, description: 'Isu cawangan' },
 ];
}

function FleetOverviewSection({ fleetOverview }: { fleetOverview: Awaited<ReturnType<typeof getFleetOverview>> }) {
 return (
 <SectionCard
 title={LOGISTIK_DELIVERY_TITLE}
 description={`${fleetOverview.pending_deliveries} menunggu - ${fleetOverview.in_transit} dalam perjalanan`}
 action={
 <Link href="/fleet" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
 Buka {LOGISTIK_LABEL}
 </Link>
 }
 >
 {fleetOverview.vehicles.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada kenderaan didaftarkan.</p>) : (
 <div className="flex flex-wrap gap-2">
 {fleetOverview.vehicles.map((v) => (
 <Badge key={v.id} variant="outline" className="gap-1 px-3 py-1.5">
 <Truck className="h-3.5 w-3.5 text-primary" />
 {v.vehicle_code} - {v.vehicle_type}
 {v.latest_status && (
 <span className="text-muted-foreground">
 - {labelFor(FLEET_VEHICLE_STATUS_LABELS, v.latest_status, v.latest_status)}
 </span>)}
 </Badge>))}
 </div>)}
 </SectionCard>);
}

function DashboardOpsFallback() {
 return (
 <>
 <Skeleton className="h-32 rounded-lg" />
 <div className="grid gap-4 lg:grid-cols-2">
 <SectionCard title="Memuatkan POS" description="Data operasi sedang disediakan.">
 <div className="space-y-3">
 <Skeleton className="h-8 w-44" />
 <Skeleton className="h-32 w-full" />
 </div>
 </SectionCard>
 <SectionCard title="Memuatkan Logistik" description="Status penghantaran sedang disemak.">
 <div className="flex flex-wrap gap-2">
 {Array.from({ length: 8 }).map((_, index) => (
 <Skeleton key={index} className="h-8 w-28 rounded-full" />))}
 </div>
 </SectionCard>
 </div>
 </>);
}

async function DashboardOpsPanels({
 role,
 legalEntityCode,
 orgId,
 branchIds,
 stats,
}: {
 role: UserRole;
 legalEntityCode: string | null;
 orgId: string;
 branchIds: string[] | null;
 stats: Awaited<ReturnType<typeof getDashboardStats>>;
}) {
 const [posOverview, fleetOverview] = await Promise.all([
 getPosOverview(orgId, branchIds),
 getFleetOverview(orgId),
 ]);

 return (
 <>
 {(role === 'ADMIN' || role === 'OPERATION_MANAGER' || role === 'FINANCE') && (
 <ManagementGovernancePanel
 role={role}
 legalEntityCode={legalEntityCode}
 stats={stats}
 branchCount={branchIds?.length ?? COMPANY.branchCount}
 openShifts={posOverview.open_shifts}
 pendingDeliveries={fleetOverview.pending_deliveries}
 inTransitDeliveries={fleetOverview.in_transit}
 />)}

 <div className="grid gap-4 lg:grid-cols-2">
 <PosOverviewPanel overview={posOverview} />
 <FleetOverviewSection fleetOverview={fleetOverview} />
 </div>
 </>);
}

async function OwnerOperationsPanels({
 orgId,
 branchIds,
 stats,
}: {
 orgId: string;
 branchIds: string[] | null;
 stats: Awaited<ReturnType<typeof getDashboardStats>>;
}) {
 const posOverviewPromise = getPosOverview(orgId, branchIds);
 const fleetOverviewPromise = getFleetOverview(orgId);
 const service = await createServiceClient();
 const [posOverview, fleetOverview, hrData] = await Promise.all([
 posOverviewPromise,
 fleetOverviewPromise,
 getCompanyHrDashboard(service, orgId),
 ]);

 return (
 <OwnerGroupOperations
 stats={stats}
 posOverview={posOverview}
 fleetOverview={fleetOverview}
 hrData={hrData}
 />);
}

export default async function DashboardPage() {
 const profile = await getCurrentProfile();
 if (!profile) {
 redirect('/login');
 }

 const supabase = await createClient();
 const scope = await resolveScopedBranches(supabase, profile);
 const isAreaManager = profile.role === 'AREA_MANAGER';
 const legalEntityCode = profile.legal_entity?.code ?? null;

 if (isAreaManager) {
 const branchIds = scope.branchIds ?? [];
 const [statsBase, kioskOverview, context, branchMetrics, rosterStatuses] = await Promise.all([
 getDashboardStats(profile.organization_id, branchIds, { includeStockCounts: false }),
 fetchKioskOverviewForBranches(supabase, profile.organization_id, branchIds),
 getAreaManagerDashboardContext(
 profile.organization_id,
 profile.region_id,
 branchIds),
 getAreaManagerBranchMetrics(supabase, profile.organization_id, branchIds),
 getRosterStatusForBranches(supabase, profile.organization_id, branchIds),
 ]);
 const stats = statsBase
 ? hydrateDashboardStatsStockCounts(statsBase, kioskOverview)
 : null;

 await syncRosterReminders(
 supabase,
 profile.organization_id,
 profile.id,
 rosterStatuses);

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
 />);
 }

 if (profile.role === 'STAFF') {
 const firstName = profile.full_name?.split(' ')[0] ?? 'Staf';
 const quickActions = staffQuickActionsFromMetadata(profile.metadata);
 const dashMeta = profile.metadata as Record<string, unknown> | null;
 const dashLabel =
 typeof dashMeta?.dashboard_label === 'string' ? dashMeta.dashboard_label : 'Staf Kiosk';
 const workflow = getRoleWorkflow({
 role: profile.role,
 dashboardLabel: dashLabel,
 legalEntityCode,
 });
 const service = await createServiceClient();
 const { data: specialAgentAssignments } = await service.from('agent_special_staff_assignments').select('id, role_title, assignment_note, assigned_at, agent_account:sales_agent_accounts(company_name), legal_entity:legal_entities(code, legal_name, name)').eq('organization_id', profile.organization_id).eq('profile_id', profile.id).eq('status', 'ACTIVE').order('assigned_at', { ascending: false });
 const agentKhasAssignments = (specialAgentAssignments ?? []) as Array<{
 id: string;
 role_title: string;
 assignment_note: string | null;
 assigned_at: string;
 agent_account?: { company_name: string } | null;
 legal_entity?: { code: string; legal_name: string; name: string } | null;
 }>;

 return (
 <ModuleLayout>
 <DashboardHero
 variant="warm"
 eyebrow={`${COMPANY.name} - ${dashLabel}`}
 title={`Selamat bertugas, ${firstName}`}
 subtitle={`${COMPANY.taglineMs} - semak jadual syif dan maklumat harian anda di sini.`}
 showLogo
 />

 <RoleProactiveCockpit
 role={profile.role}
 workflow={workflow}
 legalEntityCode={legalEntityCode}
 branchCount={scope.branchIds?.length ?? null}
 specialAssignmentCount={agentKhasAssignments.length}
 />

 {agentKhasAssignments.length > 0 && (
 <SectionCard
 title="Tugasan Agent Khas"
 description="Peranan khas yang dipautkan oleh Pentadbir Utama untuk operasi RKJ Distributor / Manufacturing."
 >
 <div className="space-y-2">
 {agentKhasAssignments.map((assignment) => (
 <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
 <div>
 <p className="font-semibold">{assignment.role_title}</p>
 <p className="text-xs text-muted-foreground">
 {assignment.agent_account?.company_name ?? 'Ejen Khas Syarikat'} - {assignment.legal_entity?.legal_name ?? assignment.legal_entity?.name ?? 'RKJ Group'}
 </p>
 {assignment.assignment_note && (
 <p className="mt-1 text-xs text-muted-foreground">{assignment.assignment_note}</p>)}
 </div>
 <Link href="/sales-agent" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'shrink-0')}>
 Buka Portal Ejen
 </Link>
 </div>))}
 </div>
 </SectionCard>)}

 <StaffPayHrPanel compact />

 <SectionCard
 title="Jadual Syif Saya"
 description="Minggu semasa - diterbitkan oleh pengurus cawangan"
 >
 <StaffSchedulePanel />
 </SectionCard>

 <SectionCard title="Pautan Pantas" description="Modul dashboard anda">
 <QuickActionGrid
 actions={quickActions.map((a: { label: string; href: string; description: string }) => ({
 label: a.label,
 href: a.href,
 icon: a.href === '/pos' ? ShoppingCart : Clock,
 description: a.description,
 }))}
 />
 </SectionCard>

 <SecondarySection
 title="Panduan aliran kerja"
 description="SOP lengkap untuk rujukan dan latihan apabila diperlukan."
 >
 <WorkflowSopPanel workflow={workflow} />
 </SecondarySection>
 </ModuleLayout>);
 }

 const stats = await getDashboardStats(profile.organization_id, scope.branchIds);

 if (isOwnerDashboardRole(profile.role)) {
 return (
 <OwnerGroupDashboard
 profileName={profile.full_name ?? 'Owner'}
 stats={stats}
 operations={
 <Suspense fallback={<OwnerGroupOperationsFallback />}>
 <OwnerOperationsPanels
 orgId={profile.organization_id}
 branchIds={scope.branchIds}
 stats={stats}
 />
 </Suspense>
 }
 />);
 }

 const statsUnavailable = stats === null;
 const workflow = getRoleWorkflow({ role: profile.role, legalEntityCode });
 const quickActions = profile.role === 'OPERATION_MANAGER'
 ? operationQuickActions(legalEntityCode)
 : [
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
 ];

 return (
 <ModuleLayout>
 <DashboardHero
 variant="premium"
 eyebrow={workflow.companyScope}
 title={workflow.label}
 subtitle={workflow.primaryObjective}
 actions={
 <Link
 href={workflow.steps[0]?.href ?? '/dashboard'}
 className={cn(
 buttonVariants({ size: 'sm' }),
 'bg-[#E5A812] text-[#141414] shadow-md hover:bg-[#F0C030]')}
 >
 <Monitor className="mr-1.5 h-4 w-4" />
 Buka Tugasan
 </Link>
 }
 />

 {statsUnavailable && (
 <DashboardAlert>
 Statistik papan pemuka tidak dapat dimuatkan. Semak sambungan pangkalan data atau view{' '}
 <code className="text-xs">dashboard_stats</code>.
 </DashboardAlert>)}

 <KpiGrid cols={4}>
 <KpiCard
 title="Jualan Hari Ini"
 value={statsUnavailable ? '-' : formatRM(stats!.sales_today ?? 0)}
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
 title="Tunai Tertunggak"
 value={statsUnavailable ? '-' : formatRM(stats!.outstanding_cash ?? 0)}
 icon={Banknote}
 variant="warning"
 />
 </KpiGrid>

 <KpiGrid cols={3}>
 <KpiCard
 title="Stok Rendah"
 value={statsUnavailable ? '-' : String(stats!.low_stock_count ?? 0)}
 description="Di bawah ambang minimum"
 icon={Package}
 variant="warning"
 />
 <KpiCard
 title="Stok Kritikal"
 value={statsUnavailable ? '-' : String(stats!.critical_stock_count ?? 0)}
 description="Tindakan segera diperlukan"
 icon={AlertTriangle}
 variant="danger"
 />
 <KpiCard
 title="Kelulusan Tertunda"
 value={statsUnavailable ? '-' : String(stats!.pending_approvals ?? 0)}
 description="Menunggu tindakan pengurus"
 icon={CheckCircle2}
 />
 </KpiGrid>

 <RoleProactiveCockpit
 role={profile.role}
 workflow={workflow}
 legalEntityCode={legalEntityCode}
 stats={stats}
 branchCount={scope.branchIds?.length ?? null}
 />

 <Suspense fallback={<DashboardOpsFallback />}>
 <DashboardOpsPanels
 role={profile.role}
 legalEntityCode={legalEntityCode}
 orgId={profile.organization_id}
 branchIds={scope.branchIds}
 stats={stats}
 />
 </Suspense>

 <SectionCard title="Tindakan Pantas" description="Tugasan operasi harian HQ & cawangan">
 <QuickActionGrid actions={quickActions} />
 </SectionCard>

 <SecondarySection
 title="Peta operasi & SOP"
 description="Aliran kerja terperinci untuk rujukan dan latihan."
 >
 <OperationsWorkflowMap focus="overview" compact />
 <WorkflowSopPanel workflow={workflow} />
 </SecondarySection>
 </ModuleLayout>);
}







