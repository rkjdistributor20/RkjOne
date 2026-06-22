import type { PermissionLevel, PermissionModule, UserRole } from '@/types/enums';
import { canAccessFactoryNav, canAccessHqWarehouseNav } from '@/lib/auth/stock-access';
import {
  filterNavForRole,
} from '@/lib/auth/area-manager-access';

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
  { href: '/warehouse', label: 'Gudang HQ', module: 'stock_hq', icon: 'Warehouse' },
  { href: '/fleet', label: 'Armada', module: 'fleet', icon: 'Truck' },
  { href: '/payroll', label: 'Gaji', module: 'payroll', icon: 'Wallet' },
  { href: '/finance', label: 'Kewangan', module: 'finance', icon: 'Banknote' },
  { href: '/reports', label: 'Laporan', module: 'reports', icon: 'BarChart3' },
  { href: '/approvals', label: 'Kelulusan', module: 'approval', icon: 'CheckSquare' },
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

  return filterNavForRole(role, items);
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
