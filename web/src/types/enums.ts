export const USER_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'OPERATION_MANAGER',
  'CEO_FACTORY',
  'AREA_MANAGER',
  'DRIVER',
  'STAFF',
  'FINANCE',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSION_MODULES = [
  'pos',
  'shift',
  'stock_kiosk',
  'stock_hq',
  'fleet',
  'payroll',
  'finance',
  'reports',
  'user_management',
  'approval',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_LEVELS = [
  'NONE',
  'VIEW',
  'VIEW_AREA',
  'FULL',
  'FULL_OWN',
  'OWN',
] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const LOCATION_TYPES = [
  'FACTORY',
  'HQ_WAREHOUSE',
  'FLEET_VEHICLE',
  'BRANCH_KIOSK',
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export const REGION_CODES = ['UTARA', 'TENGAH', 'SELATAN'] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  OPERATION_MANAGER: 'Operation Manager',
  CEO_FACTORY: 'CEO Factory',
  AREA_MANAGER: 'Area Manager',
  DRIVER: 'Driver',
  STAFF: 'Staff',
  FINANCE: 'Finance',
};

export const MODULE_LABELS: Record<PermissionModule, string> = {
  pos: 'POS',
  shift: 'Shift Management',
  stock_kiosk: 'Stock (Kiosk)',
  stock_hq: 'Stock (HQ)',
  fleet: 'Fleet',
  payroll: 'Payroll',
  finance: 'Finance',
  reports: 'Reports',
  user_management: 'User Management',
  approval: 'Approval',
};
