import type { PermissionModule } from '@/types/enums';
import { parseDashboardMetadata } from '@/lib/settings/dashboard-advisor';
import type { DashboardProfileId } from '@/lib/settings/dashboard-advisor';

const MODULE_HREF: Partial<Record<PermissionModule, { href: string; label: string; description: string }>> = {
  shift: { href: '/shifts', label: 'Syif & Kehadiran', description: 'Clock-in / clock-out' },
  pos: { href: '/pos', label: 'POS Kaunter', description: 'Jualan harian' },
  stock_hq: { href: '/factory', label: 'Kilang / Stok', description: 'Pengeluaran & stok' },
  fleet: { href: '/fleet', label: 'Logistik', description: 'Penghantaran' },
  stock_kiosk: { href: '/inventory', label: 'Inventori', description: 'Stok cawangan' },
  hr: { href: '/hr', label: 'HR Syarikat', description: 'Maklumat staf' },
  payroll: { href: '/profile', label: 'Gaji Saya', description: 'Slip & gaji' },
};

const PROFILE_DEFAULT_MODULES: Record<DashboardProfileId, PermissionModule[]> = {
  OWNER_GROUP: ['reports', 'payroll'],
  HQ_OPERATIONS: ['pos', 'shift'],
  HR_COMPANY: ['hr', 'payroll'],
  FINANCE: ['finance'],
  AREA_MANAGER: ['shift', 'pos'],
  STAFF_KIOSK: ['shift', 'pos'],
  DIST_OPERATIONS: ['stock_hq', 'fleet'],
  FACTORY_STAFF: ['stock_hq', 'shift'],
  LOGISTICS: ['fleet'],
  MAINTENANCE: ['maintenance' as PermissionModule],
};

export function staffQuickActionsFromMetadata(metadata: unknown) {
  const dash = parseDashboardMetadata(metadata);
  let modules: PermissionModule[] = dash.profile_id
    ? PROFILE_DEFAULT_MODULES[dash.profile_id]
    : ['shift', 'pos'];

  if (
    metadata &&
    typeof metadata === 'object' &&
    Array.isArray((metadata as Record<string, unknown>).dashboard_modules)
  ) {
    modules = (metadata as Record<string, unknown>).dashboard_modules as PermissionModule[];
  }

  return modules
    .map((m: PermissionModule) => MODULE_HREF[m])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
