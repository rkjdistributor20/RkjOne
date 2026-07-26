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
 ClipboardList,
 Gauge,
 Zap,
 UserRound,
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
 DashboardSectionHeading,
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
import type { RoleWorkflow } from '@/lib/dashboard/role-workflows';
import { isDashboardRouteAllowed } from '@/lib/auth/route-access';

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

const DASHBOARD_ACTION_ICONS = {
 '/admin': UserRound,
 '/approvals': CheckCircle2,
 '/bookings': Clock,
 '/factory': Factory,
 '/finance': Banknote,
 '/fleet': Truck,
 '/hr': UserRound,
 '/inventory': Package,
 '/maintenance': AlertTriangle,
 '/manual': ClipboardList,
 '/pos': Monitor,
 '/reports': BarChart3,
 '/sales-agent': ShoppingCart,
 '/settings': UserRound,
 '/shifts': Clock,
 '/warehouse': Package,
} as const;

function dashboardPath(href: string) {
 return href.split(/[?#]/, 1)[0] || '/dashboard';
}

function workflowQuickActions({
 workflow,
 role,
 legalEntityCode,
}: {
 workflow: RoleWorkflow;
 role: UserRole;
 legalEntityCode?: string | null;
}) {
 if (role === 'OPERATION_MANAGER') {
 return operationQuickActions(legalEntityCode);
 }

 const seen = new Set<string>();
 const actions = workflow.steps.flatMap((step) => {
 const path = dashboardPath(step.href);
 if (
 path === '/dashboard' ||
 seen.has(path) ||
 !isDashboardRouteAllowed(path, { role, legalEntityCode })
 ) return [];
 seen.add(path);
 return [{
 label: step.title,
 href: step.href,
 icon: DASHBOARD_ACTION_ICONS[path as keyof typeof DASHBOARD_ACTION_ICONS] ?? ClipboardList,
 description: step.module,
 }];
 });

 if (!seen.has('/manual')) {
 actions.push({
 label: 'Panduan & SOP',
 href: '/manual',
 icon: ClipboardList,
 description: 'Rujukan kerja peranan anda',
 });
 }

 return actions.slice(0, 4);
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
 <div className="grid gap-4 lg:grid-cols-2">
 <SectionCard title="Memuatkan status operasi" description="Data langsung mengikut peranan sedang disediakan.">
 <div className="space-y-3">
 <Skeleton className="h-8 w-44" />
 <Skeleton className="h-32 w-full" />
 </div>
 </SectionCard>
 <SectionCard title="Memuatkan kawalan" description="Pengecualian dan bukti kerja sedang disemak.">
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
 const showPos = role === 'ADMIN' ||
 role === 'FINANCE' ||
 (role === 'OPERATION_MANAGER' && legalEntityCode === 'RKJ');
 const showFleet = role === 'ADMIN' ||
 role === 'DRIVER' ||
 (role === 'OPERATION_MANAGER' && legalEntityCode === 'RKJ_DIST');
 const [posOverview, fleetOverview] = await Promise.all([
 showPos ? getPosOverview(orgId, branchIds) : Promise.resolve(null),
 showFleet ? getFleetOverview(orgId) : Promise.resolve(null),
 ]);

 return (
 <>
 {(posOverview || fleetOverview) && (
 <div className={cn('grid gap-4', posOverview && fleetOverview && 'lg:grid-cols-2')}>
 {posOverview && (
 <PosOverviewPanel
 overview={posOverview}
 actionHref={role === 'FINANCE' ? '/finance' : '/pos'}
 actionLabel={role === 'FINANCE' ? 'Buka Kewangan' : 'Buka POS'}
 />)}
 {fleetOverview && <FleetOverviewSection fleetOverview={fleetOverview} />}
 </div>)}

 {(role === 'ADMIN' || role === 'OPERATION_MANAGER' || role === 'FINANCE') && (
 <SecondarySection
 title="Kawalan pengurusan"
 description="Scorecard, pemilik tindakan dan bukti audit untuk semakan apabila diperlukan."
 >
 <ManagementGovernancePanel
 role={role}
 legalEntityCode={legalEntityCode}
 stats={stats}
 branchCount={branchIds?.length ?? COMPANY.branchCount}
 openShifts={posOverview?.open_shifts}
 pendingDeliveries={fleetOverview?.pending_deliveries}
 inTransitDeliveries={fleetOverview?.in_transit}
 />
 </SecondarySection>)}
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
 const safeStaffQuickActions = quickActions
 .filter((action: { href: string }) => isDashboardRouteAllowed(
 dashboardPath(action.href),
 { role: profile.role, legalEntityCode }))
 .map((action: { label: string; href: string; description: string }) => ({
 label: action.label,
 href: action.href,
 icon: action.href.startsWith('/pos')
 ? ShoppingCart
 : DASHBOARD_ACTION_ICONS[
 dashboardPath(action.href) as keyof typeof DASHBOARD_ACTION_ICONS
 ] ?? Clock,
 description: action.description,
 }));
 if (!safeStaffQuickActions.some((action) => action.href === '/manual')) {
 safeStaffQuickActions.push({
 label: 'Panduan & SOP',
 href: '/manual',
 icon: ClipboardList,
 description: 'Rujukan tugas staf',
 });
 }

 return (
 <ModuleLayout>
 <DashboardHero
 variant="warm"
 eyebrow={`${COMPANY.name} - ${dashLabel}`}
 title={`Selamat bertugas, ${firstName}`}
 subtitle={`${COMPANY.taglineMs} - semak jadual syif dan maklumat harian anda di sini.`}
 showLogo
 />

 <section className="space-y-3">
 <DashboardSectionHeading
 eyebrow="01 · Mula di sini"
 title="Tugasan utama anda"
 description="Pilih tindakan yang perlu diselesaikan sekarang; pautan hanya mengikut akses akaun anda."
 icon={Zap}
 />
 <QuickActionGrid actions={safeStaffQuickActions.slice(0, 4)} />
 </section>

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

 <SectionCard
 title="Jadual Syif Saya"
 description="Minggu semasa - diterbitkan oleh pengurus cawangan"
 >
 <StaffSchedulePanel />
 </SectionCard>

 <StaffPayHrPanel compact />

 <SecondarySection
 title="Kawalan proaktif & panduan aliran kerja"
 description="Signal, ritma kerja dan SOP lengkap untuk semakan apabila diperlukan."
 >
 <RoleProactiveCockpit
 role={profile.role}
 workflow={workflow}
 legalEntityCode={legalEntityCode}
 branchCount={scope.branchIds?.length ?? null}
 specialAssignmentCount={agentKhasAssignments.length}
 />
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
 const quickActions = workflowQuickActions({
 workflow,
 role: profile.role,
 legalEntityCode,
 });
 const showManagementKpis = ['ADMIN', 'OPERATION_MANAGER', 'FINANCE'].includes(profile.role);
 const showLiveOperations = profile.role === 'ADMIN' ||
 profile.role === 'FINANCE' ||
 profile.role === 'DRIVER' ||
 profile.role === 'OPERATION_MANAGER';

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

 <section className="space-y-3">
 <DashboardSectionHeading
 eyebrow="01 · Fokus kerja"
 title="Mula dengan tindakan utama"
 description="Pautan disusun mengikut peranan dan syarikat aktif supaya kerja penting tidak tenggelam."
 icon={Zap}
 />
 <QuickActionGrid actions={quickActions} />
 </section>

 {statsUnavailable && (
 <DashboardAlert>
 Statistik papan pemuka tidak dapat dimuatkan. Semak sambungan pangkalan data atau view{' '}
 <code className="text-xs">dashboard_stats</code>.
 </DashboardAlert>)}

 {showManagementKpis && (
 <>
 <DashboardSectionHeading
 eyebrow="02 · Kesihatan operasi"
 title="Ringkasan prestasi dan pengecualian"
 description="Utamakan nilai merah atau kuning sebelum membuka analisis terperinci."
 icon={Gauge}
 />

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
 </>)}

 {showLiveOperations && (
 <>
 <DashboardSectionHeading
 eyebrow={showManagementKpis ? '03 · Operasi langsung' : '02 · Operasi langsung'}
 title="Status operasi semasa"
 description="Paparan ini hanya memuatkan data operasi yang berkaitan dengan peranan dan syarikat anda."
 icon={Monitor}
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
 </>)}

 <SecondarySection
 title="Kawalan proaktif, peta operasi & SOP"
 description="Analisis lanjutan, hubungan kerja, SLA dan panduan terperinci."
 >
 <RoleProactiveCockpit
 role={profile.role}
 workflow={workflow}
 legalEntityCode={legalEntityCode}
 stats={stats}
 branchCount={scope.branchIds?.length ?? null}
 />
 <OperationsWorkflowMap focus="overview" compact />
 <WorkflowSopPanel workflow={workflow} />
 </SecondarySection>
 </ModuleLayout>);
}







