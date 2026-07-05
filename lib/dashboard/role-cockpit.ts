import type { UserRole } from '@/types/enums';
import type { DashboardStats } from '@/types/database';
import type { RoleWorkflow } from '@/lib/dashboard/role-workflows';
import { LEGAL_ENTITIES } from '@/lib/brand/legal-entities';

export type RoleCockpitSignal = {
 label: string;
 value: string;
 description: string;
 href: string;
 tone: 'default' | 'success' | 'warning' | 'danger';
};

export type RoleCockpitAction = {
 title: string;
 description: string;
 href: string;
 badge: string;
};

export type RoleCockpit = {
 title: string;
 subtitle: string;
 companyScope: string;
 boundary: string;
 prediction: string;
 focusMode: string;
 signals: RoleCockpitSignal[];
 actions: RoleCockpitAction[];
};

export type RoleCockpitInput = {
 role: UserRole;
 workflow: RoleWorkflow;
 legalEntityCode?: string | null;
 stats?: DashboardStats | null;
 branchCount?: number | null;
 specialAssignmentCount?: number;
};

function legalEntityLabel(code?: string | null) {
 return LEGAL_ENTITIES.find((entity) => entity.code === code)?.legalName ?? 'Roti Kaya Junus Group';
}

function roleBoundary(role: UserRole, legalEntityCode?: string | null) {
 if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
 return 'Boleh pantau semua syarikat, tetapi tindakan tetap dipecahkan ikut legal entity, cawangan dan modul.';
 }
 if (role === 'AREA_MANAGER') {
 return 'Fokus kepada cawangan dalam kawasan sendiri; data syarikat lain hanya muncul bila berkaitan tugasan rasmi.';
 }
 if (role === 'SALES_AGENT') {
 return 'Fokus kepada akaun ejen, order stok, payment, outlet POS dan staf jualan ejen sahaja.';
 }
 if (legalEntityCode === 'RKJ_MFG') {
 return 'Fokus kilang, production, bahan mentah dan handoff stok. Data Distributor/Retail hanya melalui order rasmi.';
 }
 if (legalEntityCode === 'RKJ_DIST') {
 return 'Fokus HQ Distributor, logistik, driver, agent dan support cawangan. Data kilang/retail tidak bercampur tanpa tugasan.';
 }
 if (legalEntityCode === 'RKJ') {
 return 'Fokus cawangan, POS, syif, inventory kiosk dan pelanggan. Maklumat dalaman Distributor/Kilang tidak dipaparkan.';
 }
 return 'Dashboard ikut role, syarikat majikan dan skop branch yang ditetapkan oleh Pentadbir Utama.';
}

function focusMode(role: UserRole, legalEntityCode?: string | null) {
 if (role === 'HR') return 'HR + Gaji';
 if (role === 'FINANCE') return 'Kutipan + Reconciliation';
 if (role === 'DRIVER') return 'Route + POD';
 if (role === 'MAINTENANCE_MANAGER') return 'Ticket + Staf Ganti';
 if (role === 'AREA_MANAGER') return 'Kawasan + Stok + Syif';
 if (role === 'SALES_AGENT') return 'Order + POS Outlet';
 if (legalEntityCode === 'RKJ_MFG') return 'Production + Bahan Mentah';
 if (legalEntityCode === 'RKJ_DIST') return 'HQ + Logistik + Agent';
 if (legalEntityCode === 'RKJ') return 'Cawangan + POS';
 return 'Operasi Harian';
}

function prediction(role: UserRole, workflow: RoleWorkflow, stats?: DashboardStats | null) {
 if ((stats?.critical_stock_count ?? 0) > 0) {
 return 'AI cadang semak stok kritikal dahulu sebelum buka tugasan lain.';
 }
 if ((stats?.pending_approvals ?? 0) > 0) {
 return 'AI cadang selesaikan kelulusan tertunda supaya aliran kerja tidak tersekat.';
 }
 if (
 (stats?.outstanding_cash ?? 0) > 0 &&
 (role === 'FINANCE' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'AREA_MANAGER' || role === 'OPERATION_MANAGER')
 ) {
 return 'AI cadang reconcile tunai tertunggak dan semak bank-in sebelum tutup hari.';
 }
 const first = workflow.steps[0]?.title ?? 'Semak dashboard';
 return `AI cadang mulakan dengan "${first}" dan ikut urutan SOP hingga selesai.`;
}

function buildSignals(input: RoleCockpitInput): RoleCockpitSignal[] {
 const signals: RoleCockpitSignal[] = [];
 const { stats, branchCount, specialAssignmentCount, role } = input;

 if (branchCount != null) {
 signals.push({
 label: 'Skop Cawangan',
 value: String(branchCount),
 description: 'Cawangan di bawah pantauan dashboard ini.',
 href: '/dashboard',
 tone: branchCount > 0 ? 'success' : 'default',
 });
 }

 if (stats) {
 signals.push({
 label: 'Kelulusan',
 value: String(stats.pending_approvals ?? 0),
 description: (stats.pending_approvals ?? 0) > 0 ? 'Perlu tindakan supaya operasi tidak tersekat.' : 'Tiada kelulusan tertunda.',
 href: '/approvals',
 tone: (stats.pending_approvals ?? 0) > 0 ? 'warning' : 'success',
 });
 signals.push({
 label: 'Stok Kritikal',
 value: String(stats.critical_stock_count ?? 0),
 description: (stats.critical_stock_count ?? 0) > 0 ? 'Semak stok sebelum jualan/production terganggu.' : 'Tiada stok kritikal dikesan.',
 href: '/inventory',
 tone: (stats.critical_stock_count ?? 0) > 0 ? 'danger' : 'success',
 });
 if (role === 'FINANCE' || role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'AREA_MANAGER' || role === 'OPERATION_MANAGER') {
 signals.push({
 label: 'Tunai Tertunggak',
 value: `RM ${(stats.outstanding_cash ?? 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`,
 description: role === 'AREA_MANAGER' ? 'Semak collection dan bank-in kawasan sendiri.' : 'Semak collection dan bank-in.',
 href: '/finance',
 tone: (stats.outstanding_cash ?? 0) > 0 ? 'warning' : 'success',
 });
 }
 }

 if ((specialAssignmentCount ?? 0) > 0) {
 signals.push({
 label: 'Ejen Khas',
 value: String(specialAssignmentCount),
 description: 'Tugasan khas ejen aktif pada profile ini.',
 href: '/sales-agent',
 tone: 'warning',
 });
 }

 if (signals.length === 0) {
 signals.push({
 label: 'Status Kerja',
 value: 'Aktif',
 description: 'Ikut SOP role dan selesaikan tugasan mengikut urutan.',
 href: '/dashboard',
 tone: 'default',
 });
 }

 return signals.slice(0, 4);
}

export function buildRoleCockpit(input: RoleCockpitInput): RoleCockpit {
 const companyScope = input.workflow.companyScope || legalEntityLabel(input.legalEntityCode);
 const actions = input.workflow.steps.slice(0, 4).map((step, index) => ({
 title: step.title,
 description: step.description,
 href: step.href,
 badge: index === 0 ? 'Mula di sini' : step.cadence,
 }));

 return {
 title: input.workflow.label,
 subtitle: input.workflow.primaryObjective,
 companyScope,
 boundary: roleBoundary(input.role, input.legalEntityCode),
 prediction: prediction(input.role, input.workflow, input.stats),
 focusMode: focusMode(input.role, input.legalEntityCode),
 signals: buildSignals(input),
 actions,
 };
}
