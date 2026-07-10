import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { jsonWithPrivateCache } from '@/lib/http/cache';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('vehicles').select(`
 id, vehicle_code, plate_number, vehicle_type, capacity, remarks,
 default_driver_id, status,
 fleet_status_log(status, logged_at)
 `).eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('vehicle_code');

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const rows = (data ?? []) as unknown as Array<{
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string;
 capacity: string | null;
 remarks: string | null;
 default_driver_id: string | null;
 status: string;
 fleet_status_log: Array<{ status: string; logged_at: string }> | null;
 }>;

 const vehicles = rows.map((v) => {
 const logs = v.fleet_status_log;
 const latest = logs?.sort(
 (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0];
 return {
 id: v.id,
 vehicle_code: v.vehicle_code,
 plate_number: v.plate_number,
 vehicle_type: v.vehicle_type,
 capacity: v.capacity,
 remarks: v.remarks,
 default_driver_id: v.default_driver_id,
 status: v.status,
 latest_status: latest?.status ?? null,
 };
 });

 return jsonWithPrivateCache({ vehicles }, 60, 180);
}
