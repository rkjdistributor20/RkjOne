import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import { ROLE_LABELS, type UserRole } from '@/types/enums';

const COMPANY_ROLE_LABELS: Partial<Record<LegalEntityCode, Partial<Record<UserRole, string>>>> = {
 RKJ_MFG: {
 ADMIN: 'Pentadbir HQ Kumpulan',
 HR: 'HR Manufacturing',
 OPERATION_MANAGER: 'Pengurus Operasi Kilang',
 CEO_FACTORY: 'CEO Kilang / Pengeluaran',
 FINANCE: 'Kewangan Manufacturing',
 STAFF: 'Staf Kilang',
 },
 RKJ_DIST: {
 ADMIN: 'Pentadbir HQ Kumpulan',
 HR: 'HR Distributor',
 OPERATION_MANAGER: 'Pengurus Operasi Distributor',
 AREA_MANAGER: 'Pengurus Kawasan',
 DRIVER: 'Pemandu Distributor',
 MAINTENANCE_MANAGER: 'Manager Maintenance',
 SALES_AGENT: 'Ejen Jualan / Portal Ejen',
 FINANCE: 'Kewangan Distributor',
 STAFF: 'Staf Distributor',
 },
 RKJ: {
 ADMIN: 'Pentadbir HQ Kumpulan',
 HR: 'HR Roti Kaya Junus',
 OPERATION_MANAGER: 'Pengurus Operasi Roti Kaya Junus',
 FINANCE: 'Kewangan Roti Kaya Junus',
 STAFF: 'Staf Kiosk / Jualan',
 },
};

const COMPANY_ROLE_OPTIONS: Record<LegalEntityCode, UserRole[]> = {
 RKJ_MFG: ['ADMIN', 'HR', 'OPERATION_MANAGER', 'CEO_FACTORY', 'FINANCE', 'STAFF'],
 RKJ_DIST: [
 'ADMIN',
 'HR',
 'OPERATION_MANAGER',
 'AREA_MANAGER',
 'DRIVER',
 'MAINTENANCE_MANAGER',
 'SALES_AGENT',
 'FINANCE',
 'STAFF',
 ],
 RKJ: ['ADMIN', 'HR', 'OPERATION_MANAGER', 'FINANCE', 'STAFF'],
};

const COMPANY_ACCESS_PREVIEW: Partial<Record<LegalEntityCode, Partial<Record<UserRole, string[]>>>> = {
 RKJ_MFG: {
 OPERATION_MANAGER: ['Production queue', 'Bahan mentah', 'Stok kilang', 'Laporan kilang'],
 CEO_FACTORY: ['Kilang', 'Bahan mentah', 'Production', 'Kelulusan kilang'],
 STAFF: ['Tugasan kilang', 'Syif sendiri', 'Rekod production asas'],
 },
 RKJ_DIST: {
 OPERATION_MANAGER: ['HQ Distributor', 'Logistik', 'Portal Ejen', 'Kelulusan distributor'],
 AREA_MANAGER: ['Cawangan cover', 'POS', 'Syif & inventori kiosk'],
 DRIVER: ['Logistik', 'Trip penghantaran', 'Route & POD'],
 MAINTENANCE_MANAGER: ['Maintenance', 'Report cawangan', 'Staf ganti'],
 SALES_AGENT: ['Portal Ejen', 'Order stok', 'Outlet/POS ejen'],
 STAFF: ['HQ Distributor', 'Logistik asas', 'Tugasan distributor'],
 },
 RKJ: {
 OPERATION_MANAGER: ['Cawangan', 'POS', 'Syif', 'Inventori kiosk'],
 STAFF: ['POS/cawangan', 'Syif sendiri', 'Inventori asas'],
 },
};

const DEFAULT_ACCESS_PREVIEW: Record<UserRole, string[]> = {
 SUPER_ADMIN: ['Semua syarikat', 'Semua dashboard', 'Tetapan penuh'],
 ADMIN: ['Pentadbiran HQ', 'Kelulusan', 'Laporan operasi'],
 HR: ['HR & Gaji', 'Rekod staf', 'Payroll'],
 OPERATION_MANAGER: ['Operasi', 'Kelulusan', 'Laporan'],
 CEO_FACTORY: ['Kilang', 'Bahan mentah', 'Production'],
 AREA_MANAGER: ['Cawangan', 'POS', 'Syif & inventori'],
 DRIVER: ['Logistik', 'Trip penghantaran', 'Route'],
 STAFF: ['Dashboard staf', 'Syif sendiri', 'Tugasan asas'],
 FINANCE: ['Kewangan', 'Gaji', 'Laporan bayaran'],
 MAINTENANCE_MANAGER: ['Maintenance', 'Report cawangan', 'Tugasan baik pulih'],
 SALES_AGENT: ['Portal Ejen', 'Order stok', 'Outlet/POS ejen'],
};

export function getCompanyRoleLabel(role: UserRole, legalEntityCode?: string | null) {
 const code = legalEntityCode as LegalEntityCode | undefined;
 return (code ? COMPANY_ROLE_LABELS[code]?.[role] : null) ?? ROLE_LABELS[role] ?? role;
}

export function getCompanyRoleOptions(legalEntityCode?: string | null): UserRole[] {
 const code = legalEntityCode as LegalEntityCode | undefined;
 return code ? COMPANY_ROLE_OPTIONS[code] ?? COMPANY_ROLE_OPTIONS.RKJ : COMPANY_ROLE_OPTIONS.RKJ;
}

export function getDefaultRoleForCompany(legalEntityCode?: string | null): UserRole {
 const code = legalEntityCode as LegalEntityCode | undefined;
 if (code === 'RKJ_MFG' || code === 'RKJ_DIST') return 'OPERATION_MANAGER';
 return 'STAFF';
}

export function getCompanyAccessPreview(role: UserRole, legalEntityCode?: string | null) {
 const code = legalEntityCode as LegalEntityCode | undefined;
 return (code ? COMPANY_ACCESS_PREVIEW[code]?.[role] : null) ?? DEFAULT_ACCESS_PREVIEW[role];
}
