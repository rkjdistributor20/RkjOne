import type { PermissionLevel, PermissionModule, UserRole } from '@/types/enums';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { canAccessFactoryNav, canAccessHqWarehouseNav } from '@/lib/auth/stock-access';
import {
  filterNavForRole,
} from '@/lib/auth/area-manager-access';
import { filterNavForSalesAgent } from '@/lib/auth/sales-agent-access';

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
  required: PermissionLevel = 'VIEW'
): boolean {
  const granted = permissions.get(module) ?? 'NONE';
  return LEVEL_RANK[granted] >= LEVEL_RANK[required];
}

export function canAccessModule(
  role: UserRole,
  module: PermissionModule,
  permissions: Map<string, PermissionLevel>
): boolean {
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
  return ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(role);
}

export function buildPermissionMap(
  rows: Array<{ module: string; permission: PermissionLevel }>
): Map<string, PermissionLevel> {
  return new Map(rows.map((r) => [r.module, r.permission]));
}

export const NAV_ITEMS: Array<{
  href: string;
  label: string;
  module: PermissionModule;
  icon: string;
}> = [
  { href: '/dashboard', label: 'Papan Pemuka', module: 'reports', icon: 'LayoutDashboard' },
  { href: '/pos', label: 'POS', module: 'pos', icon: 'ShoppingCart' },
  { href: '/branches', label: 'Cawangan', module: 'reports', icon: 'Building2' },
  { href: '/shifts', label: 'Syif', module: 'shift', icon: 'Clock' },
  { href: '/inventory', label: 'Inventori', module: 'stock_kiosk', icon: 'Package' },
  { href: '/factory', label: 'Kilang', module: 'stock_hq', icon: 'Factory' },
  { href: '/warehouse', label: HQ_DISTRIBUTOR_LABEL, module: 'stock_hq', icon: 'Warehouse' },
  { href: '/fleet', label: LOGISTIK_LABEL, module: 'fleet', icon: 'Truck' },
  { href: '/payroll', label: 'Gaji', module: 'payroll', icon: 'Wallet' },
  { href: '/hr', label: 'HR Syarikat', module: 'hr', icon: 'Users' },
  { href: '/finance', label: 'Kewangan', module: 'finance', icon: 'Banknote' },
  { href: '/reports', label: 'Laporan', module: 'reports', icon: 'BarChart3' },
  { href: '/approvals', label: 'Kelulusan', module: 'approval', icon: 'CheckSquare' },
  { href: '/maintenance', label: 'Maintenance', module: 'maintenance', icon: 'Wrench' },
  { href: '/sales-agent', label: 'Portal Ejen', module: 'sales_agent', icon: 'Store' },
  { href: '/settings', label: 'Tetapan', module: 'user_management', icon: 'Settings' },
];

export function getVisibleNavItems(
  role: UserRole,
  permissions: Map<string, PermissionLevel>
) {
  const items = NAV_ITEMS.filter((item) => {
    if (item.href === '/dashboard') return true;
    if (item.href === '/settings') {
      return isAdminRole(role) || role === 'AREA_MANAGER' || role === 'OPERATION_MANAGER';
    }
    if (item.href === '/maintenance') {
      return canAccessMaintenance(role);
    }
    if (item.href === '/hr') {
      return canAccessHr(role);
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
        canAccessModule(role, item.module, permissions)
      );
    }
    return canAccessModule(role, item.module, permissions);
  });

  return filterNavForSalesAgent(role, filterNavForRole(role, items));
}

export function getNavLabelForPath(pathname: string): string {
  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return 'Profil Saya';
  }
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.label;
  const prefix = NAV_ITEMS.find(
    (item) => item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)
  );
  return prefix?.label ?? 'Papan Pemuka';
}
