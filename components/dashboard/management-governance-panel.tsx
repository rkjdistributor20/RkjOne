import Link from 'next/link';
import {
 AlertTriangle,
 Banknote,
 CalendarCheck2,
 CheckCircle2,
 ClipboardCheck,
 Eye,
 FileSearch,
 Landmark,
 ShieldCheck,
 Target,
 UserCog,
 Users,
 type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/enums';
import type { DashboardStats } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SectionCard, formatRM } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

type GovernanceTone = 'success' | 'warning' | 'danger' | 'default';

type GovernanceMetric = {
 label: string;
 value: string;
 target: string;
 href: string;
 tone: GovernanceTone;
 icon: LucideIcon;
};

type GovernanceLane = {
 title: string;
 owner: string;
 action: string;
 proof: string;
 href: string;
 tone: GovernanceTone;
 icon: LucideIcon;
};

type ManagementGovernancePanelProps = {
 role: UserRole;
 legalEntityCode?: string | null;
 stats?: DashboardStats | null;
 branchCount?: number | null;
 openShifts?: number | null;
 totalStaff?: number | null;
 staffClockedIn?: number | null;
 criticalStock?: number | null;
 lowStock?: number | null;
 pendingDeliveries?: number | null;
 inTransitDeliveries?: number | null;
};

const TONE_CLASS: Record<GovernanceTone, string> = {
 success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
 warning: 'border-amber-200 bg-amber-50 text-amber-950',
 danger: 'border-red-200 bg-red-50 text-red-950',
 default: 'border-slate-200 bg-slate-50 text-slate-950',
};

const TONE_BADGE: Record<GovernanceTone, string> = {
 success: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100',
 warning: 'bg-amber-100 text-amber-900 hover:bg-amber-100',
 danger: 'bg-red-100 text-red-900 hover:bg-red-100',
 default: 'bg-slate-100 text-slate-900 hover:bg-slate-100',
};

function pct(value: number | null, total: number | null) {
 if (value == null || total == null || total <= 0) return null;
 return Math.round((value / total) * 100);
}

function statusFromNumber(value: number, warningAt: number, dangerAt: number): GovernanceTone {
 if (value >= dangerAt) return 'danger';
 if (value >= warningAt) return 'warning';
 return 'success';
}

function coverageTone(value: number | null) {
 if (value == null) return 'default';
 if (value >= 85) return 'success';
 if (value >= 60) return 'warning';
 return 'danger';
}

function roleTitle(role: UserRole, legalEntityCode?: string | null) {
 if (role === 'AREA_MANAGER') return 'AM Scorecard & Kawalan Kawasan';
 if (role === 'OPERATION_MANAGER') return 'OM Command Center';
 if (role === 'ADMIN') return 'Admin Audit & Kawalan Sistem';
 if (role === 'SUPER_ADMIN') return 'Kawalan Pengurusan Owner';
 if (legalEntityCode === 'RKJ_DIST') return 'Kawalan Distributor';
 if (legalEntityCode === 'RKJ_MFG') return 'Kawalan Kilang';
 return 'Kawalan Operasi';
}

function roleSummary(role: UserRole) {
 if (role === 'AREA_MANAGER') {
 return 'AM wajib kawal stok, syif, collection cash, voucher penggunaan duit syarikat, pindahan stok dan isu cawangan dalam kawasan sendiri. OM/Admin hanya sahkan exception.';
 }
 if (role === 'OPERATION_MANAGER') {
 return 'OM bukan sekadar lihat laporan; OM perlu memantau AM, sahkan exception, dan pastikan isu tidak sampai kepada owner tanpa tindakan awal.';
 }
 if (role === 'ADMIN') {
 return 'Admin boleh bantu operasi, tetapi perubahan akses, delete, gaji dan dokumen mesti ada sebab serta audit yang jelas.';
 }
 return 'Owner hanya perlu nampak exception besar, skor AM/OM/Admin dan bukti kerja. Kerja harian diselesaikan oleh role yang betul.';
}

function buildScore(metrics: {
 criticalStock: number;
 lowStock: number;
 pendingApprovals: number;
 outstandingCash: number;
 openShiftCoverage: number | null;
 staffCoverage: number | null;
 pendingDeliveries: number;
}) {
 let score = 100;
 score -= Math.min(30, metrics.criticalStock * 8);
 score -= Math.min(16, metrics.lowStock * 2);
 score -= Math.min(14, metrics.pendingApprovals * 3);
 score -= metrics.outstandingCash > 0 ? Math.min(16, Math.ceil(metrics.outstandingCash / 500) * 2) : 0;
 score -= metrics.pendingDeliveries > 0 ? Math.min(10, metrics.pendingDeliveries * 2) : 0;
 if (metrics.openShiftCoverage != null && metrics.openShiftCoverage < 70) score -= 10;
 if (metrics.staffCoverage != null && metrics.staffCoverage < 70) score -= 10;
 return Math.max(0, Math.min(100, score));
}

function scoreTone(score: number): GovernanceTone {
 if (score >= 80) return 'success';
 if (score >= 55) return 'warning';
 return 'danger';
}

function MetricCard({ metric }: { metric: GovernanceMetric }) {
 const Icon = metric.icon;
 return (
 <Link
 href={metric.href}
 className={cn(
 'rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
 TONE_CLASS[metric.tone])}
 >
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-xs font-bold uppercase tracking-wide opacity-70">{metric.label}</p>
 <p className="mt-2 text-2xl font-bold tabular-nums">{metric.value}</p>
 </div>
 <div className="rounded-xl bg-white/70 p-2 shadow-sm">
 <Icon className="h-5 w-5" />
 </div>
 </div>
 <p className="mt-2 text-xs leading-relaxed opacity-80">{metric.target}</p>
 </Link>
 );
}

function GovernanceLaneCard({ lane }: { lane: GovernanceLane }) {
 const Icon = lane.icon;
 return (
 <Link
 href={lane.href}
 className="group rounded-2xl border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
 >
 <div className="flex items-start gap-3">
 <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', TONE_CLASS[lane.tone])}>
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <h4 className="text-sm font-bold text-foreground">{lane.title}</h4>
 <Badge className={cn('text-[11px]', TONE_BADGE[lane.tone])}>{lane.owner}</Badge>
 </div>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{lane.action}</p>
 <p className="mt-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
 Bukti wajib: {lane.proof}
 </p>
 </div>
 </div>
 </Link>
 );
}

export function ManagementGovernancePanel({
 role,
 legalEntityCode,
 stats,
 branchCount,
 openShifts,
 totalStaff,
 staffClockedIn,
 criticalStock,
 lowStock,
 pendingDeliveries,
 inTransitDeliveries,
}: ManagementGovernancePanelProps) {
 const branchTotal = branchCount ?? null;
 const openShiftCount = openShifts ?? 0;
 const staffTotal = totalStaff ?? null;
 const clockedIn = staffClockedIn ?? 0;
 const pendingApprovals = Number(stats?.pending_approvals ?? 0);
 const outstandingCash = Number(stats?.outstanding_cash ?? 0);
 const critical = Number(criticalStock ?? stats?.critical_stock_count ?? 0);
 const low = Number(lowStock ?? stats?.low_stock_count ?? 0);
 const deliveryPending = Number(pendingDeliveries ?? 0);
 const deliveryTransit = Number(inTransitDeliveries ?? 0);
 const shiftCoverage = pct(openShiftCount, branchTotal);
 const staffCoverage = pct(clockedIn, staffTotal);
 const score = buildScore({
 criticalStock: critical,
 lowStock: low,
 pendingApprovals,
 outstandingCash,
 openShiftCoverage: shiftCoverage,
 staffCoverage,
 pendingDeliveries: deliveryPending,
 });
 const healthTone = scoreTone(score);

 const metrics: GovernanceMetric[] = [
 {
 label: 'Skor Kawalan',
 value: `${score}%`,
 target: score >= 80 ? 'Operasi terkawal. Teruskan review harian.' : 'Ada exception yang perlu owner/OM pantau.',
 href: '/dashboard#management-governance',
 tone: healthTone,
 icon: Target,
 },
 {
 label: 'POS Aktif',
 value: branchTotal ? `${openShiftCount}/${branchTotal}` : String(openShiftCount),
 target: shiftCoverage == null ? 'Semak status syif terbuka.' : `Liputan syif ${shiftCoverage}%`,
 href: '/pos',
 tone: coverageTone(shiftCoverage),
 icon: Eye,
 },
 {
 label: 'Stok Risiko',
 value: `${critical} kritikal`,
 target: `${low} stok rendah. AM perlu selesaikan sebelum jualan terganggu.`,
 href: '/inventory',
 tone: statusFromNumber(critical, 1, 3),
 icon: AlertTriangle,
 },
 {
 label: 'Cash Belum Selesai',
 value: formatRM(outstandingCash),
 target: 'AM kutip, rekod voucher jika cash digunakan, dan bank-in baki minimum 2 kali seminggu; sasaran terbaik 6 kali.',
 href: '/finance',
 tone: outstandingCash > 0 ? 'warning' : 'success',
 icon: Banknote,
 },
 {
 label: 'Kelulusan',
 value: String(pendingApprovals),
 target: 'OM/Admin perlu kosongkan queue harian sebelum isu naik kepada owner.',
 href: '/approvals',
 tone: statusFromNumber(pendingApprovals, 1, 5),
 icon: ShieldCheck,
 },
 {
 label: 'Logistik',
 value: `${deliveryPending + deliveryTransit}`,
 target: `${deliveryPending} menunggu, ${deliveryTransit} dalam perjalanan.`,
 href: '/fleet',
 tone: deliveryPending > 0 ? 'warning' : 'success',
 icon: Landmark,
 },
 ];

 const lanes: GovernanceLane[] = [
 {
 title: 'AM Scorecard Harian',
 owner: 'AM',
 action: 'Kawal stok, POS buka, staf hadir, collection cash, pindahan stok dan maintenance kawasan.',
 proof: 'kiraan stok, rekod syif, bank-in cash, gambar/rujukan collection dan approval exception.',
 href: role === 'AREA_MANAGER' ? '/dashboard' : '/reports',
 tone: role === 'AREA_MANAGER' ? healthTone : 'default',
 icon: Users,
 },
 {
 title: 'OM Command Center',
 owner: 'OM',
 action: 'Semak semua AM, kejar cawangan merah, sahkan exception stok/cash/staf, dan pastikan isu selesai sebelum owner perlu campur tangan.',
 proof: 'senarai tindakan harian, approval/reject, catatan follow-up dan status selesai.',
 href: '/approvals',
 tone: pendingApprovals > 0 || critical > 0 ? 'warning' : 'success',
 icon: ClipboardCheck,
 },
 {
 title: 'Admin Audit & Akses',
 owner: 'Admin',
 action: 'Urus user, dokumen, role dan tetapan tetapi setiap perubahan sensitif perlu ada sebab dan rekod audit.',
 proof: 'audit log, reason perubahan akses, rekod dokumen lama/baharu dan siapa meluluskan.',
 href: '/settings',
 tone: role === 'ADMIN' ? 'warning' : 'default',
 icon: UserCog,
 },
 {
 title: 'Cash Collection & Voucher Proof',
 owner: 'AM/Finance',
 action: 'Kutipan tunai cawangan perlu direkod. Jika cash digunakan untuk barang cawangan, minyak atau maintenance transport, AM wajib buat voucher dan bank-in baki bersih.',
 proof: 'collection number, request cawangan approved jika beli barang, resit/gambar, rujukan kenderaan jika fuel/maintenance, bank reference/slip dan baki bank-in.',
 href: '/finance',
 tone: outstandingCash > 0 ? 'warning' : 'success',
 icon: Banknote,
 },
 ];

 const weeklyReviews = [
 'Isnin: OM semak scorecard AM, POS tidak buka, staf tidak cukup dan stok kritikal.',
 'Selasa/Khamis: AM lengkapkan kutipan cash, voucher penggunaan cash dan bank-in baki; Finance semak bukti.',
 'Rabu: Admin semak audit akses, dokumen cawangan dan perubahan role/gaji.',
 'Jumaat: Owner semak exception sahaja - bukan kerja harian yang belum dibuat.',
 ];

 const escalationRules = [
 { label: 'Naik kepada AM', rule: 'Stok rendah, staf tidak hadir, POS belum buka, delivery lewat bawah 1 hari.' },
 { label: 'Naik kepada OM', rule: 'Stok kritikal berulang, mismatch stok/cash, cawangan tutup, AM tidak bertindak.' },
 { label: 'Naik kepada Admin', rule: 'Role/access salah, delete/update sensitif, dokumen tidak boleh dibuka atau data bercampur syarikat.' },
 { label: 'Naik kepada Owner', rule: 'Kesan kewangan besar, payroll final, legal, polisi harga, fraud suspicion atau risiko reputasi.' },
 ];

 return (
 <div id="management-governance">
 <SectionCard
 title={roleTitle(role, legalEntityCode)}
 description={roleSummary(role)}
 action={
 <Link href="/reports" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'shrink-0')}>
 <FileSearch className="mr-1.5 h-4 w-4" />
 Semak Laporan
 </Link>
 }
 >
 <div className="space-y-5">
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
 {metrics.map((metric) => (
 <MetricCard key={metric.label} metric={metric} />
 ))}
 </div>

 <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
 <div className="grid gap-3 md:grid-cols-2">
 {lanes.map((lane) => (
 <GovernanceLaneCard key={lane.title} lane={lane} />
 ))}
 </div>

 <div className="grid gap-4">
 <div className="rounded-2xl border bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-4">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-sm font-bold">Weekly SOP Review</p>
 <p className="text-xs text-muted-foreground">Cadangan review supaya owner tidak jadi bottleneck.</p>
 </div>
 <CalendarCheck2 className="h-5 w-5 text-primary" />
 </div>
 <div className="mt-3 space-y-2">
 {weeklyReviews.map((item) => (
 <div key={item} className="flex gap-2 rounded-xl border bg-white/75 p-3 text-xs leading-relaxed">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
 <span>{item}</span>
 </div>
 ))}
 </div>
 </div>

 <div className="rounded-2xl border bg-background p-4">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-sm font-bold">Escalation Matrix</p>
 <p className="text-xs text-muted-foreground">Bila sesuatu isu perlu naik kepada siapa.</p>
 </div>
 <ShieldCheck className="h-5 w-5 text-primary" />
 </div>
 <div className="mt-3 grid gap-2">
 {escalationRules.map((item) => (
 <div key={item.label} className="rounded-xl border bg-muted/20 p-3">
 <p className="text-xs font-bold">{item.label}</p>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.rule}</p>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 </SectionCard>
 </div>
 );
}
