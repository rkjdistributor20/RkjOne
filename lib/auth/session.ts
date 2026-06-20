import { createClient } from '@/lib/supabase/server';
import type { Branch, Profile, ProfileWithBranch } from '@/types/database';

export async function getCurrentProfile(): Promise<ProfileWithBranch | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      `
      *,
      branch:branches(id, branch_code, branch_name, area, region_id, status)
    `
    )
    .eq('id', user.id)
    .maybeSingle();

  if (profile && !error) {
    return profile as ProfileWithBranch;
  }

  // Fallback if embed fails (e.g. RLS) — load profile + branch separately
  const { data: base } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!base) return null;

  const row = base as Profile;
  let branch: Branch | null = null;
  if (row.branch_id) {
    const { data: branchRow } = await supabase
      .from('branches')
      .select('id, branch_code, branch_name, area, region_id, status')
      .eq('id', row.branch_id)
      .maybeSingle();
    branch = branchRow as Branch | null;
  }

  return { ...row, branch } as ProfileWithBranch;
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