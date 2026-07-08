import { redirect } from 'next/navigation';
import { AdminCommandCenter } from '@/components/admin/admin-command-center';
import { getCurrentProfile } from '@/lib/auth/session';
import { isAdminRole } from '@/lib/auth/permissions';
import { loadAdminOverview } from '@/lib/admin/overview';
import { createServiceClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
 const profile = await getCurrentProfile();

 if (!profile) {
 redirect('/login');
 }

 if (!isAdminRole(profile.role)) {
 redirect('/dashboard');
 }

 const service = (await createServiceClient()) as unknown as SupabaseClient;
 const overview = await loadAdminOverview(service, profile.organization_id);

 return (
 <AdminCommandCenter
 adminName={profile.full_name ?? 'Pentadbir'}
 overview={overview}
 />);
}
