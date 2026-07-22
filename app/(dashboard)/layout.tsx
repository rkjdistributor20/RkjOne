import { redirect } from 'next/navigation';
import { AuthProvider } from '@/components/layout/auth-provider';
import { getCurrentProfile, getRolePermissions } from '@/lib/auth/session';
import { getPosDeviceContext, isPosKioskBypassed } from '@/lib/pos/device-auth';

export default async function DashboardLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const profile = await getCurrentProfile();

 if (!profile) {
 redirect('/login');
 }

 if (profile.must_change_password) {
 redirect('/change-password');
 }

 const [permissions, posDeviceContext, kioskBypassed] = await Promise.all([
 getRolePermissions(profile.organization_id, profile.role),
 getPosDeviceContext(profile),
 isPosKioskBypassed(profile.id),
 ]);

 return (
 <AuthProvider
 profile={profile}
 permissions={permissions}
 posDeviceContext={posDeviceContext}
 kioskBypassed={kioskBypassed}
 >
 {children}
 </AuthProvider>);
}
