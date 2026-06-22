import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Satu URL /inventory — server pilih komponen ikut role.
 * AM: area-manager-inventory-dashboard (tiada dropdown HQ)
 * Lain: inventory-dashboard
 */
export default async function InventoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  if (profile.role === 'AREA_MANAGER') {
    const { AreaManagerInventoryDashboard } = await import(
      '@/components/inventory/area-manager-inventory-dashboard'
    );
    return <AreaManagerInventoryDashboard />;
  }

  const { InventoryDashboard } = await import('@/components/inventory/inventory-dashboard');
  return <InventoryDashboard />;
}
