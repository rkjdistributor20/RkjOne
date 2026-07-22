import type { UserRole } from '@/types/enums';
import { isAreaManagerAllowedPath } from '@/lib/auth/area-manager-access';
import { isSalesAgentAllowedPath } from '@/lib/auth/sales-agent-access';

type RouteProfile = {
 role?: string | null;
 legalEntityCode?: string | null;
};

const SHARED_PATHS = ['/dashboard', '/profile', '/change-password'] as const;

const ROLE_PATHS: Partial<Record<UserRole, readonly string[]>> = {
 HR: [...SHARED_PATHS, '/hr', '/reports', '/bookings'],
 FINANCE: [...SHARED_PATHS, '/finance', '/hr', '/reports', '/bookings'],
 CEO_FACTORY: [...SHARED_PATHS, '/factory', '/hr', '/reports', '/bookings', '/approvals'],
 DRIVER: [...SHARED_PATHS, '/fleet', '/maintenance', '/hr'],
 MAINTENANCE_MANAGER: [...SHARED_PATHS, '/maintenance', '/shifts', '/hr', '/reports', '/bookings'],
};

const ENTITY_PATHS: Record<string, readonly string[]> = {
 RKJ_MFG: ['/factory', '/shifts', '/maintenance'],
 RKJ_DIST: ['/warehouse', '/fleet', '/sales-agent', '/maintenance'],
 RKJ: ['/branches', '/pos', '/inventory', '/shifts', '/maintenance'],
};

function matchesPath(pathname: string, allowedPaths: readonly string[]) {
 return allowedPaths.some(
  (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

function operationManagerPaths(legalEntityCode?: string | null) {
 const entityPaths = legalEntityCode ? ENTITY_PATHS[legalEntityCode] ?? [] : [];
 return [
  ...SHARED_PATHS,
  ...entityPaths,
  '/hr',
  '/reports',
  '/bookings',
  '/approvals',
  '/settings',
 ];
}

function staffPaths(legalEntityCode?: string | null) {
 const entityPaths = legalEntityCode ? ENTITY_PATHS[legalEntityCode] ?? [] : [];
 return [...SHARED_PATHS, ...entityPaths, '/hr', '/bookings'];
}

/**
 * Coarse page boundary for authenticated dashboard routes. Row-level ownership
 * and mutation permissions remain enforced by page/API guards and Supabase RLS.
 */
export function isDashboardRouteAllowed(pathname: string, profile: RouteProfile): boolean {
 const role = profile.role as UserRole | undefined;
 if (!role) return false;
 if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
 if (role === 'AREA_MANAGER') return isAreaManagerAllowedPath(pathname);
 if (role === 'SALES_AGENT') return isSalesAgentAllowedPath(pathname);
 if (role === 'OPERATION_MANAGER') {
  return matchesPath(pathname, operationManagerPaths(profile.legalEntityCode));
 }
 if (role === 'STAFF') {
  return matchesPath(pathname, staffPaths(profile.legalEntityCode));
 }
 return matchesPath(pathname, ROLE_PATHS[role] ?? SHARED_PATHS);
}
