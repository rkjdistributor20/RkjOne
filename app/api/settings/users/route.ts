import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/session';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import {
  assertBranchInPersonnelScope,
  assertCanManagePersonnel,
  assertRoleCreatable,
  isAreaManagerRole,
  loadPersonnelScope,
} from '@/lib/settings/personnel-access';
import { resolveLegalEntityIdForRole } from '@/lib/settings/legal-entity';
import {
  loadSettingsUsersForAdmin,
  loadSettingsUsersFromProfiles,
} from '@/lib/settings/users-list';
import {
  adviseUserDashboard,
  dashboardMetadataPatch,
  mergeMetadata,
} from '@/lib/settings/dashboard-advisor';

import type { UserRole } from '@/types/enums';

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

  try {
    const admin = createAdminClient();

    if (isSettingsAdmin(profile.role)) {
      const { users, staff_total, login_total } = await loadSettingsUsersForAdmin(
        admin,
        profile.organization_id
      );
      return NextResponse.json({
        users,
        total: users.length,
        staff_total,
        login_total,
      });
    }

    const users = await loadSettingsUsersFromProfiles(admin, profile.organization_id, {
      role: 'STAFF',
      branchIds: scope.branchIds,
    });

    return NextResponse.json({ users, total: users.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal muat pengguna' },
      { status: 500 }
    );
  }
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
        legal_entity_id: await resolveLegalEntityIdForRole(
          service as SupabaseClient,
          profile.organization_id,
          role
        ),
        status: 'ACTIVE',
        must_change_password: true,
      })
      .eq('id', authData.user.id);

    if (profileErr) {
      await service.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    if (isSettingsAdmin(profile.role)) {
      const advice = adviseUserDashboard({
        role: role as UserRole,
        legal_entity_code: null,
        is_group_owner: false,
      });
      await (service as SupabaseClient)
        .from('profiles')
        .update({
          metadata: mergeMetadata(null, dashboardMetadataPatch(advice)),
        })
        .eq('id', authData.user.id);
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

