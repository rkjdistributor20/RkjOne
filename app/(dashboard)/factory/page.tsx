import { redirect } from 'next/navigation';
import { FactoryDashboard } from '@/components/warehouse/factory-dashboard';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessFactoryNav } from '@/lib/auth/stock-access';

export default async function FactoryPage() {
 const profile = await getCurrentProfile();
 if (!profile) {
 redirect('/login');
 }
 const legalEntityCode = profile.legal_entity?.code ?? null;
 if (profile.role === 'OPERATION_MANAGER' && legalEntityCode !== 'RKJ_MFG') {
 redirect('/dashboard');
 }
 if (!canAccessFactoryNav(profile.role)) {
 redirect('/warehouse');
 }
 return <FactoryDashboard />;
}
