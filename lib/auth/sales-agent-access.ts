import type { UserRole } from '@/types/enums';

export const SALES_AGENT_HOME = '/sales-agent';

export const SALES_AGENT_ALLOWED_PATHS = [
  '/dashboard',
  SALES_AGENT_HOME,
  '/pos',
  '/profile',
  '/change-password',
] as const;

export function isSalesAgentRole(role: string): role is 'SALES_AGENT' {
  return role === 'SALES_AGENT';
}

export function isSalesAgentAllowedPath(pathname: string): boolean {
  return SALES_AGENT_ALLOWED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function filterNavForSalesAgent<T extends { href: string }>(role: UserRole, items: T[]): T[] {
  if (!isSalesAgentRole(role)) return items;
  return items.filter((item) =>
    (SALES_AGENT_ALLOWED_PATHS as readonly string[]).includes(item.href)
  );
}
