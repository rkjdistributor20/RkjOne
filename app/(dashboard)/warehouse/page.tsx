import { redirect } from 'next/navigation';
import { WarehouseDashboard } from '@/components/warehouse/warehouse-dashboard';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessFactoryNav, canAccessHqWarehouseNav } from '@/lib/auth/stock-access';

export default async function WarehousePage() {
 const profile = await getCurrentProfile();
 if (!profile) {
 redirect('/login');
 }
 if (!canAccessHqWarehouseNav(profile.role)) {
 redirect(canAccessFactoryNav(profile.role, profile.legal_entity?.code) ? '/factory' : '/dashboard');
 }
 return <WarehouseDashboard />;
}
