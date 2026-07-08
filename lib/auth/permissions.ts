import type { PermissionLevel, PermissionModule, UserRole } from '@/types/enums';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { canAccessFactoryNav, canAccessHqWarehouseNav } from '@/lib/auth/stock-access';
import {
 filterNavForRole,
} from '@/lib/auth/area-manager-access';
import { filterNavForSalesAgent } from '@/lib/auth/sales-agent-access';
import {
 canAccessNavGroupForLegalEntity,
 type LegalEntityScopedProfile,
} from '@/lib/auth/legal-entity-scope';

const LEVEL_RANK: Record<PermissionLevel, number> = {
 NONE: 0,
 VIEW: 1,
 VIEW_AREA: 2,
 OWN: 3,
 FULL_OWN: 4,
 FULL: 5,
};

export function hasPermission(
 permissions: Map<string, PermissionLevel>,
 module: PermissionModule,
 required: PermissionLevel = 'VIEW'): boolean {
 const granted = permissions.get(module) ?? 'NONE';
 return LEVEL_RANK[granted] >= LEVEL_RANK[required];
}

export function canAccessModule(
 role: UserRole,
 module: PermissionModule,
 permissions: Map<string, PermissionLevel>): boolean {
 if (role === 'SUPER_ADMIN') return true;
 return hasPermission(permissions, module, 'VIEW');
}

export function isAdminRole(role: UserRole): boolean {
 return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function isAreaScopedRole(role: UserRole): boolean {
 return role === 'AREA_MANAGER' || role === 'STAFF' || role === 'DRIVER';
}

export function canAccessMaintenance(role: UserRole): boolean {
 return ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER', 'AREA_MANAGER', 'STAFF'].includes(role);
}

export function canAccessSalesAgent(role: UserRole): boolean {
 return ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'FINANCE', 'CEO_FACTORY', 'SALES_AGENT'].includes(role);
}

export function canAccessHr(role: UserRole): boolean {
 return [
 'SUPER_ADMIN',
 'ADMIN',
 'HR',
 'OPERATION_MANAGER',
 'CEO_FACTORY',
 'AREA_MANAGER',
 'DRIVER',
 'STAFF',
 'FINANCE',
 'MAINTENANCE_MANAGER',
 ].includes(role);
}

export function buildPermissionMap(
 rows: Array<{ module: string; permission: PermissionLevel }>): Map<string, PermissionLevel> {
 return new Map(rows.map((r) => [r.module, r.permission]));
}

export const NAV_ITEMS: Array<{
 href: string;
 label: string;
 module: PermissionModule;
 icon: string;
 group: 'command' | 'manufacturing' | 'distributor' | 'retail' | 'governance';
}> = [
 { href: '/dashboard', label: 'Pusat Kawalan', module: 'reports', icon: 'LayoutDashboard', group: 'command' },
 { href: '/admin', label: 'Admin', module: 'user_management', icon: 'ShieldCheck', group: 'command' },
 { href: '/factory', label: 'Kilang', module: 'stock_hq', icon: 'Factory', group: 'manufacturing' },
 { href: '/warehouse', label: HQ_DISTRIBUTOR_LABEL, module: 'stock_hq', icon: 'Warehouse', group: 'distributor' },
 { href: '/fleet', label: LOGISTIK_LABEL, module: 'fleet', icon: 'Truck', group: 'distributor' },
 { href: '/sales-agent', label: 'Portal Ejen', module: 'sales_agent', icon: 'Store', group: 'distributor' },
 { href: '/branches', label: 'Cawangan', module: 'reports', icon: 'Building2', group: 'retail' },
 { href: '/pos', label: 'POS', module: 'pos', icon: 'ShoppingCart', group: 'retail' },
 { href: '/inventory', label: 'Inventori', module: 'stock_kiosk', icon: 'Package', group: 'retail' },
 { href: '/shifts', label: 'Syif', module: 'shift', icon: 'Clock', group: 'retail' },
 { href: '/maintenance', label: 'Maintenance', module: 'maintenance', icon: 'Wrench', group: 'retail' },
 { href: '/hr', label: 'HR & Gaji', module: 'hr', icon: 'Users', group: 'governance' },
 { href: '/payroll', label: 'Gaji', module: 'payroll', icon: 'Wallet', group: 'governance' },
 { href: '/finance', label: 'Kewangan', module: 'finance', icon: 'Banknote', group: 'governance' },
 { href: '/bookings', label: 'Jadual Operasi', module: 'reports', icon: 'CalendarDays', group: 'governance' },
 { href: '/reports', label: 'Laporan', module: 'reports', icon: 'BarChart3', group: 'governance' },
 { href: '/approvals', label: 'Kelulusan', module: 'approval', icon: 'CheckSquare', group: 'governance' },
 { href: '/settings', label: 'Tetapan', module: 'user_management', icon: 'Settings', group: 'governance' },
];

export function getVisibleNavItems(
 role: UserRole,
 permissions: Map<string, PermissionLevel>,
 profile?: LegalEntityScopedProfile | null) {
 const items = NAV_ITEMS.filter((item) => {
 if (profile && !canAccessNavGroupForLegalEntity(item.group, profile)) return false;
 if (item.href === '/dashboard') return true;
 if (item.href === '/admin') return isAdminRole(role);
 if (item.href === '/payroll') return false;
 if (item.href === '/settings') {
 return isAdminRole(role) || role === 'AREA_MANAGER' || role === 'OPERATION_MANAGER';
 }
 if (item.href === '/maintenance') {
 return canAccessMaintenance(role);
 }
 if (item.href === '/hr') {
 return canAccessHr(role);
 }
 if (item.href === '/finance' && role === 'AREA_MANAGER') {
 return true;
 }
 if (item.href === '/sales-agent') {
 return canAccessSalesAgent(role);
 }
 if (item.href === '/factory') {
 return canAccessFactoryNav(role);
 }
 if (item.href === '/warehouse') {
 return (
 canAccessHqWarehouseNav(role) &&
 canAccessModule(role, item.module, permissions));
 }
 return canAccessModule(role, item.module, permissions);
 });

 return filterNavForSalesAgent(role, filterNavForRole(role, items));
}

const NAV_GROUP_LABELS: Record<
 (typeof NAV_ITEMS)[number]['group'],
 { label: string; description: string }
> = {
 command: { label: 'Pusat Kawalan', description: 'Ringkasan tugas utama' },
 manufacturing: { label: 'RKJ Manufacturing', description: 'Production & stok kilang' },
 distributor: { label: 'RKJ Distributor', description: 'HQ, logistik & ejen' },
 retail: { label: 'Roti Kaya Junus', description: 'Kiosk, POS & operasi cawangan' },
 governance: { label: 'Pengurusan', description: 'HR, kewangan, laporan & tetapan' },
};

const NAV_GROUP_ORDER: Array<(typeof NAV_ITEMS)[number]['group']> = [
 'command',
 'manufacturing',
 'distributor',
 'retail',
 'governance',
];

export function getVisibleNavGroups(
 role: UserRole,
 permissions: Map<string, PermissionLevel>,
 profile?: LegalEntityScopedProfile | null) {
 const visible = getVisibleNavItems(role, permissions, profile);
 return NAV_GROUP_ORDER.map((group) => ({...NAV_GROUP_LABELS[group],
 group,
 items: visible.filter((item) => item.group === group),
 })).filter((group) => group.items.length > 0);
}

export function getNavLabelForPath(pathname: string): string {
 if (pathname === '/profile' || pathname.startsWith('/profile/')) {
 return 'Profil Saya';
 }
 const exact = NAV_ITEMS.find((item) => item.href === pathname);
 if (exact) return exact.label;
 const prefix = NAV_ITEMS.find(
 (item) => item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
 return prefix?.label ?? 'Papan Pemuka';
}
