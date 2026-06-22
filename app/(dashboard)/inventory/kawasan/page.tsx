import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { AreaManagerInventoryDashboard } from '@/components/inventory/area-manager-inventory-dashboard';

export const dynamic = 'force-dynamic';

/** Inventori Pengurus Kawasan — tiada import komponen HQ */
export default async function AreaManagerInventoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  if (profile.role !== 'AREA_MANAGER') {
    redirect('/inventory');
  }

  return <AreaManagerInventoryDashboard />;
}
