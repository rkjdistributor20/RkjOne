import Link from 'next/link';
import type { ReactNode } from 'react';
import {
 AlertTriangle,
 BarChart3,
 CalendarDays,
 CheckCircle2,
 ClipboardList,
 CreditCard,
 FileText,
 Settings,
 ShieldCheck,
 ShoppingCart,
 Users,
 Wallet,
 type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
 KpiCard,
 KpiGrid,
 ModuleHeader,
 ModuleLayout,
 SectionCard,
 formatRM,
} from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';
import type { AdminBreakdownRow, AdminOverview } from '@/lib/admin/overview';

const BOOKING_STATUS_LABELS: Record<string, string> = {
 PENDING: 'Menunggu',
 CONFIRMED: 'Disahkan',
 CANCELLED: 'Dibatalkan',
 COMPLETED: 'Selesai',
 NO_SHOW: 'Tidak hadir',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
 DRAFT: 'Draft',
 PENDING_PAYMENT: 'Menunggu bayaran',
 PAID: 'Dibayar',
 SUBMITTED_FACTORY: 'Ke kilang',
 ACKNOWLEDGED: 'Diterima kilang',
 FULFILLED: 'Selesai',
 CANCELLED: 'Dibatalkan',
};

function formatCount(value: number) {
 return value.toLocaleString('ms-MY');
}

function statusLabel(labels: Record<string, string>, value: string) {
 return labels[value] ?? value.replaceAll('_', ' ');
}

function ActionLink({
 href,
 children,
 variant = 'default',
}: {
 href: string;
 children: ReactNode;
 variant?: 'default' | 'outline';
}) {
 return (
 <Link
 href={href}
 className={cn(
 buttonVariants({ size: 'sm', variant }),
 variant === 'default' && 'bg-amber-500 text-stone-950 hover:bg-amber-400',
 )}
 >
 {children}
 </Link>);
}

function BreakdownPills({
 rows,
 labels,
 showAmount,
 limit = 6,
}: {
 rows: AdminBreakdownRow[];
 labels?: Record<string, string>;
 showAmount?: boolean;
 limit?: number;
}) {
 if (rows.length === 0) {
 return <p className="text-sm text-muted-foreground">Tiada rekod untuk dipaparkan.</p>;
 }

 return (
 <div className="flex flex-wrap gap-2">
 {rows.slice(0, limit).map((row) => (
 <Badge key={row.label} variant="outline" className="gap-1.5 bg-white px-3 py-1.5 font-normal">
 <span>{labels ? statusLabel(labels, row.label) : statusLabel({}, row.label)}</span>
 <span className="font-semibold tabular-nums">{formatCount(row.count)}</span>
 {showAmount && row.amount != null && (
 <span className="text-muted-foreground">{formatRM(row.amount)}</span>)}
 </Badge>))}
 </div>);
}

function WorkstreamRow({
 icon: Icon,
 title,
 description,
 metric,
 href,
 tone = 'default',
}: {
 icon: LucideIcon;
 title: string;
 description: string;
 metric: string;
 href: string;
 tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
 return (
 <Link
 href={href}
 className="flex min-h-[88px] items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 text-sm transition hover:border-amber-300 hover:bg-amber-50/40"
 >
 <div className="flex min-w-0 items-center gap-3">
 <span
 className={cn(
 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
 tone === 'default' && 'border-sky-200 bg-sky-50 text-sky-700',
 tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
 tone === 'danger' && 'border-red-200 bg-red-50 text-red-700',
 tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
 )}
 >
 <Icon className="h-5 w-5" />
 </span>
 <span className="min-w-0">
 <span className="block font-semibold text-stone-950">{title}</span>
 <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
 </span>
 </div>
 <span className="shrink-0 rounded-md border bg-background px-2 py-1 text-xs font-semibold tabular-nums">
 {metric}
 </span>
 </Link>);
}

export function AdminCommandCenter({
 adminName,
 overview,
}: {
 adminName: string;
 overview: AdminOverview;
}) {
 const recordedPaymentTotal =
 overview.transactions.monthCash + overview.transactions.monthQr;
 const cashSplit =
 recordedPaymentTotal > 0
 ? Math.round((overview.transactions.monthCash / recordedPaymentTotal) * 100)
 : 0;
 const qrSplit =
 recordedPaymentTotal > 0
 ? 100 - cashSplit
 : 0;

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Admin Dashboard"
 description={`Pusat kawalan pentadbir untuk ${adminName}: pengguna, transaksi, jadual operasi, order dan laporan asas.`}
 icon={ShieldCheck}
 actions={
 <>
 <ActionLink href="/settings?tab=users">
 <Users className="h-4 w-4" />
 Urus Pengguna
 </ActionLink>
 <ActionLink href="/reports" variant="outline">
 <BarChart3 className="h-4 w-4" />
 Laporan
 </ActionLink>
 </>
 }
 badges={
 <>
 <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
 Admin only
 </Badge>
 <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
 {overview.period.monthStart} - {overview.period.today}
 </Badge>
 </>
 }
 />

 <KpiGrid cols={5}>
 <KpiCard title="User Aktif" value={formatCount(overview.users.activeProfiles)} icon={Users} />
 <KpiCard title="Jadual Terbuka" value={formatCount(overview.bookings.open)} icon={CalendarDays} />
 <KpiCard title="Order Ejen Aktif" value={formatCount(overview.orders.open)} icon={ClipboardList} />
 <KpiCard title="Jualan Hari Ini" value={formatRM(overview.transactions.todaySales)} icon={ShoppingCart} variant="success" />
 <KpiCard title="Tunai Tertunggak" value={formatRM(overview.governance.outstandingCash)} icon={Wallet} variant={overview.governance.outstandingCash > 0 ? 'warning' : 'default'} />
 </KpiGrid>

 <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
 <SectionCard
 title="Manage Users"
 description="Akaun login, staf aktif, role dan akses cawangan."
 action={<ActionLink href="/settings?tab=users" variant="outline">Buka</ActionLink>}
 >
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="rounded-lg border bg-white px-4 py-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Login / staf</p>
 <p className="mt-2 text-2xl font-semibold tabular-nums">
 {formatCount(overview.users.loginAccounts)}
 </p>
 <p className="text-xs text-muted-foreground">
 {formatCount(overview.users.staffTotal)} rekod staf aktif
 </p>
 </div>
 <div className="rounded-lg border bg-white px-4 py-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skop akses</p>
 <p className="mt-2 text-2xl font-semibold tabular-nums">
 {formatCount(overview.users.branchAssigned)}
 </p>
 <p className="text-xs text-muted-foreground">
 {formatCount(overview.users.hqUsers)} user HQ / pusat
 </p>
 </div>
 </div>
 <div className="mt-4">
 <BreakdownPills rows={overview.users.byRole} />
 </div>
 {overview.users.suspendedProfiles > 0 && (
 <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
 <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
 <span>{formatCount(overview.users.suspendedProfiles)} akaun bukan aktif perlu semakan admin.</span>
 </div>)}
 </SectionCard>

 <SectionCard
 title="Urus Transaksi / Jadual Operasi / Order"
 description="Senarai tindakan operasi yang perlu dipantau oleh admin."
 action={<ActionLink href="/bookings" variant="outline">Buka Jadual</ActionLink>}
 >
 <div className="grid gap-3 lg:grid-cols-3">
 <WorkstreamRow
 icon={CreditCard}
 title="Transaksi POS"
 description={`${formatCount(overview.transactions.todayTransactions)} transaksi hari ini`}
 metric={formatRM(overview.transactions.todaySales)}
 href="/pos"
 tone="success"
 />
 <WorkstreamRow
 icon={CalendarDays}
 title="Jadual Operasi"
 description={`${formatCount(overview.bookings.dueToday)} dijadual hari ini`}
 metric={`${formatCount(overview.bookings.open)} terbuka`}
 href="/bookings"
 tone={overview.bookings.urgent > 0 ? 'danger' : 'warning'}
 />
 <WorkstreamRow
 icon={ClipboardList}
 title="Orders Ejen"
 description={`${formatCount(overview.orders.total)} order bulan ini`}
 metric={formatRM(overview.orders.totalAmount)}
 href="/sales-agent"
 tone="default"
 />
 </div>
 <div className="mt-4 grid gap-4 lg:grid-cols-2">
 <div>
 <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status jadual operasi</p>
 <BreakdownPills rows={overview.bookings.byStatus} labels={BOOKING_STATUS_LABELS} />
 </div>
 <div>
 <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status order ejen</p>
 <BreakdownPills rows={overview.orders.byStatus} labels={ORDER_STATUS_LABELS} showAmount />
 </div>
 </div>
 </SectionCard>
 </div>

 <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
 <SectionCard
 title="Reports / Basic Analytics"
 description="Bacaan jualan, bayaran dan kawalan operasi bulan semasa."
 action={<ActionLink href="/reports" variant="outline">Buka Reports</ActionLink>}
 >
 <div className="grid gap-3 md:grid-cols-4">
 <div className="rounded-lg border bg-white px-4 py-3">
 <p className="text-xs text-muted-foreground">Jualan bulan ini</p>
 <p className="mt-2 text-xl font-semibold tabular-nums">{formatRM(overview.transactions.monthSales)}</p>
 </div>
 <div className="rounded-lg border bg-white px-4 py-3">
 <p className="text-xs text-muted-foreground">Transaksi bulan ini</p>
 <p className="mt-2 text-xl font-semibold tabular-nums">{formatCount(overview.transactions.monthTransactions)}</p>
 </div>
 <div className="rounded-lg border bg-white px-4 py-3">
 <p className="text-xs text-muted-foreground">Cash / QR</p>
 <p className="mt-2 text-xl font-semibold tabular-nums">{cashSplit}% / {qrSplit}%</p>
 </div>
 <div className="rounded-lg border bg-white px-4 py-3">
 <p className="text-xs text-muted-foreground">Void / refund</p>
 <p className="mt-2 text-xl font-semibold tabular-nums">{formatCount(overview.transactions.voids)} / {formatCount(overview.transactions.refunds)}</p>
 </div>
 </div>
 <div className="mt-4 flex flex-wrap gap-2">
 <ActionLink href="/reports" variant="outline"><FileText className="h-4 w-4" /> Sales report</ActionLink>
 <ActionLink href="/finance" variant="outline"><Wallet className="h-4 w-4" /> Finance</ActionLink>
 <ActionLink href="/approvals" variant="outline"><CheckCircle2 className="h-4 w-4" /> Approval</ActionLink>
 </div>
 </SectionCard>

 <SectionCard
 title="Admin Next Action"
 description="Isyarat awal untuk pentadbir sebelum masuk modul penuh."
 action={<ActionLink href="/settings?tab=system" variant="outline"><Settings className="h-4 w-4" /> System</ActionLink>}
 >
 <div className="space-y-3 text-sm">
 <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
 <span>Kelulusan pending</span>
 <Badge variant={overview.governance.pendingApprovals > 0 ? 'secondary' : 'outline'}>
 {formatCount(overview.governance.pendingApprovals)}
 </Badge>
 </div>
 <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
 <span>Jadual segera</span>
 <Badge variant={overview.bookings.urgent > 0 ? 'destructive' : 'outline'}>
 {formatCount(overview.bookings.urgent)}
 </Badge>
 </div>
 <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
 <span>Akaun bukan aktif</span>
 <Badge variant={overview.users.suspendedProfiles > 0 ? 'secondary' : 'outline'}>
 {formatCount(overview.users.suspendedProfiles)}
 </Badge>
 </div>
 </div>
 </SectionCard>
 </div>

 {overview.issues.length > 0 && (
 <SectionCard title="Data Perlu Semakan" description="Sebahagian query admin gagal dimuatkan. Modul lain masih boleh digunakan.">
 <ul className="space-y-2 text-sm text-muted-foreground">
 {overview.issues.map((issue) => (
 <li key={issue} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
 {issue}
 </li>))}
 </ul>
 </SectionCard>)}
 </ModuleLayout>);
}
