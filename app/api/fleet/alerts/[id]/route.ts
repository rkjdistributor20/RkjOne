import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const ACTION_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!ACTION_ROLES.has(profile.role)) {
  return NextResponse.json({ error: 'Tiada akses untuk mengurus amaran.' }, { status: 403 });
 }

 const { id } = await context.params;
 const body = await request.json() as { status?: string };
 if (!['ACKNOWLEDGED', 'RESOLVED'].includes(String(body.status))) {
  return NextResponse.json({ error: 'Status amaran tidak sah.' }, { status: 400 });
 }

 const now = new Date().toISOString();
 const status = body.status as 'ACKNOWLEDGED' | 'RESOLVED';
 const update = status === 'ACKNOWLEDGED'
  ? { status, acknowledged_by: profile.id, acknowledged_at: now, updated_at: now }
  : { status, resolved_by: profile.id, resolved_at: now, updated_at: now };
 const service = createAdminClient() as any;
 const { data, error } = await service
  .from('fleet_gps_alerts')
  .update(update)
  .eq('id', id)
  .eq('organization_id', profile.organization_id)
  .select('id')
  .maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 if (!data) return NextResponse.json({ error: 'Amaran tidak dijumpai.' }, { status: 404 });
 return NextResponse.json({ ok: true });
}
