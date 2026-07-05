import { createClient } from '@/lib/supabase/server';
import type { Branch, Profile, ProfileWithBranch } from '@/types/database';

export async function getCurrentProfile(): Promise<ProfileWithBranch | null> {
 const supabase = await createClient();

 const {
 data: { user },
 } = await supabase.auth.getUser();

 if (!user) return null;

 const { data: profile, error } = await supabase.from('profiles').select(
 `
 *,
 branch:branches(id, branch_code, branch_name, area, region_id, status),
 legal_entity:legal_entities(id, code, name, legal_name, scope, status, sort_order)
 `).eq('id', user.id).maybeSingle();

 if (profile && !error) {
 return profile as ProfileWithBranch;
 }

 // Fallback if embed fails (e.g. RLS) - load profile + branch separately
 const { data: base } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

 if (!base) return null;

 const row = base as Profile;
 let branch: Branch | null = null;
 let legalEntity: ProfileWithBranch['legal_entity'] = null;
 if (row.branch_id) {
 const { data: branchRow } = await supabase.from('branches').select('id, branch_code, branch_name, area, region_id, status').eq('id', row.branch_id).maybeSingle();
 branch = branchRow as Branch | null;
 }

 const legalEntityId = (row as Profile & { legal_entity_id?: string | null }).legal_entity_id;
 if (legalEntityId) {
 const { data: legalEntityRow } = await supabase.from('legal_entities').select('id, organization_id, code, name, legal_name, scope, status, sort_order').eq('id', legalEntityId).maybeSingle();
 legalEntity = legalEntityRow as ProfileWithBranch['legal_entity'];
 }

 return {...row, branch, legal_entity: legalEntity } as ProfileWithBranch;
}

export async function getRolePermissions(organizationId: string, role: string) {
 const supabase = await createClient();

 const { data } = await supabase.from('role_permissions').select('module, permission').eq('organization_id', organizationId).eq('role', role);

 return data ?? [];
}

export async function requireAuth() {
 const profile = await getCurrentProfile();

 if (!profile) {
 throw new Error('Unauthorized');
 }

 return profile;
}
