import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import {
  assertCanManagePersonnel,
  assertUserTargetInScope,
} from '@/lib/settings/personnel-access';
import { resolveLegalEntityIdForRole } from '@/lib/settings/legal-entity';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const { id } = await params;
    const body = await request.json();

    if (id === profile.id && body.status === 'INACTIVE') {
      return NextResponse.json({ error: 'Tidak boleh nyahaktifkan akaun sendiri' }, { status: 400 });
    }

    await assertUserTargetInScope(await createClient(), profile, id);

    const updates: Record<string, unknown> = {};
    if (body.full_name !== undefined) updates.full_name = body.full_name;
    if (body.status !== undefined) updates.status = body.status;
    if (isSettingsAdmin(profile.role)) {
      if (body.role !== undefined) updates.role = body.role;
      if (body.branch_id !== undefined) updates.branch_id = body.branch_id;
      if (body.region_id !== undefined) updates.region_id = body.region_id;
    }

    const client = isSettingsAdmin(profile.role)
      ? await createServiceClient()
      : await createClient();

    if (body.role !== undefined && isSettingsAdmin(profile.role)) {
      updates.legal_entity_id = await resolveLegalEntityIdForRole(
        client as SupabaseClient,
        profile.organization_id,
        body.role
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await (client as SupabaseClient)
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .select('id, full_name, email, role, status')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ user: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const { id } = await params;

    if (id === profile.id) {
      return NextResponse.json({ error: 'Tidak boleh padam akaun sendiri' }, { status: 400 });
    }

    const supabase = await createClient();
    await assertUserTargetInScope(supabase, profile, id);

    const service = await createServiceClient();
    const { error } = await service.auth.admin.deleteUser(id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: { id, deleted: true } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
