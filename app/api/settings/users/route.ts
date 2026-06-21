import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import {
  assertBranchInPersonnelScope,
  assertCanManagePersonnel,
  assertRoleCreatable,
  isAreaManagerRole,
  loadPersonnelScope,
} from '@/lib/settings/personnel-access';

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  branch_id: string | null;
  region_id: string | null;
  branch: { branch_name: string; branch_code: string } | null;
  region: { name: string; code: string } | null;
};

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    assertCanManagePersonnel(profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  let scope;
  try {
    scope = await loadPersonnelScope(supabase, profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }

  const service = await createServiceClient();
  let query = service
    .from('profiles')
    .select(
      'id, full_name, email, role, status, branch_id, region_id, branch:branches(branch_name, branch_code), region:regions(name, code)'
    )
    .eq('organization_id', profile.organization_id)
    .order('full_name');

  if (!isSettingsAdmin(profile.role)) {
    query = query.eq('role', 'STAFF');
    if (scope.branchIds !== null) {
      if (scope.branchIds.length === 0) {
        return NextResponse.json({ users: [], total: 0 });
      }
      query = query.in('branch_id', scope.branchIds);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data ?? []) as ProfileRow[];
  return NextResponse.json({ users, total: users.length });
}

export async function POST(request: Request) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.full_name ?? '').trim();
    const role = body.role ?? 'STAFF';

    if (!email || !fullName) {
      return NextResponse.json({ error: 'E-mel dan nama diperlukan' }, { status: 400 });
    }

    assertRoleCreatable(profile, role);

    const supabase = await createClient();
    const branchId = await assertBranchInPersonnelScope(
      supabase,
      profile,
      body.branch_id
    );

    let regionId: string | null = profile.region_id;
    if (branchId) {
      const { data: branch } = await supabase
        .from('branches')
        .select('region_id')
        .eq('id', branchId)
        .maybeSingle();
      regionId = (branch as { region_id: string } | null)?.region_id ?? regionId;
    }

    if (isAreaManagerRole(profile.role) && !branchId) {
      return NextResponse.json({ error: 'Cawangan wajib' }, { status: 400 });
    }

    const service = await createServiceClient();
    const tempPassword = body.password ?? 'RkjOne@2025';

    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });

    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

    const { error: profileErr } = await (service as SupabaseClient)
      .from('profiles')
      .update({
        organization_id: profile.organization_id,
        full_name: fullName,
        email,
        role,
        branch_id: branchId,
        region_id: regionId,
        employee_code: body.employee_code ?? null,
        status: 'ACTIVE',
        must_change_password: true,
      })
      .eq('id', authData.user.id);

    if (profileErr) {
      await service.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    return NextResponse.json({
      user: {
        id: authData.user.id,
        email,
        full_name: fullName,
        role,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
