import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Package,
  Truck,
} from 'lucide-react';
import { getCurrentProfile } from '@/lib/auth/session';
import { getDashboardStats, getFleetOverview, getPosOverview } from '@/lib/dashboard/queries';
import { PageHeader, BrandStatsStrip } from '@/components/brand/page-header';
import { COMPANY } from '@/lib/brand/company';
import { PosOverviewPanel } from '@/components/dashboard/pos-overview-panel';
import { labelFor, FLEET_VEHICLE_STATUS_LABELS } from '@/lib/ui/labels';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ElementType;
  variant?: 'default' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'text-primary bg-primary/10',
    warning: 'text-orange-600 bg-orange-50',
    danger: 'text-red-600 bg-red-50',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`rounded-lg p-2 ${colors[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatRM(amount: number) {
  return `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  const [stats, posOverview, fleetOverview] = await Promise.all([
    getDashboardStats(profile.organization_id),
    getPosOverview(profile.organization_id),
    getFleetOverview(profile.organization_id),
  ]);

  const statsUnavailable = stats === null;

  return (
    <div className="space-y-6">
      <PageHeader
        badge={COMPANY.systemName}
        title="Papan Pemuka"
        description={`Ringkasan operasi ${COMPANY.name} — ${COMPANY.tagline}`}
      />

      <BrandStatsStrip />

      {statsUnavailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Statistik papan pemuka tidak dapat dimuatkan. Semak sambungan pangkalan data atau
          view <code className="text-xs">dashboard_stats</code>.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Jualan Hari Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_today ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Jualan Minggu Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_this_week ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Jualan Bulan Ini"
          value={statsUnavailable ? '—' : formatRM(stats!.sales_this_month ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Tunai Tertunggak"
          value={statsUnavailable ? '—' : formatRM(stats!.outstanding_cash ?? 0)}
          icon={Banknote}
          variant="warning"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Stok Rendah"
          value={statsUnavailable ? '—' : String(stats!.low_stock_count ?? 0)}
          description="Di bawah ambang minimum"
          icon={Package}
          variant="warning"
        />
        <StatCard
          title="Stok Kritikal"
          value={statsUnavailable ? '—' : String(stats!.critical_stock_count ?? 0)}
          description="Tindakan segera diperlukan"
          icon={AlertTriangle}
          variant="danger"
        />
        <StatCard
          title="Kelulusan Tertunda"
          value={statsUnavailable ? '—' : String(stats!.pending_approvals ?? 0)}
          description="Menunggu tindakan pengurus"
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PosOverviewPanel overview={posOverview} />

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Armada & Penghantaran
              </CardTitle>
              <CardDescription>
                {fleetOverview.pending_deliveries} menunggu · {fleetOverview.in_transit} dalam perjalanan
              </CardDescription>
            </div>
            <Link href="/fleet" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
              Buka Armada
            </Link>
          </CardHeader>
          <CardContent>
            {fleetOverview.vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tiada kenderaan didaftarkan.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {fleetOverview.vehicles.map((v) => (
                  <Badge key={v.id} variant="outline" className="gap-1 px-3 py-1">
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tindakan Pantas</CardTitle>
          <CardDescription>Tugasan biasa harian</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Buka Syif POS', href: '/pos' },
            { label: 'Inventori', href: '/inventory' },
            { label: 'Lihat Laporan', href: '/reports' },
            { label: 'Kelulusan Tertunda', href: '/approvals' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              {action.label}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
