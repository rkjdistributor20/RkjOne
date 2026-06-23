import type { UserRole } from '@/types/enums';

/** Laluan sidebar & halaman yang memang urusan Pengurus Kawasan */
export const AREA_MANAGER_INVENTORY_PATH = '/inventory';

export const AREA_MANAGER_ALLOWED_PATHS = [
  '/dashboard',
  AREA_MANAGER_INVENTORY_PATH,
  '/shifts',
  '/approvals',
  '/maintenance',
  '/settings',
  '/change-password',
  '/profile',
] as const;

export function isAreaManagerRole(role: string): role is 'AREA_MANAGER' {
  return role === 'AREA_MANAGER';
}

export function isAreaManagerAllowedPath(pathname: string): boolean {
  return AREA_MANAGER_ALLOWED_PATHS.some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`)
  );
}

export function isAreaManagerNavHref(href: string): boolean {
  return (AREA_MANAGER_ALLOWED_PATHS as readonly string[]).includes(href);
}

export function filterNavForRole<T extends { href: string }>(
  role: UserRole,
  items: T[]
): T[] {
  if (!isAreaManagerRole(role)) return items;
  return items.filter((item) => isAreaManagerNavHref(item.href));
}
