import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (body.min_threshold !== undefined) updates.min_threshold = body.min_threshold;
  if (body.critical_threshold !== undefined) updates.critical_threshold = body.critical_threshold;
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  updates.updated_at = new Date().toISOString();

  const { error } = await (supabase as SupabaseClient)
    .from('stock_items')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: { id, status: 'UPDATED' } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertSettingsAdmin(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await (supabase as SupabaseClient)
      .from('stock_items')
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: { id, deleted: true } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
