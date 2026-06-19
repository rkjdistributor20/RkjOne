import { createClient } from '@/lib/supabase/server';
import type { ProfileWithBranch } from '@/types/database';

export async function getCurrentProfile(): Promise<ProfileWithBranch | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `
      *,
      branch:branches(*),
      region:regions(*)
    `
    )
    .eq('id', user.id)
    .single();

  return profile as ProfileWithBranch | null;
}

export async function getRolePermissions(organizationId: string, role: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('role_permissions')
    .select('module, permission')
    .eq('organization_id', organizationId)
    .eq('role', role);

  return data ?? [];
}

export async function requireAuth() {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error('Unauthorized');
  }
  return profile;
}
