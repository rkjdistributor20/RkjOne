import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { distanceKm } from '@/lib/fleet/gps-analytics';

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await params;
 const body = await request.json();
 if (!String(body.receiver_name ?? '').trim()) {
  return NextResponse.json({ error: 'Nama penerima diperlukan.' }, { status: 400 });
 }
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'submit_proof_of_delivery', {
 p_leg_id: id,
 p_receiver_name: String(body.receiver_name).trim(),
 p_receiver_signature_url: body.receiver_signature_url ?? null,
 p_gps_latitude: body.gps_latitude ?? null,
 p_gps_longitude: body.gps_longitude ?? null,
 p_driver_notes: body.driver_notes ?? null,
 p_image_urls: body.image_urls ?? [],
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 const result = data as { pod_id?: string } | null;
 if (result?.pod_id) {
  const service = (await createServiceClient()) as any;
  const { data: leg } = await service
   .from('delivery_legs')
   .select('to_location:inventory_locations!delivery_legs_to_location_id_fkey(branch_id)')
   .eq('id', id)
   .maybeSingle();
  const branchId = leg?.to_location?.branch_id ?? null;
  let geofenceId: string | null = null;
  let distanceM: number | null = null;
  let verification = 'GPS_UNAVAILABLE';

  if (body.gps_latitude != null && body.gps_longitude != null && branchId) {
   const { data: geofence } = await service
    .from('fleet_geofences')
    .select('id, latitude, longitude, radius_m')
    .eq('organization_id', profile.organization_id)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .maybeSingle();
   if (geofence) {
    geofenceId = geofence.id;
    distanceM = distanceKm(Number(body.gps_latitude), Number(body.gps_longitude), Number(geofence.latitude), Number(geofence.longitude)) * 1000;
    verification = distanceM <= Number(geofence.radius_m) ? 'WITHIN_GEOFENCE' : 'OUTSIDE_GEOFENCE';
   } else {
    verification = 'NOT_CHECKED';
   }
  }

  await service.from('proof_of_delivery').update({
   geofence_id: geofenceId,
   distance_from_destination_m: distanceM === null ? null : Math.round(distanceM * 100) / 100,
   gps_verification_status: verification,
  }).eq('id', result.pod_id).eq('organization_id', profile.organization_id);

  return NextResponse.json({ result: { ...result, gps_verification_status: verification, distance_from_destination_m: distanceM } });
 }
 return NextResponse.json({ result: data });
}
