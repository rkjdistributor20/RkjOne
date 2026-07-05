import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import { LEGAL_ENTITIES } from '@/lib/brand/legal-entities';
import type { UserRole } from '@/types/enums';
import { MODULE_LABELS, type PermissionModule } from '@/types/enums';

export type DashboardProfileId =
 | 'OWNER_GROUP'
 | 'HQ_OPERATIONS'
 | 'HR_COMPANY'
 | 'FINANCE'
 | 'AREA_MANAGER'
 | 'STAFF_KIOSK'
 | 'DIST_OPERATIONS'
 | 'FACTORY_STAFF'
 | 'LOGISTICS'
 | 'MAINTENANCE'
 | 'SALES_AGENT';

export type DashboardAdvice = {
 profile_id: DashboardProfileId;
 label: string;
 home_path: string;
 modules: PermissionModule[];
 module_labels: string[];
 reason: string;
 companies: LegalEntityCode[];
};

export type DashboardAdviceInput = {
 role: UserRole;
 legal_entity_code: string | null;
 staff_employments?: Array<{ legal_entity_code: string; worker_type: string | null }>;
 is_group_owner?: boolean;
};

const PROFILE_LABELS: Record<DashboardProfileId, string> = {
 OWNER_GROUP: 'Pemilik Kumpulan (3 Syarikat)',
 HQ_OPERATIONS: 'Operasi HQ',
 HR_COMPANY: 'HR Syarikat',
 FINANCE: 'Kewangan',
 AREA_MANAGER: 'Pengurus Kawasan',
 STAFF_KIOSK: 'Staf Kiosk Jualan',
 DIST_OPERATIONS: 'Operasi Pengedaran',
 FACTORY_STAFF: 'Kilang & Pengeluaran',
 LOGISTICS: 'Logistik & Pemandu',
 MAINTENANCE: 'Maintenance',
 SALES_AGENT: 'Ejen Jualan RKJ Distributor',
};

function entityLabel(code: LegalEntityCode) {
 return LEGAL_ENTITIES.find((e) => e.code === code)?.legalName ?? code;
}

function advice(
 profile_id: DashboardProfileId,
 home_path: string,
 modules: PermissionModule[],
 reason: string,
 companies: LegalEntityCode[]): DashboardAdvice {
 return {
 profile_id,
 label: PROFILE_LABELS[profile_id],
 home_path,
 modules,
 module_labels: modules.map((m) => MODULE_LABELS[m]),
 reason,
 companies,
 };
}

export const DASHBOARD_HOME: Record<DashboardProfileId, string> = {
 OWNER_GROUP: '/dashboard',
 HQ_OPERATIONS: '/dashboard',
 HR_COMPANY: '/hr',
 FINANCE: '/finance',
 AREA_MANAGER: '/dashboard',
 STAFF_KIOSK: '/dashboard',
 DIST_OPERATIONS: '/inventory',
 FACTORY_STAFF: '/factory',
 LOGISTICS: '/fleet',
 MAINTENANCE: '/maintenance',
 SALES_AGENT: '/sales-agent',
};

export function adviseUserDashboard(input: DashboardAdviceInput): DashboardAdvice {
 const { role } = input;
 const entity = (input.legal_entity_code ?? 'RKJ') as LegalEntityCode;
 const employments = input.staff_employments ?? [];
 const companySet = new Set<LegalEntityCode>();

 if (input.is_group_owner || employments.length >= 2) {
 for (const e of employments) companySet.add(e.legal_entity_code as LegalEntityCode);
 if (input.legal_entity_code) companySet.add(entity);
 const companies = [...companySet];
 if (input.is_group_owner || companies.length >= 2) {
 return advice(
 'OWNER_GROUP',
 '/dashboard',
 ['reports', 'stock_hq', 'stock_kiosk', 'payroll', 'hr', 'finance', 'fleet', 'sales_agent', 'approval'],
 'Pemilik / pengurusan merentas Manufacturing, Distributor, Retail dan Agent - dashboard kumpulan dengan aliran kerja penuh.',
 companies.length ? companies : ['RKJ', 'RKJ_DIST', 'RKJ_MFG']);
 }
 }

 companySet.add(entity);

 switch (role) {
 case 'SUPER_ADMIN':
 return advice(
 'OWNER_GROUP',
 '/dashboard',
 ['reports', 'stock_hq', 'stock_kiosk', 'payroll', 'hr', 'finance', 'fleet', 'sales_agent', 'approval'],
 'Pentadbir utama - paparan pemilik kumpulan 3 syarikat dan agent.',
 ['RKJ', 'RKJ_DIST', 'RKJ_MFG']);
 case 'ADMIN':
 return advice(
 'HQ_OPERATIONS',
 '/dashboard',
 ['reports', 'pos', 'approval', 'finance'],
 'Pentadbir HQ - operasi retail & kelulusan pusat.',
 ['RKJ']);
 case 'HR':
 return advice(
 'HR_COMPANY',
 '/hr',
 ['hr', 'payroll'],
 `HR ${entityLabel(entity)} - urus staf, gaji dan slip merentas syarikat majikan.`,
 [entity]);
 case 'FINANCE':
 return advice(
 'FINANCE',
 '/finance',
 ['finance', 'payroll', 'reports'],
 `Kewangan ${entityLabel(entity)} - kutipan, reconciliasi dan laporan.`,
 [entity]);
 case 'OPERATION_MANAGER':
 if (entity === 'RKJ_MFG') {
 return advice(
 'FACTORY_STAFF',
 '/factory',
 ['stock_hq', 'reports', 'approval'],
 'Pengurus Operasi Kilang - production, bahan mentah, stok kilang dan serahan kepada distributor.',
 ['RKJ_MFG']);
 }
 if (entity === 'RKJ_DIST') {
 return advice(
 'DIST_OPERATIONS',
 '/warehouse',
 ['stock_hq', 'fleet', 'sales_agent', 'approval'],
 'Pengurus Operasi Distributor - HQ Distributor, logistik, driver, ejen, group rate dan order stok.',
 ['RKJ_DIST']);
 }
 return advice(
 'HQ_OPERATIONS',
 '/dashboard',
 ['reports', 'pos', 'shift', 'stock_kiosk', 'approval'],
 'Pengurus Operasi Roti Kaya Junus - prestasi kiosk, syif, POS, inventori dan maintenance cawangan.',
 ['RKJ']);
 case 'CEO_FACTORY':
 return advice(
 'FACTORY_STAFF',
 '/factory',
 ['stock_hq', 'reports', 'approval'],
 'CEO Kilang - pengeluaran, bahan mentah, stok kilang dan pesanan HQ.',
 ['RKJ_MFG']);
 case 'AREA_MANAGER':
 return advice(
 'AREA_MANAGER',
 '/dashboard',
 ['reports', 'stock_kiosk', 'shift', 'pos'],
 `Pengurus Kawasan (${entityLabel('RKJ_DIST')}) - urus cawangan kiosk Roti Kaya Junus.`,
 ['RKJ_DIST', 'RKJ']);
 case 'DRIVER':
 return advice(
 'LOGISTICS',
 '/fleet',
 ['fleet'],
 `Pemandu ${entityLabel(entity)} - penghantaran, POD dan jadual logistik.`,
 [entity]);
 case 'MAINTENANCE_MANAGER':
 return advice(
 'MAINTENANCE',
 '/maintenance',
 ['maintenance', 'approval'],
 'Manager maintenance - tiket penyelenggaraan cawangan & kenderaan.',
 [entity]);
 case 'SALES_AGENT':
 return advice(
 'SALES_AGENT',
 '/sales-agent',
 ['sales_agent', 'pos'],
 'Ejen jualan RKJ Distributor - order stok ikut jadual kilang, bayaran online, langganan POS RM200/cawangan.',
 ['RKJ_DIST']);
 case 'STAFF':
 default:
 if (entity === 'RKJ_MFG') {
 return advice(
 'FACTORY_STAFF',
 '/factory',
 ['stock_hq', 'shift'],
 `Staf kilang ${entityLabel('RKJ_MFG')} - pengeluaran dan kehadiran.`,
 ['RKJ_MFG']);
 }
 if (entity === 'RKJ_DIST') {
 return advice(
 'DIST_OPERATIONS',
 '/warehouse',
 ['stock_hq', 'fleet', 'sales_agent'],
 `Staf ${entityLabel('RKJ_DIST')} - pengedaran, stok HQ, logistik dan ejen jika diberi akses.`,
 ['RKJ_DIST']);
 }
 return advice(
 'STAFF_KIOSK',
 '/dashboard',
 ['shift', 'pos'],
 `Staf jualan kiosk ${entityLabel('RKJ')} - syif, POS dan slip gaji.`,
 ['RKJ']);
 }
}

export function parseDashboardMetadata(metadata: unknown): {
 profile_id: DashboardProfileId | null;
 label: string | null;
 home_path: string | null;
 reason: string | null;
} {
 if (!metadata || typeof metadata !== 'object') {
 return { profile_id: null, label: null, home_path: null, reason: null };
 }
 const m = metadata as Record<string, unknown>;
 const profile_id = m.dashboard_profile as DashboardProfileId | undefined;
 return {
 profile_id: profile_id ?? null,
 label: (m.dashboard_label as string) ?? null,
 home_path: (m.dashboard_home as string) ?? null,
 reason: (m.dashboard_ai_reason as string) ?? null,
 };
}

export function dashboardMetadataPatch(advice: DashboardAdvice) {
 return {
 dashboard_profile: advice.profile_id,
 dashboard_label: advice.label,
 dashboard_home: advice.home_path,
 dashboard_modules: advice.modules,
 dashboard_ai_reason: advice.reason,
 dashboard_ai_at: new Date().toISOString(),
 };
}

export function mergeMetadata(
 existing: unknown,
 patch: Record<string, unknown>): Record<string, unknown> {
 const base =
 existing && typeof existing === 'object' && !Array.isArray(existing)
 ? {...(existing as Record<string, unknown>) }
 : {};
 return {...base,...patch };
}

