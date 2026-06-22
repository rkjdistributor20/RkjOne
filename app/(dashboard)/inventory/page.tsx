import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { InventoryDashboard } from '@/components/inventory/inventory-dashboard';

export const dynamic = 'force-dynamic';

/** Inventori HQ / OM / Staf — bukan Area Manager */
export default async function InventoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }

  if (profile.role === 'AREA_MANAGER') {
    redirect('/inventory/kawasan');
  }

  return <InventoryDashboard />;
}
