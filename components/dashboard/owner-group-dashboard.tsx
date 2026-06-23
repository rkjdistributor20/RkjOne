import Link from 'next/link';
import {
  ArrowRight,
  ChevronRight,
  Crown,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Package,
  Truck,
} from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import type { FleetOverview, PosOverview } from '@/lib/dashboard/queries';
import { COMPANY, BRAND_COLORS } from '@/lib/brand/company';
import { LEGAL_ENTITY_GROUP_NOTE, SHARED_BRAND_LOGO_NOTE } from '@/lib/brand/legal-entities';
import { LOGISTIK_DELIVERY_TITLE, LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { labelFor, FLEET_VEHICLE_STATUS_LABELS } from '@/lib/ui/labels';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ModuleLayout,
  KpiGrid,
  KpiCard,
  SectionCard,
  formatRM,
} from '@/components/shared/module-ui';
import {
  DashboardHero,
  HeroBadge,
  DashboardAlert,
} from '@/components/dashboard/dashboard-brand-ui';
import { PosOverviewPanel } from '@/components/dashboard/pos-overview-panel';
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
  posOverview: PosOverview;
  fleetOverview: FleetOverview;
};

function SupplyChainStrip() {
  return (
    <div
      className="overflow-hidden rounded-2xl border bg-white p-4 shadow-sm md:p-5"
      style={{ borderColor: `${BRAND_COLORS.gold}44` }}
    >
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">
        Aliran Kerja Kumpulan · Kilang → Kiosk → Jualan
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
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
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
    </Link>
  );
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
                  accent.stepBg
                )}
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
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Jabatan
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {company.departments.map((dept) => (
            <DepartmentTile key={dept.id} dept={dept} />
          ))}
        </div>
      </div>
    </article>
  );
}

export function OwnerGroupDashboard({
  profileName,
  stats,
  posOverview,
  fleetOverview,
}: OwnerGroupDashboardProps) {
  const statsUnavailable = stats === null;
  const firstName = profileName.split(' ')[0] ?? 'Owner';

  return (
    <ModuleLayout>
      <DashboardHero
        variant="premium"
        eyebrow={`${COMPANY.systemName} · Pusat Kawalan Kumpulan`}
        title={`Selamat datang, ${firstName}`}
        subtitle={`Tiga syarikat · satu pemilik · ${COMPANY.branchCount} cawangan — ${LEGAL_ENTITY_GROUP_NOTE}`}
        badges={
          <>
            <HeroBadge>
              <span className="inline-flex items-center gap-1">
                <Crown className="h-3 w-3" />
                Pentadbir Utama
              </span>
            </HeroBadge>
            <HeroBadge tone="outline">3 Syarikat</HeroBadge>
            <HeroBadge tone="outline">{COMPANY.branchCount} Kiosk</HeroBadge>
          </>
        }
        actions={
          <Link
            href="/reports"
            className={cn(
              buttonVariants({ size: 'sm' }),
              'border border-[#E5A812]/40 bg-[#E5A812]/15 text-[#FFF4D6] hover:bg-[#E5A812]/25'
            )}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            Laporan Kumpulan
          </Link>
        }
      />

      <SupplyChainStrip />

      {statsUnavailable && (
        <DashboardAlert>
          Statistik tidak dimuatkan — semak sambungan pangkalan data atau view{' '}
          <code className="text-xs">dashboard_stats</code>.
        </DashboardAlert>
      )}

      <KpiGrid cols={4}>
        <KpiCard
          title="Jualan Hari Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_today ?? 0)}
          description="Semua cawangan RKJ"
          icon={TrendingUp}
        />
        <KpiCard
          title="Syif POS Buka"
          value={String(posOverview.open_shifts)}
          description={`${posOverview.transactions_today} transaksi hari ini`}
          icon={Package}
        />
        <KpiCard
          title="Penghantaran Aktif"
          value={String(fleetOverview.in_transit + fleetOverview.pending_deliveries)}
          description={`${fleetOverview.pending_deliveries} menunggu · ${fleetOverview.in_transit} dalam perjalanan`}
          icon={Truck}
        />
        <KpiCard
          title="Kelulusan Tertunda"
          value={statsUnavailable ? '—' : String(stats!.pending_approvals ?? 0)}
          description="Menunggu tindakan HQ"
          icon={CheckCircle2}
          variant={stats && stats.pending_approvals > 0 ? 'warning' : 'default'}
        />
      </KpiGrid>

      <KpiGrid cols={3}>
        <KpiCard
          title="Stok Rendah"
          value={statsUnavailable ? '—' : String(stats!.low_stock_count ?? 0)}
          icon={Package}
          variant="warning"
        />
        <KpiCard
          title="Stok Kritikal"
          value={statsUnavailable ? '—' : String(stats!.critical_stock_count ?? 0)}
          icon={AlertTriangle}
          variant="danger"
        />
        <KpiCard
          title="Tunai Tertunggak"
          value={statsUnavailable ? '—' : formatRM(stats!.outstanding_cash ?? 0)}
          icon={Banknote}
          variant="warning"
        />
      </KpiGrid>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-0.5">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Tiga Syarikat · Mengikut Aliran Kerja
            </h2>
            <p className="text-sm text-muted-foreground">
              Kilang menghasilkan → Distributor edar → Roti Kaya Junus jual di kiosk
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <LegalEntityLogo size={20} />
              {SHARED_BRAND_LOGO_NOTE}
            </p>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          {OWNER_COMPANY_BLOCKS.map((company) => (
            <CompanyBlockCard key={company.code} company={company} />
          ))}
        </div>
      </section>

      <SectionCard
        title="Jabatan Kumpulan · HQ Pemilik"
        description="Fungsi merentas syarikat — kewangan, HR, kelulusan & tetapan sistem"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {OWNER_GROUP_DEPARTMENTS.map((dept) => (
            <DepartmentTile key={dept.id} dept={dept} />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PosOverviewPanel overview={posOverview} />

        <SectionCard
          title={LOGISTIK_DELIVERY_TITLE}
          description={`${fleetOverview.pending_deliveries} menunggu · ${fleetOverview.in_transit} dalam perjalanan · RKJ Distributor`}
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
    </ModuleLayout>
  );
}
