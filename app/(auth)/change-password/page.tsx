import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { getCurrentProfile } from '@/lib/auth/session';

export default async function ChangePasswordPage() {
 const profile = await getCurrentProfile();

 if (!profile) {
 redirect('/login');
 }

 if (!profile.must_change_password) {
 redirect('/dashboard');
 }

 return <ChangePasswordForm />;
}
