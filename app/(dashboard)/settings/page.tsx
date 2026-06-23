import { Suspense } from 'react';
import { SettingsDashboard } from '@/components/settings/settings-dashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentProfile } from '@/lib/auth/session';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import { loadSettingsUsersForAdmin } from '@/lib/settings/users-list';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SettingsUser } from '@/lib/settings/types';

export const dynamic = 'force-dynamic';

async function loadInitialUsers() {
  const profile = await getCurrentProfile();
  if (!profile || !isSettingsAdmin(profile.role)) return null;

  try {
    const admin = createAdminClient();
    const data = await loadSettingsUsersForAdmin(admin, profile.organization_id);
    return data;
  } catch (err) {
    console.error('[settings/users preload]', err);
    return null;
  }
}

export default async function SettingsPage() {
  const initialUsers = await loadInitialUsers();

  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SettingsDashboard
        initialUsers={
          initialUsers
            ? {
                users: initialUsers.users as SettingsUser[],
                staff_total: initialUsers.staff_total,
                login_total: initialUsers.login_total,
              }
            : undefined
        }
      />
    </Suspense>
  );
}
