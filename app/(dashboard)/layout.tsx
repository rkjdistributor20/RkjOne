import { redirect } from 'next/navigation';
import { AuthProvider } from '@/components/layout/auth-provider';
import { getCurrentProfile, getRolePermissions } from '@/lib/auth/session';

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

 const permissions = await getRolePermissions(
 profile.organization_id,
 profile.role);

 return (
 <AuthProvider profile={profile} permissions={permissions}>
 {children}
 </AuthProvider>);
}
