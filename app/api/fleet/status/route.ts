import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data } = await supabase.from('fleet_status_log').select(`
 id, status, location_description, logged_at,
 vehicle:vehicles(vehicle_code, vehicle_type),
 driver:drivers(full_name)
 `).eq('organization_id', profile.organization_id).order('logged_at', { ascending: false }).limit(30);

 return NextResponse.json({ logs: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'log_fleet_status', {
 p_vehicle_id: body.vehicle_id,
 p_driver_id: body.driver_id ?? null,
 p_status: body.status,
 p_location_description: body.location_description ?? null,
 p_gps_latitude: body.gps_latitude ?? null,
 p_gps_longitude: body.gps_longitude ?? null,
 p_notes: body.notes ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
