import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertSettingsAdmin(await getCurrentProfile());
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.branch_name !== undefined) updates.branch_name = body.branch_name;
    if (body.area !== undefined) updates.area = body.area;
    if (body.manager_name !== undefined) updates.manager_name = body.manager_name;
    if (body.region_id !== undefined) updates.region_id = body.region_id;

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Tiada medan untuk kemaskini' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await (supabase as SupabaseClient)
      .from('branches')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .select('id, branch_code, branch_name, status, area, region_id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (body.status !== undefined && data) {
      await (supabase as SupabaseClient)
        .from('inventory_locations')
        .update({ is_active: body.status === 'ACTIVE', updated_at: new Date().toISOString() })
        .eq('branch_id', id)
        .eq('location_type', 'BRANCH_KIOSK');
    }

    return NextResponse.json({ branch: data });
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
    assertSettingsAdmin(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await inventoryRpc(supabase, 'admin_delete_branch', {
      p_branch_id: id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
