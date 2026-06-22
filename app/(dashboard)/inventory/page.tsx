import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { InventoryDashboard } from '@/components/inventory/inventory-dashboard';
import { AreaManagerInventoryDashboard } from '@/components/inventory/area-manager-inventory-dashboard';

export default async function InventoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  if (profile.role === 'AREA_MANAGER') {
    return <AreaManagerInventoryDashboard />;
  }

  return <InventoryDashboard />;
}
