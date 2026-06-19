import type { PermissionLevel, PermissionModule, UserRole } from '@/types/enums';

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
  { href: '/dashboard', label: 'Dashboard', module: 'reports', icon: 'LayoutDashboard' },
  { href: '/pos', label: 'POS', module: 'pos', icon: 'ShoppingCart' },
  { href: '/shifts', label: 'Shifts', module: 'shift', icon: 'Clock' },
  { href: '/inventory', label: 'Inventory', module: 'stock_kiosk', icon: 'Package' },
  { href: '/warehouse', label: 'Warehouse', module: 'stock_hq', icon: 'Warehouse' },
  { href: '/fleet', label: 'Fleet', module: 'fleet', icon: 'Truck' },
  { href: '/payroll', label: 'Payroll', module: 'payroll', icon: 'Wallet' },
  { href: '/finance', label: 'Finance', module: 'finance', icon: 'Banknote' },
  { href: '/reports', label: 'Reports', module: 'reports', icon: 'BarChart3' },
  { href: '/approvals', label: 'Approvals', module: 'approval', icon: 'CheckSquare' },
  { href: '/settings', label: 'Settings', module: 'user_management', icon: 'Settings' },
];

export function getVisibleNavItems(
  role: UserRole,
  permissions: Map<string, PermissionLevel>
) {
  return NAV_ITEMS.filter((item) => {
    if (item.href === '/dashboard') return true;
    if (item.href === '/settings') return isAdminRole(role);
    return canAccessModule(role, item.module, permissions);
  });
}
