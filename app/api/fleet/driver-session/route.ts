import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const MANAGEMENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);
const REQUIRED_CHECKS = ['vehicle_condition', 'tyres', 'load_secured', 'documents'];

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (profile.role !== 'DRIVER' && !MANAGEMENT_ROLES.has(profile.role)) {
  return NextResponse.json({ error: 'Tiada akses untuk memulakan syif driver.' }, { status: 403 });
 }

 const body = await request.json() as {
  driver_id?: string;
  vehicle_id?: string;
  checklist?: Record<string, boolean>;
  odometer_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
 };
 if (!body.driver_id || !body.vehicle_id) {
  return NextResponse.json({ error: 'Driver dan kenderaan diperlukan.' }, { status: 400 });
 }
 const checklist = body.checklist ?? {};
 if (REQUIRED_CHECKS.some((key) => checklist[key] !== true)) {
  return NextResponse.json({ error: 'Lengkapkan semua semakan keselamatan sebelum mula.' }, { status: 400 });
 }

 const service = createAdminClient() as any;
 const { data: driver } = await service
  .from('drivers')
  .select('id, profile_id, status')
  .eq('id', body.driver_id)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (!driver || driver.status !== 'ACTIVE') return NextResponse.json({ error: 'Driver tidak aktif.' }, { status: 404 });
 if (profile.role === 'DRIVER' && driver.profile_id !== profile.id) {
  return NextResponse.json({ error: 'Driver hanya boleh memulakan syif sendiri.' }, { status: 403 });
 }

 const { data: vehicle } = await service
  .from('vehicles')
  .select('id, status')
  .eq('id', body.vehicle_id)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (!vehicle || vehicle.status !== 'ACTIVE') return NextResponse.json({ error: 'Kenderaan tidak tersedia.' }, { status: 404 });

 const { data: assignment } = await service
  .from('driver_vehicle_assignments')
  .select('id')
  .eq('organization_id', profile.organization_id)
  .eq('driver_id', body.driver_id)
  .eq('vehicle_id', body.vehicle_id)
  .eq('is_active', true)
  .maybeSingle();
 if (!assignment && profile.role === 'DRIVER') {
  return NextResponse.json({ error: 'Kenderaan ini belum ditetapkan kepada driver.' }, { status: 403 });
 }

 const { data, error } = await service.from('fleet_driver_sessions').insert({
  organization_id: profile.organization_id,
  driver_id: body.driver_id,
  vehicle_id: body.vehicle_id,
  profile_id: driver.profile_id ?? profile.id,
  status: 'ACTIVE',
  start_odometer_km: body.odometer_km ?? null,
  start_latitude: body.latitude ?? null,
  start_longitude: body.longitude ?? null,
  checklist,
  notes: body.notes?.trim() || null,
 }).select('id').single();
 if (error) {
  const message = error.code === '23505' ? 'Driver masih mempunyai syif aktif.' : error.message;
  return NextResponse.json({ error: message }, { status: 400 });
 }
 return NextResponse.json({ ok: true, session_id: data.id });
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const body = await request.json() as {
  session_id?: string;
  odometer_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
 };
 if (!body.session_id) return NextResponse.json({ error: 'Sesi diperlukan.' }, { status: 400 });

 const service = createAdminClient() as any;
 const { data: session } = await service
  .from('fleet_driver_sessions')
  .select('id, profile_id, status')
  .eq('id', body.session_id)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (!session || session.status !== 'ACTIVE') return NextResponse.json({ error: 'Sesi aktif tidak dijumpai.' }, { status: 404 });
 if (!MANAGEMENT_ROLES.has(profile.role) && session.profile_id !== profile.id) {
  return NextResponse.json({ error: 'Tiada akses untuk menutup sesi ini.' }, { status: 403 });
 }

 const { error } = await service.from('fleet_driver_sessions').update({
  status: 'COMPLETED',
  safe_driving_mode: false,
  current_route_stop_id: null,
  ended_at: new Date().toISOString(),
  end_odometer_km: body.odometer_km ?? null,
  end_latitude: body.latitude ?? null,
  end_longitude: body.longitude ?? null,
  notes: body.notes?.trim() || null,
  updated_at: new Date().toISOString(),
 }).eq('id', body.session_id).eq('organization_id', profile.organization_id);
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ ok: true });
}
