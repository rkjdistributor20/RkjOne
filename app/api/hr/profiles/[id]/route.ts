import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertCanManageHrPeople } from '@/lib/hr/hr-access';
import { resolveLegalEntityId } from '@/lib/settings/legal-entity';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const PROTECTED_ROLES = ['SUPER_ADMIN'] as const;

async function loadProfileTarget(
  supabase: SupabaseClient,
  organizationId: string,
  id: string
) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, status, legal_entity_id, branch_id, region_id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    role: string;
    status: string;
    legal_entity_id: string | null;
    branch_id: string | null;
    region_id: string | null;
  } | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManageHrPeople(await getCurrentProfile());
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();
    const service = await createServiceClient();

    const existing = await loadProfileTarget(supabase, profile.organization_id, id);
    if (!existing) {
      return NextResponse.json({ error: 'Pengguna tidak dijumpai' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.full_name != null) updates.full_name = String(body.full_name).trim();
    if (body.phone != null) updates.phone = body.phone ? String(body.phone).trim() : null;

    if (body.legal_entity_code != null) {
      updates.legal_entity_id = await resolveLegalEntityId(
        supabase,
        profile.organization_id,
        body.legal_entity_code
      );
    }

    if (body.status != null) {
      if (
        PROTECTED_ROLES.includes(existing.role as (typeof PROTECTED_ROLES)[number]) &&
        body.status !== 'ACTIVE'
      ) {
        return NextResponse.json(
          { error: 'Tidak boleh nyahaktif Pentadbir Utama' },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Tiada perubahan' }, { status: 400 });
    }

    const { data: updated, error } = await (service as SupabaseClient)
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .select(
        'id, full_name, email, phone, role, status, legal_entity_id, legal_entity:legal_entities(code, name, legal_name)'
      )
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: linkedStaffRow } = await supabase
      .from('staff')
      .select('id')
      .eq('profile_id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    const linkedStaffId = (linkedStaffRow as { id: string } | null)?.id;

    if (linkedStaffId) {
      const staffUpdates: Record<string, unknown> = {};
      if (updates.full_name) staffUpdates.full_name = updates.full_name;
      if (updates.legal_entity_id) staffUpdates.legal_entity_id = updates.legal_entity_id;
      if (updates.status) staffUpdates.status = updates.status;
      if (Object.keys(staffUpdates).length > 0) {
        await (service as SupabaseClient)
          .from('staff')
          .update(staffUpdates)
          .eq('id', linkedStaffId);
      }
    }

    return NextResponse.json({ profile: updated });
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
    const profile = assertCanManageHrPeople(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();
    const service = await createServiceClient();

    const existing = await loadProfileTarget(supabase, profile.organization_id, id);
    if (!existing) {
      return NextResponse.json({ error: 'Pengguna tidak dijumpai' }, { status: 404 });
    }

    if (PROTECTED_ROLES.includes(existing.role as (typeof PROTECTED_ROLES)[number])) {
      return NextResponse.json(
        { error: 'Tidak boleh padam Pentadbir Utama' },
        { status: 400 }
      );
    }

    const { error } = await (service as SupabaseClient)
      .from('profiles')
      .update({ status: 'INACTIVE' })
      .eq('id', id)
      .eq('organization_id', profile.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: linkedStaffRow } = await supabase
      .from('staff')
      .select('id')
      .eq('profile_id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    const linkedStaffId = (linkedStaffRow as { id: string } | null)?.id;

    if (linkedStaffId) {
      await (service as SupabaseClient)
        .from('staff')
        .update({ status: 'INACTIVE' })
        .eq('id', linkedStaffId);
    }

    return NextResponse.json({ result: { id, deactivated: true } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
