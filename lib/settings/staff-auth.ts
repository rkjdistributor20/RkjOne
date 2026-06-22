import type { SupabaseClient } from '@supabase/supabase-js';

export function staffLoginEmail(staffCode: string): string {
  return `${staffCode.trim().toLowerCase()}@rkj.com`;
}

/** Kata laluan awal — mudah dikongsi manager kepada staf */
export function generateStaffPortalPassword(staffCode: string): string {
  const code = staffCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `Rkj${code}@${suffix}`;
}

async function findAuthUserByEmail(service: SupabaseClient, email: string) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

type ProvisionInput = {
  staffId: string;
  staffCode: string;
  fullName: string;
  branchId: string;
  regionId: string | null;
  organizationId: string;
  legalEntityId: string | null;
  createdBy: string;
};

export async function provisionStaffPortalAccount(
  service: SupabaseClient,
  input: ProvisionInput
): Promise<{ login_email: string; portal_password: string; profile_id: string }> {
  const email = staffLoginEmail(input.staffCode);
  const password = generateStaffPortalPassword(input.staffCode);

  const existing = await findAuthUserByEmail(service, email);

  let userId: string;

  if (existing) {
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        role: 'STAFF',
        employee_code: input.staffCode,
      },
    });
    if (error) throw new Error(error.message);
    userId = existing.id;
  } else {
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        role: 'STAFF',
        employee_code: input.staffCode,
      },
    });
    if (authErr) throw new Error(authErr.message);
    userId = authData.user.id;
  }

  const { error: profileErr } = await service.from('profiles').update({
    organization_id: input.organizationId,
    full_name: input.fullName,
    email,
    role: 'STAFF',
    branch_id: input.branchId,
    region_id: input.regionId,
    employee_code: input.staffCode,
    legal_entity_id: input.legalEntityId,
    status: 'ACTIVE',
    must_change_password: true,
  }).eq('id', userId);

  if (profileErr) throw new Error(profileErr.message);

  const { error: linkErr } = await service
    .from('staff')
    .update({ profile_id: userId })
    .eq('id', input.staffId);

  if (linkErr) throw new Error(linkErr.message);

  const { error: credErr } = await service.from('staff_portal_credentials').upsert(
    {
      staff_id: input.staffId,
      organization_id: input.organizationId,
      login_email: email,
      portal_password: password,
      updated_by: input.createdBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'staff_id' }
  );

  if (credErr) throw new Error(credErr.message);

  return { login_email: email, portal_password: password, profile_id: userId };
}

export async function resetStaffPortalPassword(
  service: SupabaseClient,
  staffId: string,
  staffCode: string,
  updatedBy: string
): Promise<{ login_email: string; portal_password: string }> {
  const { data: cred } = await service
    .from('staff_portal_credentials')
    .select('login_email')
    .eq('staff_id', staffId)
    .maybeSingle();

  if (!cred?.login_email) {
    throw new Error('Staf tiada akaun portal — cipta akaun dahulu');
  }

  const password = generateStaffPortalPassword(staffCode);

  const { data: staffRow } = await service
    .from('staff')
    .select('profile_id')
    .eq('id', staffId)
    .single();

  if (!staffRow?.profile_id) {
    throw new Error('Profil login staf tidak dijumpai');
  }

  const { error: authErr } = await service.auth.admin.updateUserById(staffRow.profile_id, {
    password,
  });
  if (authErr) throw new Error(authErr.message);

  await service
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', staffRow.profile_id);

  const { error: credErr } = await service
    .from('staff_portal_credentials')
    .update({
      portal_password: password,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('staff_id', staffId);

  if (credErr) throw new Error(credErr.message);

  return { login_email: cred.login_email, portal_password: password };
}

export async function loadStaffPortalCredentials(
  service: SupabaseClient,
  staffId: string
) {
  const { data } = await service
    .from('staff_portal_credentials')
    .select('login_email, portal_password, updated_at')
    .eq('staff_id', staffId)
    .maybeSingle();

  return data as {
    login_email: string;
    portal_password: string;
    updated_at: string;
  } | null;
}

export async function loadStaffProfileMeta(
  service: SupabaseClient,
  profileId: string | null
) {
  if (!profileId) return null;
  const { data } = await service
    .from('profiles')
    .select('id, email, must_change_password, last_login_at, status')
    .eq('id', profileId)
    .maybeSingle();
  return data;
}
