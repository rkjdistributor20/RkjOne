import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { jsonWithPrivateCache } from '@/lib/http/cache';
import { createClient } from '@/lib/supabase/server';
import { getCartrackFleetGpsStatus } from '@/lib/fleet/cartrack';

const GPS_VIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!GPS_VIEW_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses untuk melihat GPS kenderaan.' }, { status: 403 });
 }

 const supabase = await createClient();
 const { data, error } = await supabase
 .from('vehicles')
 .select('id, vehicle_code, plate_number, vehicle_type')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE')
 .order('vehicle_code');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 const result = await getCartrackFleetGpsStatus(data ?? []);
 return jsonWithPrivateCache(result, 20, 40);
}
