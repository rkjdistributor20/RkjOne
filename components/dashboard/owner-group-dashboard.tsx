import Link from 'next/link';
import type { ReactNode } from 'react';
import {
 ArrowRight,
 ChevronRight,
 TrendingUp,
 AlertTriangle,
 Banknote,
 Package,
 Truck,
 Users,
 ShieldCheck,
} from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import type { FleetOverview, PosOverview } from '@/lib/dashboard/queries';
import type { HrDashboardData } from '@/lib/hr/company-hr';
import { COMPANY, BRAND_COLORS } from '@/lib/brand/company';
import { SHARED_BRAND_LOGO_NOTE } from '@/lib/brand/legal-entities';
import { LOGISTIK_DELIVERY_TITLE, LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { labelFor, FLEET_VEHICLE_STATUS_LABELS } from '@/lib/ui/labels';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
 ModuleLayout,
 KpiGrid,
 KpiCard,
 SectionCard,
 SecondarySection,
 formatRM,
} from '@/components/shared/module-ui';
import { DashboardAlert } from '@/components/dashboard/dashboard-brand-ui';
import { OwnerExecutiveHero } from '@/components/dashboard/owner-executive-hero';
import { PosOverviewPanel } from '@/components/dashboard/pos-overview-panel';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { OperationsWorkflowMap } from '@/components/dashboard/operations-workflow-map';
import { RkjOperatingMap } from '@/components/dashboard/rkj-operating-map';
import { RoleProactiveCockpit } from '@/components/dashboard/role-proactive-cockpit';
import { OwnerDelegationPanel } from '@/components/dashboard/owner-delegation-panel';
import { ManagementGovernancePanel } from '@/components/dashboard/management-governance-panel';
import { ProjectMemoryPanel } from '@/components/dashboard/project-memory-panel';
import { AiLeadershipPanel } from '@/components/dashboard/ai-leadership-panel';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import {
 OWNER_COMPANY_BLOCKS,
 OWNER_GROUP_DEPARTMENTS,
 OWNER_SUPPLY_CHAIN,
 type OwnerCompanyBlock,
 type OwnerDepartment,
} from '@/lib/dashboard/owner-company-structure';

type OwnerGroupDashboardProps = {
 profileName: string;
 stats: DashboardStats | null;
 operations?: ReactNode;
};

type OwnerGroupOperationsProps = {
 stats: DashboardStats | null;
 posOverview: PosOverview;
 fleetOverview: FleetOverview;
 hrData?: HrDashboardData | null;
};

function SupplyChainStrip() {
 return (
 <div
 className="overflow-hidden rounded-2xl border bg-white p-4 shadow-sm md:p-5"
 style={{ borderColor: `${BRAND_COLORS.gold}44` }}
 >
 <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">
 Aliran Kerja Kumpulan - Kilang ke Kiosk ke Jualan
 </p>
 <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
 {OWNER_SUPPLY_CHAIN.map((node, idx) => (
 <div key={node.label} className="flex flex-1 items-center gap-2 min-w-0">
 <div
 className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm"
 style={{ backgroundColor: `${BRAND_COLORS.gold}18`, color: BRAND_COLORS.gold }}
 >
 <node.icon className="h-5 w-5" strokeWidth={2} />
 </div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-foreground">{node.label}</p>
 <p className="text-xs text-muted-foreground">{node.sub}</p>
 </div>
 {idx < OWNER_SUPPLY_CHAIN.length - 1 && (
 <ArrowRight
 className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 lg:block"
 aria-hidden
 />)}
 </div>))}
 </div>
 </div>);
}

function DepartmentTile({ dept }: { dept: OwnerDepartment }) {
 return (
 <Link
 href={dept.href}
 className="group flex items-start gap-3 rounded-xl border bg-white/80 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
 >
 <div
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
 style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
 >
 <dept.icon className="h-5 w-5 text-foreground/70 group-hover:text-primary" strokeWidth={2} />
 </div>
 <div className="min-w-0 flex-1">
 <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
 {dept.label}
 <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
 </p>
 <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
 {dept.description}
 </p>
 </div>
 </Link>);
}

function CompanyBlockCard({ company }: { company: OwnerCompanyBlock }) {
 const { accent } = company;

 return (
 <article
 className="flex flex-col overflow-hidden rounded-2xl border shadow-md transition-shadow hover:shadow-lg"
 style={{ borderColor: accent.border, background: accent.gradient }}
 >
 <header className="border-b border-black/5 px-5 py-4">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0 space-y-1.5">
 <div className="flex flex-wrap items-center gap-2">
 <span
 className={cn(
 'inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-2 text-xs font-bold',
 accent.stepBg)}
 >
 {company.step}
 </span>
 <Badge variant="outline" className={cn('text-xs font-medium', accent.badge)}>
 {company.workflowLabel}
 </Badge>
 </div>
 <h2 className="text-lg font-bold leading-tight text-[#141414]">{company.legalName}</h2>
 <p className="text-sm text-muted-foreground">{company.scope}</p>
 </div>
 <LegalEntityLogo size={48} priority={company.step === 1} />
 </div>
 {company.highlights && company.highlights.length > 0 && (
 <div className="mt-3 flex flex-wrap gap-1.5">
 {company.highlights.map((h) => (
 <span
 key={h}
 className="rounded-full border border-black/8 bg-white/60 px-2.5 py-0.5 text-[11px] font-medium text-foreground/80"
 >
 {h}
 </span>))}
 </div>)}
 </header>

 <div className="flex flex-1 flex-col gap-2 p-4">
 <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 Jabatan
 </p>
 <div className="grid gap-2 sm:grid-cols-2">
 {company.departments.map((dept) => (
 <DepartmentTile key={dept.id} dept={dept} />))}
 </div>
 </div>
 </article>);
}

export function OwnerGroupOperationsFallback() {
 return (
 <div className="space-y-4">
 <Skeleton className="h-36 rounded-2xl" />
 <div className="grid gap-4 lg:grid-cols-2">
 <SectionCard
 title="Memuatkan POS"
 description="Syif dan transaksi sedang disediakan tanpa menghalang dashboard utama."
 >
 <div className="space-y-3">
 <Skeleton className="h-8 w-44" />
 <Skeleton className="h-28 w-full" />
 </div>
 </SectionCard>
 <SectionCard
 title="Memuatkan Logistik & HR"
 description="Status penghantaran dan ringkasan staf legal sedang disemak."
 >
 <div className="flex flex-wrap gap-2">
 {Array.from({ length: 8 }).map((_, index) => (
 <Skeleton key={index} className="h-8 w-28 rounded-full" />))}
 </div>
 </SectionCard>
 </div>
 </div>);
}

export function OwnerGroupDashboard({
 profileName,
 stats,
 operations,
}: OwnerGroupDashboardProps) {
 const statsUnavailable = stats === null;
 const workflow = getRoleWorkflow({ role: 'SUPER_ADMIN' });

 return (
 <ModuleLayout>
 <OwnerExecutiveHero profileName={profileName} stats={stats} />

 {statsUnavailable && (
 <DashboardAlert>
 Statistik tidak dimuatkan - semak sambungan pangkalan data atau view{' '}
 <code className="text-xs">dashboard_stats</code>.
 </DashboardAlert>)}

 <KpiGrid cols={5}>
 <KpiCard
 title="Jualan Minggu Ini"
 value={statsUnavailable ? '-' : formatRM(stats!.sales_this_week ?? 0)}
 description="Ringkasan kumpulan"
 icon={TrendingUp}
 />
 <KpiCard
 title="Jualan Bulan Ini"
 value={statsUnavailable ? '-' : formatRM(stats!.sales_this_month ?? 0)}
 description="Prestasi bulanan"
 icon={TrendingUp}
 />
 <KpiCard
 title="Stok Rendah"
 value={statsUnavailable ? '-' : String(stats!.low_stock_count ?? 0)}
 icon={Package}
 variant="warning"
 />
 <KpiCard
 title="Stok Kritikal"
 value={statsUnavailable ? '-' : String(stats!.critical_stock_count ?? 0)}
 icon={AlertTriangle}
 variant="danger"
 />
 <KpiCard
 title="Tunai Tertunggak"
 value={statsUnavailable ? '-' : formatRM(stats!.outstanding_cash ?? 0)}
 icon={Banknote}
 variant="warning"
 />
 </KpiGrid>

 <OwnerDelegationPanel />

 <section className="space-y-3">
 <div className="flex items-end justify-between gap-3 px-0.5">
 <div>
 <h2 className="text-lg font-bold tracking-tight text-foreground">
 Tiga Syarikat - Mengikut Aliran Kerja
 </h2>
 <p className="text-sm text-muted-foreground">
 Kilang menghasilkan, Distributor edar, Roti Kaya Junus jual di kiosk
 </p>
 <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
 <LegalEntityLogo size={20} />
 {SHARED_BRAND_LOGO_NOTE}
 </p>
 </div>
 </div>
 <div className="grid gap-5 xl:grid-cols-3">
 {OWNER_COMPANY_BLOCKS.map((company) => (
 <CompanyBlockCard key={company.code} company={company} />))}
 </div>
 </section>

 {operations ?? <OwnerGroupOperationsFallback />}

 <SecondarySection
 title="Aliran kumpulan & panduan AI"
 description="Rujukan rentas syarikat, peta proses dan cadangan operasi."
 >
 <SupplyChainStrip />
 <RoleProactiveCockpit
 role="SUPER_ADMIN"
 workflow={workflow}
 stats={stats}
 branchCount={COMPANY.branchCount}
 />
 <OperationsWorkflowMap focus="overview" compact />
 </SecondarySection>
 </ModuleLayout>);
}

export function OwnerGroupOperations({
 stats,
 posOverview,
 fleetOverview,
 hrData,
}: OwnerGroupOperationsProps) {
 const workflow = getRoleWorkflow({ role: 'SUPER_ADMIN' });

 return (
 <>
 <ManagementGovernancePanel
 role="SUPER_ADMIN"
 stats={stats}
 branchCount={COMPANY.branchCount}
 openShifts={posOverview.open_shifts}
 pendingDeliveries={fleetOverview.pending_deliveries}
 inTransitDeliveries={fleetOverview.in_transit}
 />

 <KpiGrid cols={4}>
 <KpiCard
 title="Syif POS Buka"
 value={String(posOverview.open_shifts)}
 description={`${posOverview.transactions_today} transaksi hari ini`}
 icon={Package}
 />
 <KpiCard
 title="Transaksi POS"
 value={String(posOverview.transactions_today)}
 description="Dikemas kini dari POS cawangan"
 icon={TrendingUp}
 />
 <KpiCard
 title="Penghantaran Aktif"
 value={String(fleetOverview.in_transit + fleetOverview.pending_deliveries)}
 description={`${fleetOverview.pending_deliveries} menunggu - ${fleetOverview.in_transit} dalam perjalanan`}
 icon={Truck}
 />
 <KpiCard
 title="Kenderaan Aktif"
 value={String(fleetOverview.vehicles.length)}
 description="RKJ Distributor"
 icon={Truck}
 />
 </KpiGrid>

 {hrData && (
 <SectionCard
 title="HR Syarikat Legal"
 description="Semua staf dan pengguna dikumpulkan mengikut majikan legal masing-masing"
 action={
 <Link href="/hr" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
 <Users className="mr-1.5 h-4 w-4" />
 Buka HR
 </Link>
 }
 >
 <div className="grid gap-3 md:grid-cols-3">
 {hrData.group_owners?.map((owner) => (
 <div
 key={owner.profile_id ?? owner.id}
 className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm md:col-span-3"
 >
 <p className="text-sm font-semibold">{owner.full_name}</p>
 <p className="mt-1 text-xs text-muted-foreground">
 Pemilik kumpulan - {owner.employments?.length ?? 0} syarikat -{' '}
 {owner.total_monthly_amount != null
 ? `RM ${Number(owner.total_monthly_amount).toLocaleString('ms-MY')}/bulan`
 : 'gaji mengikut syarikat'}
 </p>
 </div>))}
 {hrData.companies.map((company) => (
 <div key={company.id} className="rounded-xl border bg-background p-4 shadow-sm">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-foreground">{company.legal_name}</p>
 <p className="mt-1 text-xs text-muted-foreground">{company.code}</p>
 </div>
 <LegalEntityLogo size={34} />
 </div>
 <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
 <div className="rounded-lg bg-muted/40 px-2 py-2">
 <p className="text-lg font-bold tabular-nums">{company.summary.total}</p>
 <p className="text-muted-foreground">HR</p>
 </div>
 <div className="rounded-lg bg-muted/40 px-2 py-2">
 <p className="text-lg font-bold tabular-nums">{company.summary.branch_staff}</p>
 <p className="text-muted-foreground">Staf</p>
 </div>
 <div className="rounded-lg bg-muted/40 px-2 py-2">
 <p className="text-lg font-bold tabular-nums">{company.summary.profile_complete}</p>
 <p className="text-muted-foreground">Lengkap</p>
 </div>
 </div>
 </div>))}
 </div>
 <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
 <Badge variant="outline" className="gap-1">
 <ShieldCheck className="h-3.5 w-3.5" />
 {hrData.summary.management_people} pengurusan
 </Badge>
 <Badge variant="outline">{hrData.summary.total_people} jumlah rekod HR</Badge>
 </div>
 </SectionCard>)}

 <SectionCard
 title="Jabatan Kumpulan - HQ Pemilik"
 description="Fungsi merentas syarikat - kewangan, HR, kelulusan & tetapan sistem"
 >
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
 {OWNER_GROUP_DEPARTMENTS.map((dept) => (
 <DepartmentTile key={dept.id} dept={dept} />))}
 </div>
 </SectionCard>

 <div className="grid gap-4 lg:grid-cols-2">
 <PosOverviewPanel overview={posOverview} />

 <SectionCard
 title={LOGISTIK_DELIVERY_TITLE}
 description={`${fleetOverview.pending_deliveries} menunggu - ${fleetOverview.in_transit} dalam perjalanan - RKJ Distributor`}
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
 </SectionCard>
 </div>

 <SecondarySection
 title="Perancangan, AI & SOP pengurusan"
 description="Bahan strategi dan rujukan lanjutan untuk semakan apabila diperlukan."
 >
 <ProjectMemoryPanel />
 <AiLeadershipPanel />
 <RkjOperatingMap />
 <WorkflowSopPanel workflow={workflow} />
 </SecondarySection>
 </>);
}

