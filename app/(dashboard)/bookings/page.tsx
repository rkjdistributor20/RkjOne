import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { BookingsDashboard } from '@/components/bookings/bookings-dashboard';
import { canAccessBookings } from '@/lib/auth/permissions';

export default async function BookingsPage() {
 const profile = await getCurrentProfile();
 if (!profile) redirect('/login');
 if (!canAccessBookings(profile.role)) redirect('/dashboard');

 return <BookingsDashboard />;
}
