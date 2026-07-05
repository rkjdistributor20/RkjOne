import type { DashboardStats } from '@/types/database';
import type { KioskBranchOverviewRow, KioskOverviewSummary } from '@/lib/inventory/kiosk-overview-data';
import type { BranchMetricsRow } from '@/lib/dashboard/am-branch-metrics';
import type { RosterBranchStatus } from '@/lib/roster/types';
import { formatWeekRange } from '@/lib/roster/week-utils';

export type AmInsightSeverity = 'critical' | 'warning' | 'info' | 'success';

export type AmInsight = {
 id: string;
 severity: AmInsightSeverity;
 category: 'sales' | 'stock' | 'shift' | 'staff' | 'approval' | 'ops';
 title: string;
 message: string;
 branch_id?: string;
 branch_code?: string;
 action_label?: string;
 action_href?: string;
};

export type AmInsightsSummary = {
 critical: number;
 warning: number;
 info: number;
 headline: string;
};

type BuildInsightsInput = {
 stats: DashboardStats | null;
 kioskBranches: KioskBranchOverviewRow[];
 kioskSummary: KioskOverviewSummary;
 branchMetrics: BranchMetricsRow[];
 regionName: string | null;
 rosterStatuses?: RosterBranchStatus[];
};

function pctDrop(current: number, baseline: number): number | null {
 if (baseline <= 0) return null;
 return ((baseline - current) / baseline) * 100;
}

function isBusinessHours(): boolean {
 const hour = new Date().getHours();
 return hour >= 8 && hour < 22;
}

function isWeekday(): boolean {
 const d = new Date().getDay();
 return d >= 1 && d <= 6;
}

export function buildAreaManagerInsights(input: BuildInsightsInput): {
 insights: AmInsight[];
 summary: AmInsightsSummary;
} {
 const { stats, kioskBranches, kioskSummary, branchMetrics, regionName, rosterStatuses } =
 input;
 const insights: AmInsight[] = [];
 const region = regionName ?? 'kawasan';

 const kioskMap = new Map(kioskBranches.map((k) => [k.branch_id, k]));

 const rosterPending = (rosterStatuses ?? []).filter(
 (r) => r.staff_count > 0 && r.status !== 'PUBLISHED');
 if (rosterPending.length > 0) {
 const overdue = rosterPending.filter((r) => r.is_overdue);
 const weekLabel = formatWeekRange(rosterPending[0]!.week_start_date);
 if (overdue.length > 0) {
 insights.push({
 id: 'roster-overdue',
 severity: 'critical',
 category: 'staff',
 title: `${overdue.length} cawangan - jadual staf lewat`,
 message: `Jadual minggu ${weekLabel} perlu siap sebelum Ahad. ${overdue.map((r) => r.branch_code).join(', ')} belum diterbitkan.`,
 action_label: 'Jadual Staf',
 action_href: '/shifts?tab=roster',
 });
 } else {
 insights.push({
 id: 'roster-due',
 severity: 'warning',
 category: 'staff',
 title: `${rosterPending.length} jadual staf belum siap`,
 message: `Sediakan jadual minggu ${weekLabel} untuk semua staf - deadline Ahad sebelum Isnin.`,
 action_label: 'Buat Jadual',
 action_href: '/shifts?tab=roster',
 });
 }
 }

 if (stats?.pending_approvals && stats.pending_approvals > 0) {
 insights.push({
 id: 'approvals-pending',
 severity: 'warning',
 category: 'approval',
 title: `${stats.pending_approvals} kelulusan menunggu`,
 message: `Semak permintaan staf/cawangan di ${region} - elak kelewatan operasi harian.`,
 action_label: 'Buka Kelulusan',
 action_href: '/approvals',
 });
 }

 if (kioskSummary.critical > 0) {
 insights.push({
 id: 'stock-critical-region',
 severity: 'critical',
 category: 'stock',
 title: `${kioskSummary.critical} cawangan stok kritikal`,
 message: `${kioskSummary.critical_item_count} item roti/bahan perlu tindakan segera - prioritikan terima stok atau pindah antara kiosk.`,
 action_label: 'Inventori Kawasan',
 action_href: '/inventory',
 });
 }

 if (kioskSummary.pending > 0) {
 insights.push({
 id: 'transfers-pending',
 severity: 'info',
 category: 'ops',
 title: `${kioskSummary.pending} pindahan HQ dalam perjalanan`,
 message: 'Pastikan kiosk sedia terima stok - follow-up cawangan yang belum complete pindahan.',
 action_label: 'Inventori',
 action_href: '/inventory',
 });
 }

 for (const m of branchMetrics) {
 const kiosk = kioskMap.get(m.branch_id);
 const label = m.branch_code;

 if (kiosk && !kiosk.has_location) {
 insights.push({
 id: `no-kiosk-${m.branch_id}`,
 severity: 'warning',
 category: 'ops',
 title: `${label} - tiada lokasi kiosk`,
 message: 'Hubungi admin HQ untuk setup kiosk supaya stok & jualan boleh dijejak.',
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 });
 }

 if (kiosk?.worst_status === 'CRITICAL') {
 insights.push({
 id: `stock-crit-${m.branch_id}`,
 severity: 'critical',
 category: 'stock',
 title: `${label} - stok kritikal`,
 message: `${kiosk.critical_count} item kritikal - ${kiosk.low_count} rendah. Lawat atau arahkan staf restock segera.`,
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 action_label: 'Buka Stok',
 action_href: '/inventory',
 });
 } else if (kiosk?.worst_status === 'LOW') {
 insights.push({
 id: `stock-low-${m.branch_id}`,
 severity: 'warning',
 category: 'stock',
 title: `${label} - stok rendah`,
 message: `${kiosk.low_count} item di bawah ambang. Jadualkan top-up sebelum habis waktu puncak.`,
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 action_label: 'Inventori',
 action_href: '/inventory',
 });
 }

 const drop = pctDrop(m.sales_today, m.avg_daily_week);
 if (drop != null && drop >= 45 && m.avg_daily_week >= 50 && isBusinessHours()) {
 insights.push({
 id: `sales-drop-${m.branch_id}`,
 severity: 'warning',
 category: 'sales',
 title: `${label} - jualan hari ini rendah`,
 message: `Jualan ~${Math.round(drop)}% di bawah purata minggu. Semak staf, display & stok roti di kaunter.`,
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 action_label: 'Lihat Syif',
 action_href: '/shifts',
 });
 }

 if (
 isBusinessHours() &&
 isWeekday() &&
 !m.shift_open &&
 m.staff_count > 0 &&
 m.sales_today === 0) {
 insights.push({
 id: `shift-closed-${m.branch_id}`,
 severity: 'warning',
 category: 'shift',
 title: `${label} - syif belum dibuka`,
 message: 'Tiada syif POS aktif walaupun waktu operasi. Hubungi staf kiosk untuk buka syif.',
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 action_label: 'Syif',
 action_href: '/shifts',
 });
 }

 if (
 m.staff_count > 0 &&
 m.staff_clocked_in_today === 0 &&
 isBusinessHours() &&
 isWeekday()) {
 insights.push({
 id: `staff-absent-${m.branch_id}`,
 severity: 'critical',
 category: 'staff',
 title: `${label} - tiada kehadiran staf hari ini`,
 message: `${m.staff_count} staf berdaftar tetapi tiada clock-in. Sahkan kehadiran atau atur pengganti.`,
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 action_label: 'Kehadiran',
 action_href: '/shifts',
 });
 }

 if (
 m.staff_count > 0 &&
 m.staff_clocked_in_today > 0 &&
 m.staff_clocked_in_today < m.staff_count &&
 isBusinessHours()) {
 const missing = m.staff_count ?? m.staff_clocked_in_today;
 insights.push({
 id: `staff-partial-${m.branch_id}`,
 severity: 'info',
 category: 'staff',
 title: `${label} - ${missing} staf belum clock-in`,
 message: `${m.staff_clocked_in_today}/${m.staff_count} staf hadir. Pastikan shift lengkap untuk elak kekurangan khidmat.`,
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 action_label: 'Syif',
 action_href: '/shifts',
 });
 }

 if (m.sales_month > 200 && m.sales_week === 0 && isWeekday()) {
 insights.push({
 id: `sales-zero-week-${m.branch_id}`,
 severity: 'warning',
 category: 'sales',
 title: `${label} - tiada jualan minggu ini`,
 message: 'Cawangan aktif bulan lalu tetapi jualan minggu ini sifar. Perlu semakan operasi & POS.',
 branch_id: m.branch_id,
 branch_code: m.branch_code,
 });
 }
 }

 const sorted = [...branchMetrics].sort((a, b) => b.sales_today ?? a.sales_today);
 const top = sorted[0];
 const withSales = sorted.filter((b) => b.sales_today > 0);
 const bottom = withSales.at(-1);
 if (top && bottom && top.branch_id !== bottom.branch_id && top.sales_today > 100) {
 insights.push({
 id: 'sales-benchmark',
 severity: 'info',
 category: 'sales',
 title: 'Peluang penambahbaikan jualan',
 message: `${top.branch_code} pimpin hari ini - kongsi amalan baik dengan ${bottom.branch_code} untuk naikkan prestasi kawasan.`,
 action_label: 'Laporan',
 action_href: '/reports',
 });
 }

 const severityOrder: Record<AmInsightSeverity, number> = {
 critical: 0,
 warning: 1,
 info: 2,
 success: 3,
 };
 insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

 const capped = insights.slice(0, 12);

 if (capped.length === 0) {
 capped.push({
 id: 'all-clear',
 severity: 'success',
 category: 'ops',
 title: 'Kawasan stabil',
 message: `Semua ${branchMetrics.length} cawangan dalam ${region} beroperasi normal - teruskan pemantauan harian.`,
 });
 }

 const critical = capped.filter((i) => i.severity === 'critical').length;
 const warning = capped.filter((i) => i.severity === 'warning').length;
 const info = capped.filter((i) => i.severity === 'info').length;

 let headline = 'Tiada isu kritikal - kawasan under control';
 if (critical > 0) headline = `${critical} isu kritikal memerlukan tindakan segera`;
 else if (warning > 0) headline = `${warning} perkara perlu perhatian hari ini`;
 else if (info > 0) headline = `${info} cadangan penambahbaikan untuk kawasan anda`;

 return {
 insights: capped,
 summary: { critical, warning, info, headline },
 };
}
