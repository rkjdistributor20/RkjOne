import type { UserRole } from '@/types/enums';
import type { LocationType } from '@/types/enums';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';

export type StockMutationOperation =
 | 'receive'
 | 'transfer_create'
 | 'transfer_dispatch'
 | 'transfer_complete'
 | 'adjustment'
 | 'count'
 | 'write_off';

/** HQ urus stok masuk/keluar Gudang HQ & kilang */
const HQ_STOCK_IN_OUT_ROLES: UserRole[] = [
 'SUPER_ADMIN',
 'ADMIN',
 'CEO_FACTORY',
];

/** Pembuat order - tetapkan tarikh production roti (bukan tarikh terima kiosk) */
const ORDER_MAKER_ROLES: UserRole[] = [
 'SUPER_ADMIN',
 'ADMIN',
 'CEO_FACTORY',
 'OPERATION_MANAGER',
];

export function isStaffRole(role: string): boolean {
 return role === 'STAFF';
}

export function isAreaManagerRole(role: string): boolean {
 return role === 'AREA_MANAGER';
}

export function isOperationManagerRole(role: string): boolean {
 return role === 'OPERATION_MANAGER';
}

/** OM / Admin - pindah stok antara kiosk semua cawangan */
export function canCrossBranchKioskTransfer(role: string): boolean {
 return (
 isOperationManagerRole(role) ||
 (['SUPER_ADMIN', 'ADMIN'] as UserRole[]).includes(role as UserRole));
}

/** Tab Pindah Cawangan - AM (kawasan sahaja) atau OM/Admin (semua cawangan) */
export function canAccessBranchKioskTransferTab(role: string): boolean {
 return canCrossBranchKioskTransfer(role) || isAreaManagerRole(role);
}

/** Benarkan aliran pindahan kiosk ke kiosk (skop cawangan disemak di guard / DB) */
export function canBranchKioskTransfer(role: string): boolean {
 return canAccessBranchKioskTransferTab(role);
}

export function isHqLocationType(locationType: string): boolean {
 return locationType === 'HQ_WAREHOUSE' || locationType === 'FACTORY';
}

export function isKioskLocationType(locationType: string): boolean {
 return locationType === 'BRANCH_KIOSK';
}

export function canManageHqStockInOut(role: string): boolean {
 return HQ_STOCK_IN_OUT_ROLES.includes(role as UserRole);
}

/** Pembuat order HQ - sahkan tarikh production roti semasa cipta order / terima kilang */
export function canSetRotiProductionDate(role: string): boolean {
 return ORDER_MAKER_ROLES.includes(role as UserRole);
}

/** Kilang tetapkan jadual production mingguan */
export function canManageFactorySchedule(role: string): boolean {
 return (['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER'] as UserRole[]).includes(
 role as UserRole);
}

/** HQ hantar order ke kilang (bukan CEO Kilang) */
export function canSubmitHqFactoryOrder(role: string): boolean {
 return (['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'] as UserRole[]).includes(
 role as UserRole);
}

/** Sidebar / route Kilang */
export function canAccessFactoryNav(role: string): boolean {
 return canManageFactorySchedule(role);
}

/** Sidebar / route Gudang HQ - CEO Kilang guna dashboard Kilang sahaja */
export function canAccessHqWarehouseNav(role: string): boolean {
 if (role === 'CEO_FACTORY') return false;
 return canManageHqStockInOut(role) || canSubmitHqFactoryOrder(role);
}

/** Pengurus Kawasan urus stok masuk/keluar kiosk kawasan */
export function canManageKioskStockInOut(role: string): boolean {
 return isAreaManagerRole(role) || canManageHqStockInOut(role);
}

/** Staf hanya reject stok di kiosk cawangan sendiri */
export function staffMayRejectAtKiosk(
 staffBranchId: string | null,
 locationType: string,
 locationBranchId: string | null): boolean {
 if (!isKioskLocationType(locationType)) return false;
 if (!staffBranchId || !locationBranchId) return false;
 return staffBranchId === locationBranchId;
}

export function areaManagerMayManageLocation(
 locationType: string,
 locationBranchId: string | null,
 allowedBranchIds: string[] | null): boolean {
 if (!allowedBranchIds?.length) return false;
 if (isHqLocationType(locationType)) return false;
 if (isKioskLocationType(locationType) && locationBranchId) {
 return allowedBranchIds.includes(locationBranchId);
 }
 return false;
}

export function canUsePosRejectStock(role: string): boolean {
 return (
 isStaffRole(role) ||
 isAreaManagerRole(role) ||
 isOperationManagerRole(role) ||
 (['SUPER_ADMIN', 'ADMIN'] as UserRole[]).includes(role as UserRole)
 );
}

export interface InventoryStockUiAccess {
 canViewBalances: boolean;
 canViewMovements: boolean;
 canReceive: boolean;
 canTransfer: boolean;
 canAdjust: boolean;
 canCount: boolean;
 canWriteOff: boolean;
 /** Tab pindahan antara cawangan (OM) */
 canCrossBranchTransfer?: boolean;
 readOnlyHint?: string;
}

export function getInventoryStockUiAccess(
 role: string,
 locationType?: LocationType | string): InventoryStockUiAccess {
 if (isStaffRole(role)) {
 return {
 canViewBalances: true,
 canViewMovements: true,
 canReceive: false,
 canTransfer: false,
 canAdjust: false,
 canCount: false,
 canWriteOff: false,
 readOnlyHint:
 'Stok masuk/keluar dikawal HQ & Pengurus Kawasan. Gunakan tab Reject Stok di POS untuk lapor barang rosak.',
 };
 }

 if (isAreaManagerRole(role)) {
 const kiosk = !locationType || isKioskLocationType(locationType);
 return {
 canViewBalances: true,
 canViewMovements: true,
 canReceive: false,
 canTransfer: kiosk,
 canAdjust: kiosk,
 canCount: kiosk,
 canWriteOff: kiosk,
 canCrossBranchTransfer: true,
 readOnlyHint: kiosk
 ? 'Stok masuk kiosk: terima pindahan HQ di tab Pindah ke Terima di Kiosk. Pindah antara cawangan kawasan: tab Pindah Cawangan.'
 : `Pengurus Kawasan urus stok kiosk kawasan sahaja - bukan ${HQ_DISTRIBUTOR_LABEL}.`,
 };
 }

 if (isOperationManagerRole(role)) {
 const kiosk = !locationType || isKioskLocationType(locationType);
 return {
 canViewBalances: true,
 canViewMovements: true,
 canReceive: false,
 canTransfer: kiosk,
 canAdjust: kiosk,
 canCount: kiosk,
 canWriteOff: kiosk,
 canCrossBranchTransfer: true,
 readOnlyHint: kiosk
 ? 'Pindahan HQ ke kiosk melalui Gudang. Untuk pindah antara cawangan, guna tab Pindah Cawangan.'
 : 'Guna tab Pindah Cawangan untuk alih stok antara kiosk (stok lama / keperluan mendesak).',
 };
 }

 if (canManageHqStockInOut(role)) {
 return {
 canViewBalances: true,
 canViewMovements: true,
 canReceive: true,
 canTransfer: true,
 canAdjust: true,
 canCount: true,
 canWriteOff: true,
 canCrossBranchTransfer: true,
 };
 }

 return {
 canViewBalances: true,
 canViewMovements: true,
 canReceive: false,
 canTransfer: false,
 canAdjust: false,
 canCount: false,
 canWriteOff: false,
 readOnlyHint: 'Tiada kebenaran urus stok masuk/keluar.',
 };
}
