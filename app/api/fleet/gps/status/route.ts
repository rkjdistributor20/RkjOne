import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { jsonWithPrivateCache } from '@/lib/http/cache';
import { createClient } from '@/lib/supabase/server';
import { getCartrackFleetGpsStatus } from '@/lib/fleet/cartrack';

const GPS_VIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER', 'DRIVER']);

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!GPS_VIEW_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses untuk melihat GPS kenderaan.' }, { status: 403 });
 }

 const supabase = await createClient();
 let query = supabase
 .from('vehicles')
 .select('id, vehicle_code, plate_number, vehicle_type')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE')
 .order('vehicle_code');

 if (profile.role === 'DRIVER') {
  const { data: drivers } = await supabase
   .from('drivers')
   .select('id')
   .eq('organization_id', profile.organization_id)
   .eq('profile_id', profile.id)
   .eq('status', 'ACTIVE');
  const driverIds = ((drivers ?? []) as Array<{ id: string }>).map((driver) => driver.id);
  if (driverIds.length === 0) return jsonWithPrivateCache(await getCartrackFleetGpsStatus([]), 20, 40);
  const { data: assignments } = await supabase
   .from('driver_vehicle_assignments')
   .select('vehicle_id')
   .eq('organization_id', profile.organization_id)
   .eq('is_active', true)
   .in('driver_id', driverIds);
  const vehicleIds = [...new Set(((assignments ?? []) as Array<{ vehicle_id: string }>).map((assignment) => assignment.vehicle_id))];
  if (vehicleIds.length === 0) return jsonWithPrivateCache(await getCartrackFleetGpsStatus([]), 20, 40);
  query = query.in('id', vehicleIds);
 }

 const { data, error } = await query;

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 const result = await getCartrackFleetGpsStatus(data ?? []);
 return jsonWithPrivateCache(result, 20, 40);
}
