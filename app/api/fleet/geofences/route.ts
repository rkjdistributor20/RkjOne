import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const MANAGE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);
const TYPES = new Set(['FACTORY', 'HQ', 'BRANCH', 'AGENT_PICKUP', 'HUB', 'OTHER']);

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!MANAGE_ROLES.has(profile.role)) return NextResponse.json({ error: 'Tiada akses untuk mencipta geofence.' }, { status: 403 });

 const body = await request.json() as {
  name?: string;
  geofence_type?: string;
  branch_id?: string | null;
  latitude?: number;
  longitude?: number;
  radius_m?: number;
 };
 const name = String(body.name ?? '').trim();
 const type = String(body.geofence_type ?? 'OTHER').toUpperCase();
 const latitude = Number(body.latitude);
 const longitude = Number(body.longitude);
 const radius = Math.round(Number(body.radius_m ?? 250));
 if (!name) return NextResponse.json({ error: 'Nama geofence diperlukan.' }, { status: 400 });
 if (!TYPES.has(type)) return NextResponse.json({ error: 'Jenis geofence tidak sah.' }, { status: 400 });
 if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
  return NextResponse.json({ error: 'Koordinat geofence tidak sah.' }, { status: 400 });
 }
 if (radius < 50 || radius > 5000) return NextResponse.json({ error: 'Radius mesti antara 50 hingga 5000 meter.' }, { status: 400 });

 const service = createAdminClient() as any;
 if (body.branch_id) {
  const { data: branch } = await service.from('branches').select('id').eq('id', body.branch_id).eq('organization_id', profile.organization_id).maybeSingle();
  if (!branch) return NextResponse.json({ error: 'Cawangan tidak dijumpai.' }, { status: 404 });
 }

 const { data, error } = await service.from('fleet_geofences').upsert({
  organization_id: profile.organization_id,
  branch_id: body.branch_id || null,
  name,
  geofence_type: type,
  latitude,
  longitude,
  radius_m: radius,
  is_active: true,
  created_by: profile.id,
  updated_at: new Date().toISOString(),
 }, { onConflict: 'organization_id,name' }).select('id').single();
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 if (body.branch_id) {
  await service.from('branches').update({ latitude, longitude, updated_at: new Date().toISOString() }).eq('id', body.branch_id).eq('organization_id', profile.organization_id);
 }
 return NextResponse.json({ ok: true, id: data.id });
}
