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

  const deployCommit =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? undefined;

  if (profile.role === 'AREA_MANAGER') {
    const { AreaManagerInventoryDashboard } = await import(
      '@/components/inventory/area-manager-inventory-dashboard'
    );
    return (
      <AreaManagerInventoryDashboard
        serverProfile={{
          role: profile.role,
          branch_id: profile.branch_id,
          region_id: profile.region_id,
          full_name: profile.full_name,
        }}
        deployCommit={deployCommit}
      />
    );
  }

  const { InventoryDashboard } = await import('@/components/inventory/inventory-dashboard');
  return <InventoryDashboard />;
}
