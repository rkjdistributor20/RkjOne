import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!MANAGER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Hanya Hanif/pengurusan boleh kemas kini maintenance' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const status = String(body.status ?? '').trim();
  const allowed = ['NEW', 'REVIEWING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS', 'RESOLVED', 'CANCELLED'];
  if (status && !allowed.includes(status)) {
    return NextResponse.json({ error: 'Status tidak sah' }, { status: 400 });
  }

  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  if (typeof body.manager_notes === 'string') patch.manager_notes = body.manager_notes;
  if (typeof body.substitute_status === 'string') patch.substitute_status = body.substitute_status;
  if (status === 'RESOLVED') patch.resolved_at = new Date().toISOString();
  if (profile.role === 'MAINTENANCE_MANAGER') patch.assigned_to = profile.id;

  const { data, error } = await (supabase as SupabaseClient)
    .from('maintenance_reports')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select('id, status, substitute_status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ report: data });
}
